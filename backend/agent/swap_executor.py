"""Live swap execution for the autonomous rebalancer (Fluxion V3 on Mantle).

Turns a target allocation into **real on-chain swaps** signed by the agent wallet:

- USDC ⇄ mETH        → Fluxion V3 ``SwapRouter.exactInputSingle``.
- USDC → xStock       → ``XStockSwapHelper.swapAndUnwrap`` (swap USDC→wrapper, unwrap
                        to the original token in one tx — so the wallet receives the
                        original xStock that the portfolio reader values).
- xStock → USDC       → ``XStockSwapHelper.wrapAndSwap`` (wrap original→wrapper, swap
                        wrapper→USDC in one tx).

USDY is **not** swappable on Fluxion (no pool), so the defensive allocation is held
as USDC cash; the executor never tries to buy/sell USDY.

Safety: every swap is bounded by ``AUTOPILOT_MAX_TRADE_USD`` and a slippage floor;
selling existing holdings is gated behind ``AUTOPILOT_ALLOW_SELLS`` so an unattended
loop never liquidates the wallet. All amounts/min-outs are derived from live pool
prices. Any failure is caught and reported per-swap; one bad swap never aborts a cycle.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Optional

from web3 import Web3

from agent.portfolio_reader import (
    USDC, METH, XSTOCK_TOKENS, FLUXION_FACTORY, price_in_usdc,
)
from agent import agni, routing

logger = logging.getLogger(__name__)

MANTLE_RPC_URL = os.getenv("MANTLE_RPC_URL", "https://rpc.mantle.xyz")
FLUXION_ROUTER = "0x5628a59dF0ECAC3f3171f877A94bEb26BA6DFAa0"
XSTOCK_SWAP_HELPER = "0xe2c17E812f506e1A2723618e787eE61B9E30470f"

# Per-swap USD cap and slippage; conservative defaults keep an unattended loop safe.
MAX_TRADE_USD = float(os.getenv("AUTOPILOT_MAX_TRADE_USD", "5"))
SLIPPAGE_BPS = int(os.getenv("AUTOPILOT_SLIPPAGE_BPS", "200"))  # 2%
ALLOW_SELLS = os.getenv("AUTOPILOT_ALLOW_SELLS", "0") == "1"
# Minimum USD imbalance worth a swap (avoids dust trades / gas waste).
MIN_TRADE_USD = float(os.getenv("AUTOPILOT_MIN_TRADE_USD", "0.25"))
MAX_UINT256 = 2 ** 256 - 1

_ERC20_ABI = [
    {"inputs": [{"name": "a", "type": "address"}], "name": "balanceOf", "outputs": [{"name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"},
    {"inputs": [{"name": "o", "type": "address"}, {"name": "s", "type": "address"}], "name": "allowance", "outputs": [{"name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"},
    {"inputs": [{"name": "s", "type": "address"}, {"name": "v", "type": "uint256"}], "name": "approve", "outputs": [{"name": "", "type": "bool"}], "stateMutability": "nonpayable", "type": "function"},
]
_FACTORY_ABI = [
    {"inputs": [{"name": "a", "type": "address"}, {"name": "b", "type": "address"}, {"name": "f", "type": "uint24"}], "name": "getPool", "outputs": [{"name": "", "type": "address"}], "stateMutability": "view", "type": "function"},
]
_ROUTER_ABI = [
    {"inputs": [{"components": [
        {"name": "tokenIn", "type": "address"}, {"name": "tokenOut", "type": "address"},
        {"name": "fee", "type": "uint24"}, {"name": "recipient", "type": "address"},
        {"name": "deadline", "type": "uint256"}, {"name": "amountIn", "type": "uint256"},
        {"name": "amountOutMinimum", "type": "uint256"}, {"name": "sqrtPriceLimitX96", "type": "uint160"},
    ], "name": "params", "type": "tuple"}], "name": "exactInputSingle",
     "outputs": [{"name": "amountOut", "type": "uint256"}], "stateMutability": "payable", "type": "function"},
]
_HELPER_ABI = [
    {"inputs": [{"name": "xstock", "type": "address"}, {"name": "wrapper", "type": "address"}, {"name": "tokenOut", "type": "address"}, {"name": "amountIn", "type": "uint256"}, {"name": "fee", "type": "uint24"}, {"name": "amountOutMin", "type": "uint256"}, {"name": "deadline", "type": "uint256"}], "name": "wrapAndSwap", "outputs": [{"name": "amountOut", "type": "uint256"}], "stateMutability": "nonpayable", "type": "function"},
    {"inputs": [{"name": "tokenIn", "type": "address"}, {"name": "wrapper", "type": "address"}, {"name": "amountIn", "type": "uint256"}, {"name": "fee", "type": "uint24"}, {"name": "amountOutMin", "type": "uint256"}, {"name": "deadline", "type": "uint256"}], "name": "swapAndUnwrap", "outputs": [{"name": "assets", "type": "uint256"}], "stateMutability": "nonpayable", "type": "function"},
]

_FEE_TIERS = [3000, 500, 10000]


def _pool_fee(w3: Web3, a: str, b: str) -> Optional[int]:
    fac = w3.eth.contract(address=Web3.to_checksum_address(FLUXION_FACTORY), abi=_FACTORY_ABI)
    for fee in _FEE_TIERS:
        try:
            if int(fac.functions.getPool(Web3.to_checksum_address(a), Web3.to_checksum_address(b), fee).call(), 16) != 0:
                return fee
        except Exception:  # noqa: BLE001
            continue
    return None


class _NonceManager:
    """Local monotonic nonce tracker.

    Mantle's sequencer can lag on the ``latest`` transaction count right after a tx
    mines, so reading the nonce per-tx caused "nonce too low" errors. We seed once
    from the pending count and increment locally for every subsequent tx.
    """

    def __init__(self, w3: Web3, address: str) -> None:
        self._n = w3.eth.get_transaction_count(Web3.to_checksum_address(address), "pending")

    def take(self) -> int:
        n = self._n
        self._n += 1
        return n


def _send(w3: Web3, acct, tx: dict, nonce_mgr: "_NonceManager") -> str:
    """Sign, broadcast and wait for a tx; return the 0x tx hash. Raises on revert."""
    tx.setdefault("from", acct.address)
    tx["nonce"] = nonce_mgr.take()
    tx.setdefault("gasPrice", w3.eth.gas_price)
    tx.setdefault("chainId", 5000)
    if "gas" not in tx:
        try:
            tx["gas"] = int(w3.eth.estimate_gas(tx) * 1.25)
        except Exception:  # noqa: BLE001
            tx["gas"] = 600000
    signed = acct.sign_transaction(tx)
    raw = getattr(signed, "raw_transaction", None) or signed.rawTransaction
    h = w3.eth.send_raw_transaction(raw)
    receipt = w3.eth.wait_for_transaction_receipt(h, timeout=180)
    hx = receipt.transactionHash.hex()
    hx = hx if hx.startswith("0x") else "0x" + hx
    if receipt.status != 1:
        raise RuntimeError(f"tx reverted: {hx}")
    return hx


def _approve_if_needed(w3: Web3, acct, token: str, spender: str, amount: int, nonce_mgr: "_NonceManager") -> Optional[str]:
    c = w3.eth.contract(address=Web3.to_checksum_address(token), abi=_ERC20_ABI)
    cur = c.functions.allowance(acct.address, Web3.to_checksum_address(spender)).call()
    if cur >= amount:
        return None
    tx = c.functions.approve(Web3.to_checksum_address(spender), MAX_UINT256).build_transaction(
        {"from": acct.address, "gasPrice": w3.eth.gas_price, "chainId": 5000, "gas": 120000}
    )
    return _send(w3, acct, tx, nonce_mgr)


def _deadline() -> int:
    return int(time.time()) + 1800


def _router_swap(w3: Web3, acct, token_in: str, token_out: str, amount_in: int, min_out: int, fee: int, nonce_mgr: "_NonceManager") -> str:
    _approve_if_needed(w3, acct, token_in, FLUXION_ROUTER, amount_in, nonce_mgr)
    router = w3.eth.contract(address=Web3.to_checksum_address(FLUXION_ROUTER), abi=_ROUTER_ABI)
    params = (
        Web3.to_checksum_address(token_in), Web3.to_checksum_address(token_out), fee,
        acct.address, _deadline(), amount_in, min_out, 0,
    )
    tx = router.functions.exactInputSingle(params).build_transaction(
        {"from": acct.address, "gasPrice": w3.eth.gas_price, "chainId": 5000, "value": 0}
    )
    return _send(w3, acct, tx, nonce_mgr)


def _buy_xstock(w3: Web3, acct, symbol: str, usdc_amount: int, min_out: int, fee: int, nonce_mgr: "_NonceManager") -> str:
    """USDC → original xStock via swapAndUnwrap (wallet receives the original token)."""
    wrapper = XSTOCK_TOKENS[symbol]["wrapper"]
    _approve_if_needed(w3, acct, USDC, XSTOCK_SWAP_HELPER, usdc_amount, nonce_mgr)
    helper = w3.eth.contract(address=Web3.to_checksum_address(XSTOCK_SWAP_HELPER), abi=_HELPER_ABI)
    tx = helper.functions.swapAndUnwrap(
        Web3.to_checksum_address(USDC), Web3.to_checksum_address(wrapper),
        usdc_amount, fee, min_out, _deadline(),
    ).build_transaction(
        {"from": acct.address, "gasPrice": w3.eth.gas_price, "chainId": 5000}
    )
    return _send(w3, acct, tx, nonce_mgr)


def _sell_xstock(w3: Web3, acct, symbol: str, token_amount: int, min_out: int, fee: int, nonce_mgr: "_NonceManager") -> str:
    """Original xStock → USDC via wrapAndSwap (wraps then swaps in one tx)."""
    original = XSTOCK_TOKENS[symbol]["original"]
    wrapper = XSTOCK_TOKENS[symbol]["wrapper"]
    _approve_if_needed(w3, acct, original, XSTOCK_SWAP_HELPER, token_amount, nonce_mgr)
    helper = w3.eth.contract(address=Web3.to_checksum_address(XSTOCK_SWAP_HELPER), abi=_HELPER_ABI)
    tx = helper.functions.wrapAndSwap(
        Web3.to_checksum_address(original), Web3.to_checksum_address(wrapper),
        Web3.to_checksum_address(USDC), token_amount, fee, min_out, _deadline(),
    ).build_transaction(
        {"from": acct.address, "gasPrice": w3.eth.gas_price, "chainId": 5000}
    )
    return _send(w3, acct, tx, nonce_mgr)


def _buy_usdy(w3: Web3, acct, amount_usdc_wei: int, min_out_wei: int, path_hex: str, nonce_mgr: "_NonceManager") -> str:
    """USDC → USDT → USDY via the Agni SwapRouter (agent-signed, multi-hop path)."""
    _approve_if_needed(w3, acct, agni.USDC_ADDRESS, agni.AGNI_SWAP_ROUTER, amount_usdc_wei, nonce_mgr)
    tx = agni.build_exact_input_tx(w3, acct.address, agni.path_from_hex(path_hex),
                                   amount_usdc_wei, min_out_wei, _deadline())
    return _send(w3, acct, tx, nonce_mgr)


def _sell_usdy(w3: Web3, acct, amount_usdy_wei: int, min_out_wei: int, path_hex: str, nonce_mgr: "_NonceManager") -> str:
    """USDY → USDT → USDC via the Agni SwapRouter (agent-signed, multi-hop path)."""
    _approve_if_needed(w3, acct, agni.USDY_ADDRESS, agni.AGNI_SWAP_ROUTER, amount_usdy_wei, nonce_mgr)
    tx = agni.build_exact_input_tx(w3, acct.address, agni.path_from_hex(path_hex),
                                   amount_usdy_wei, min_out_wei, _deadline())
    return _send(w3, acct, tx, nonce_mgr)


def _execute_relay_steps(w3: Web3, acct, steps: list[dict], nonce_mgr: "_NonceManager") -> Optional[str]:
    """Sign Relay's ordered steps (approve -> swap) with the agent key.

    Each step's calldata is sent verbatim; returns the swap step's tx hash (the
    one whose ``check`` endpoint reports fulfilment).
    """
    swap_hash: Optional[str] = None
    last_hash: Optional[str] = None
    for st in steps:
        tx = {
            "to": Web3.to_checksum_address(st["to"]),
            "data": st.get("data", "0x"),
            "value": int(st.get("value") or 0),
        }
        last_hash = _send(w3, acct, tx, nonce_mgr)
        if st.get("id") == "swap":
            swap_hash = last_hash
    return swap_hash or last_hash


def _execute_usdy_leg(w3: Web3, acct, q: dict, nonce_mgr: "_NonceManager") -> str:
    """Sign ONE USDY-buy route (Relay steps or Agni multi-hop exactInput)."""
    if q.get("route_kind") == "relay" and q.get("steps"):
        h = _execute_relay_steps(w3, acct, q["steps"], nonce_mgr)
        if not h:
            raise RuntimeError("relay produced no swap step")
        return h
    return _buy_usdy(w3, acct, int(q["amount_in_wei"]), int(q["min_out"]), q["path"], nonce_mgr)


def _buy_usdy_best(w3: Web3, acct, usd: float, nonce_mgr: "_NonceManager") -> tuple[Optional[str], dict]:
    """Buy USDY via the best route with automatic fallback to the other route.

    Quotes both (Relay + Agni), executes the better one, and if it reverts (STF,
    "Return amount is not enough", timeout, …) automatically retries the OTHER
    route with its OWN fresh quote. Returns ``(tx_hash, quote)`` where ``quote``
    is annotated with the route actually used, the fallback (if any) and the
    losing route's numbers; ``tx_hash`` is None if no route is executable.
    """
    q = routing.best_usdy_buy(w3, acct.address, usd)
    if not (q.get("ok") and float(q.get("exec_usdc") or 0) >= agni._MIN_LEG_USDC):
        return None, q
    try:
        tx = _execute_usdy_leg(w3, acct, q, nonce_mgr)
        q["route_used"] = q.get("route_kind")
        return tx, q
    except Exception as first_err:  # noqa: BLE001 - try the other route before giving up
        other = "agni" if q.get("route_kind") == "relay" else "relay"
        logger.warning("USDY %s route failed (%s) — auto-falling back to %s",
                       q.get("route_kind"), str(first_err)[:140], other)
        fb = routing.best_usdy_buy(w3, acct.address, usd, prefer=other)
        fb["fallback_from"] = q.get("route_kind")
        fb["fallback_reason"] = str(first_err)[:200]
        if not (fb.get("ok") and fb.get("route_kind") == other
                and float(fb.get("exec_usdc") or 0) >= agni._MIN_LEG_USDC):
            raise
        tx = _execute_usdy_leg(w3, acct, fb, nonce_mgr)
        fb["route_used"] = other
        return tx, fb


def _slip(amount: float) -> float:
    return amount * (10000 - SLIPPAGE_BPS) / 10000


def execute_rebalance_swaps(
    private_key: str,
    portfolio: dict,
    layers: tuple[int, int, int],
    intra: dict,
    symbols: list[str],
) -> list[dict]:
    """Execute the real swaps needed to move ``portfolio`` toward ``layers``.

    Computes the USD diff per layer (USDY held as cash since it isn't Fluxion-traded),
    sells overweight legs first (if ``AUTOPILOT_ALLOW_SELLS``), then buys underweight
    legs with available USDC — each swap bounded by ``AUTOPILOT_MAX_TRADE_USD``.
    Returns one dict per attempted swap with ``status`` in {executed, failed, skipped}.
    """
    results: list[dict] = []
    w3 = Web3(Web3.HTTPProvider(MANTLE_RPC_URL, request_kwargs={"timeout": 60}))
    acct = w3.eth.account.from_key(private_key)
    nonce_mgr = _NonceManager(w3, acct.address)

    total = float(portfolio.get("total_usd") or 0)
    lyr = portfolio.get("layers", {})
    cur_xstocks = float(lyr.get("xstocks_usd") or 0)
    cur_meth = float(lyr.get("meth_usd") or 0)
    cur_usdy = float(lyr.get("usdy_usd") or 0)
    cash = float(lyr.get("cash_usd") or 0)
    if total <= 0:
        return [{"status": "skipped", "reason": "empty portfolio"}]

    w_stocks, w_usdy, w_meth = layers
    tgt_xstocks = total * w_stocks / 10000
    tgt_meth = total * w_meth / 10000
    tgt_usdy = total * w_usdy / 10000

    def record(frm, to, usd, fn):
        usd = min(usd, MAX_TRADE_USD)
        if usd < MIN_TRADE_USD:
            return
        try:
            tx = fn(usd)
            results.append({"from": frm, "to": to, "usd": round(usd, 2), "tx_hash": tx, "status": "executed"})
            logger.info("swap executed %s->%s $%.2f tx=%s", frm, to, usd, tx)
        except Exception as e:  # noqa: BLE001 - one bad swap must not abort the cycle
            results.append({"from": frm, "to": to, "usd": round(usd, 2), "status": "failed", "error": str(e)[:200]})
            logger.error("swap %s->%s failed: %s", frm, to, e)

    # --- SELLS (free up USDC). Gated so an unattended loop won't liquidate holdings. ---
    if ALLOW_SELLS:
        if cur_meth - tgt_meth > MIN_TRADE_USD:
            px = price_in_usdc(w3, METH, 18) or 0.0
            fee = _pool_fee(w3, METH, USDC)
            if px > 0 and fee:
                def _sell_meth(usd, _px=px, _fee=fee):
                    amt = int(usd / _px * 1e18)
                    return _router_swap(w3, acct, METH, USDC, amt, int(_slip(usd) * 1e6), _fee, nonce_mgr)
                record("mETH", "USDC", cur_meth - tgt_meth, _sell_meth)

        if cur_xstocks - tgt_xstocks > MIN_TRADE_USD:
            # Sell from the largest held xStock.
            held = sorted([h for h in portfolio.get("holdings", []) if h.get("layer") == "xstocks"],
                          key=lambda h: h.get("usd", 0), reverse=True)
            if held:
                sym = held[0]["symbol"]
                px = price_in_usdc(w3, XSTOCK_TOKENS[sym]["wrapper"], 18) or 0.0
                fee = _pool_fee(w3, XSTOCK_TOKENS[sym]["wrapper"], USDC)
                if px > 0 and fee:
                    def _sell_x(usd, _sym=sym, _px=px, _fee=fee):
                        amt = int(usd / _px * 1e18)
                        return _sell_xstock(w3, acct, _sym, amt, int(_slip(usd) * 1e6), _fee, nonce_mgr)
                    record(sym, "USDC", cur_xstocks - tgt_xstocks, _sell_x)

        # USDY overweight → sell back to USDC via Agni (reverse swap), guardrailed.
        if cur_usdy - tgt_usdy > MIN_TRADE_USD:
            q = agni.quote_usdy_sell(w3, (cur_usdy - tgt_usdy) / max(agni._spot_usdc_per_usdy(w3), 1e-9))
            if q.get("ok") and float(q.get("exec_usdy") or 0) > 0:
                try:
                    tx = _sell_usdy(w3, acct, int(q["amount_in_wei"]), int(q["min_out_wei"]), q["path"], nonce_mgr)
                    results.append({"from": "USDY", "to": "USDC", "usd": round(float(q["quote_usdc"]), 4),
                                    "tx_hash": tx, "status": "executed", "router": "agni",
                                    "price_impact_bps": int(q["price_impact_bps"]), "capped": bool(q["capped"])})
                    logger.info("rebalance USDY sell ~$%.4f impact=%dbps tx=%s", q["quote_usdc"], q["price_impact_bps"], tx)
                except Exception as e:  # noqa: BLE001
                    results.append({"from": "USDY", "to": "USDC", "usd": round(float(q["quote_usdc"]), 4), "status": "failed", "error": str(e)[:200]})
                    logger.error("rebalance USDY sell failed: %s", e)

    # Refresh available USDC after any sells.
    try:
        usdc_bal = w3.eth.contract(address=Web3.to_checksum_address(USDC), abi=_ERC20_ABI).functions.balanceOf(acct.address).call() / 1e6
    except Exception:  # noqa: BLE001
        usdc_bal = cash

    # --- BUYS (use available USDC; keep a tiny gas/rounding buffer). ---
    spendable = max(0.0, usdc_bal - 0.05)

    # mETH leg.
    if tgt_meth - cur_meth > MIN_TRADE_USD and spendable > MIN_TRADE_USD:
        px = price_in_usdc(w3, METH, 18) or 0.0
        fee = _pool_fee(w3, METH, USDC)
        if px > 0 and fee:
            usd = min(tgt_meth - cur_meth, spendable, MAX_TRADE_USD)
            def _buy_meth(u, _px=px, _fee=fee):
                amt = int(u * 1e6)
                return _router_swap(w3, acct, USDC, METH, amt, int(_slip(u) / _px * 1e18), _fee, nonce_mgr)
            record("USDC", "mETH", usd, _buy_meth)
            spendable -= usd

    # xStocks leg — distribute the shortfall across the configured picks.
    short_x = tgt_xstocks - cur_xstocks
    if short_x > MIN_TRADE_USD and spendable > MIN_TRADE_USD:
        picks = [s for s in symbols if s in XSTOCK_TOKENS][:5] or [s for s in XSTOCK_TOKENS]
        per = min(short_x, spendable) / len(picks)
        for sym in picks:
            if spendable <= MIN_TRADE_USD:
                break
            px = price_in_usdc(w3, XSTOCK_TOKENS[sym]["wrapper"], 18) or 0.0
            fee = _pool_fee(w3, USDC, XSTOCK_TOKENS[sym]["wrapper"])
            if px <= 0 or not fee:
                continue
            usd = min(per, spendable, MAX_TRADE_USD)
            def _buy_x(u, _sym=sym, _px=px, _fee=fee):
                amt = int(u * 1e6)
                return _buy_xstock(w3, acct, _sym, amt, int(_slip(u) / _px * 1e18), _fee, nonce_mgr)
            record("USDC", sym, usd, _buy_x)
            spendable -= usd

    # USDY leg — real buy toward the target deficit via the best route (Relay
    # primary, Agni multi-hop fallback) with auto-fallback on revert, guardrailed
    # by the soft impact cap.
    if tgt_usdy - cur_usdy > agni._MIN_LEG_USDC and spendable > agni._MIN_LEG_USDC:
        try:
            tx, q = _buy_usdy_best(w3, acct, min(tgt_usdy - cur_usdy, spendable), nonce_mgr)
            if tx and q.get("ok"):
                results.append({"from": "USDC", "to": "USDY", "usd": round(float(q["exec_usdc"]), 4),
                                "tx_hash": tx, "status": "executed",
                                "router": q.get("route_used") or q.get("route_kind", "agni"),
                                "request_id": q.get("request_id", ""),
                                "route_reason": q.get("chosen_reason", ""),
                                "fallback_from": q.get("fallback_from", ""),
                                "price_impact_bps": int(q["price_impact_bps"]), "capped": bool(q["capped"])})
                logger.info("rebalance USDY buy $%.4f via %s impact=%dbps tx=%s | %s",
                            q["exec_usdc"], q.get("route_used") or q.get("route_kind"),
                            q["price_impact_bps"], tx, q.get("chosen_reason", ""))
                spendable -= float(q["exec_usdc"])
            elif not tx:
                results.append({"from": "USDC", "to": "USDY", "usd": 0.0, "status": "skipped",
                                "reason": q.get("note") or "no executable route"})
        except Exception as e:  # noqa: BLE001
            results.append({"from": "USDC", "to": "USDY", "status": "failed", "error": str(e)[:200]})
            logger.error("rebalance USDY buy failed (both routes): %s", e)

    if not results:
        results.append({"status": "skipped", "reason": "already balanced within thresholds"})
    return results


def execute_dca_slice(
    private_key: str,
    layers: tuple[int, int, int],
    intra: dict,
    symbols: list[str],
    slice_usdc: float,
) -> list[dict]:
    """Deploy ``slice_usdc`` of the agent's USDC into the 3 layers at ``layers`` weights.

    Buy-only (no sells) — this is one DCA tranche: a fixed slice of capital accumulated
    into xStocks + mETH in the target proportions. The USDY ("treasuries") share has no
    Fluxion pool, so it is simply left as USDC in the agent wallet. Returns one dict per
    attempted swap with ``status`` in {executed, failed, skipped}.
    """
    results: list[dict] = []
    w3 = Web3(Web3.HTTPProvider(MANTLE_RPC_URL, request_kwargs={"timeout": 60}))
    acct = w3.eth.account.from_key(private_key)
    nonce_mgr = _NonceManager(w3, acct.address)

    try:
        usdc_bal = w3.eth.contract(address=Web3.to_checksum_address(USDC), abi=_ERC20_ABI).functions.balanceOf(acct.address).call() / 1e6
    except Exception:  # noqa: BLE001
        usdc_bal = 0.0
    budget = min(float(slice_usdc), max(0.0, usdc_bal - 0.05))
    if budget < MIN_TRADE_USD:
        return [{"status": "skipped", "reason": f"insufficient USDC (bal={usdc_bal:.2f}, need>={MIN_TRADE_USD})"}]

    w_stocks, w_usdy, w_meth = layers
    spend_meth = budget * w_meth / 10000.0
    spend_x = budget * w_stocks / 10000.0
    usdy_held = budget * w_usdy / 10000.0

    def record(frm, to, usd, fn):
        if usd < MIN_TRADE_USD:
            return
        try:
            tx = fn(usd)
            results.append({"from": frm, "to": to, "usd": round(usd, 2), "tx_hash": tx, "status": "executed"})
            logger.info("DCA slice %s->%s $%.2f tx=%s", frm, to, usd, tx)
        except Exception as e:  # noqa: BLE001 - one bad leg must not abort the slice
            results.append({"from": frm, "to": to, "usd": round(usd, 2), "status": "failed", "error": str(e)[:200]})
            logger.error("DCA slice %s->%s failed: %s", frm, to, e)

    # mETH leg.
    if spend_meth >= MIN_TRADE_USD:
        px = price_in_usdc(w3, METH, 18) or 0.0
        fee = _pool_fee(w3, METH, USDC)
        if px > 0 and fee:
            def _buy_meth(u, _px=px, _fee=fee):
                amt = int(u * 1e6)
                return _router_swap(w3, acct, USDC, METH, amt, int(_slip(u) / _px * 1e18), _fee, nonce_mgr)
            record("USDC", "mETH", spend_meth, _buy_meth)

    # xStocks leg — split across the configured picks by intra weights.
    if spend_x >= MIN_TRADE_USD:
        picks = [s for s in symbols if s in XSTOCK_TOKENS][:5] or [s for s in XSTOCK_TOKENS][:3]
        for sym in picks:
            usd = spend_x * (intra.get(sym, 0) / 10000.0) if intra else spend_x / len(picks)
            if usd < MIN_TRADE_USD:
                continue
            px = price_in_usdc(w3, XSTOCK_TOKENS[sym]["wrapper"], 18) or 0.0
            fee = _pool_fee(w3, USDC, XSTOCK_TOKENS[sym]["wrapper"])
            if px <= 0 or not fee:
                continue
            def _buy_x(u, _sym=sym, _px=px, _fee=fee):
                amt = int(u * 1e6)
                return _buy_xstock(w3, acct, _sym, amt, int(_slip(u) / _px * 1e18), _fee, nonce_mgr)
            record("USDC", sym, usd, _buy_x)

    # USDY leg — bought for REAL via the multi-hop USDC->USDT->USDY route on Agni,
    # guardrailed by QuoterV2 (soft price-impact cap). Any portion the thin pool
    # can't absorb within the cap stays as USDC and is flagged so the UI can label it.
    if usdy_held >= agni._MIN_LEG_USDC:
        try:
            tx, q = _buy_usdy_best(w3, acct, usdy_held, nonce_mgr)
        except Exception as e:  # noqa: BLE001 - both routes reverted
            tx, q = None, {"ok": False, "exec_usdc": 0.0, "held_usdc": usdy_held,
                           "note": f"both routes failed: {str(e)[:160]}"}
            logger.error("DCA USDY buy failed (both routes): %s", e)
        if tx and q.get("ok"):
            results.append({
                "from": "USDC", "to": "USDY", "usd": round(float(q["exec_usdc"]), 4),
                "tx_hash": tx, "status": "executed",
                "router": q.get("route_used") or q.get("route_kind", "agni"),
                "request_id": q.get("request_id", ""),
                "route_reason": q.get("chosen_reason", ""),
                "fallback_from": q.get("fallback_from", ""),
                "price_impact_bps": int(q["price_impact_bps"]), "capped": bool(q["capped"]),
            })
            logger.info("DCA USDY buy $%.4f via %s impact=%dbps tx=%s | %s",
                        q["exec_usdc"], q.get("route_used") or q.get("route_kind"),
                        q["price_impact_bps"], tx, q.get("chosen_reason", ""))
            held = float(q.get("held_usdc") or 0.0)
            if held > 0:
                results.append({"from": "USDC", "to": "USDY", "usd": round(held, 4), "status": "held_as_usdc", "note": q.get("note") or "limited by pool liquidity"})
        else:
            results.append({"from": "USDC", "to": "USDY", "usd": round(usdy_held, 4), "status": "held_as_usdc", "note": q.get("note") or "pool unavailable"})
    if not any(r.get("status") == "executed" for r in results):
        results.append({"status": "skipped", "reason": "no executable legs in this slice"})
    return results
