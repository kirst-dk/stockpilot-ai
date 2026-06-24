"""Manual-cycle planning for user-wallet execution (Strategies tab).

The user enters a USDC amount and the agent returns a *plan*: the live regime, the
3-layer target weights (risk-profile aware) and a set of concrete swap *legs* the
user signs in ONE transaction via the on-chain ``StrategyExecutor``.

Rebalance semantics: legs are sized to move the *whole* portfolio toward the target
weights using only the freshly-supplied USDC (buy-side rebalance — no forced sells).
The agent reads the user's current on-chain holdings, computes each layer's deficit
vs. its target, and allocates the new capital to the under-weight layers in
proportion to those deficits. The USDY ("treasuries") layer has no Fluxion pool on
Mantle, so its share is simply left in the user's wallet as USDC.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Optional

from web3 import Web3

from agent.autopilot import (
    REGIME_LABELS,
    classify_regime,
    gather_signals,
    generate_reason,
    target_allocation,
)
from agent.portfolio_reader import (
    FLUXION_FACTORY,
    METH,
    USDC,
    _w3,
    price_in_usdc,
    read_agent_portfolio,
)
from agent.tokens import get_tradable_tokens
from agent import agni, routing, compliance

logger = logging.getLogger("stockpilot.manual")

# On-chain router that buys every layer from the user's USDC in a single tx.
STRATEGY_EXECUTOR = Web3.to_checksum_address(
    os.getenv("STRATEGY_EXECUTOR_ADDRESS", "0xbf478d30b4AFE3aD34C8F0D0085CCEFAba2cab33")
)

_FACTORY_ABI = [{
    "name": "getPool", "type": "function", "stateMutability": "view",
    "inputs": [{"type": "address"}, {"type": "address"}, {"type": "uint24"}],
    "outputs": [{"type": "address"}],
}]
_FEE_TIERS = [3000, 500, 10000, 100]
_MIN_LEG_USD = 0.05          # dust floor — skip legs smaller than this
# Fluxion (xStocks/mETH) slippage guard. Kept on its OWN env so the tighter USDY
# DEFAULT_SLIPPAGE_BPS (Agni/Relay, ~1%) never narrows the wide tolerance these
# thin xStock pools need. Price-impact caps are removed for Fluxion by design —
# the full target share is always swapped; slippage is the only min-out guard.
SLIPPAGE_BPS = int(os.getenv("FLUXION_SLIPPAGE_BPS", os.getenv("DEFAULT_FLUXION_SLIPPAGE_BPS", "1500")))
_SLIPPAGE = SLIPPAGE_BPS / 10000.0

# Fluxion QuoterV2 — pre-trade quote for every xStocks/mETH leg (Uniswap-V3 fork).
FLUXION_QUOTER_V2 = Web3.to_checksum_address(
    os.getenv("FLUXION_QUOTER_V2", "0x3E4eE18Ac7280813236a1EB850679Da5322E14CE")
)
# Uniswap-V3-style QuoterV2 takes a single struct param (Fluxion's fork matches).
_QUOTER_ABI = [{
    "name": "quoteExactInputSingle", "type": "function", "stateMutability": "nonpayable",
    "inputs": [{"components": [
        {"name": "tokenIn", "type": "address"},
        {"name": "tokenOut", "type": "address"},
        {"name": "amountIn", "type": "uint256"},
        {"name": "fee", "type": "uint24"},
        {"name": "sqrtPriceLimitX96", "type": "uint160"},
    ], "name": "params", "type": "tuple"}],
    "outputs": [
        {"name": "amountOut", "type": "uint256"},
        {"name": "sqrtPriceX96After", "type": "uint160"},
        {"name": "initializedTicksCrossed", "type": "uint32"},
        {"name": "gasEstimate", "type": "uint256"},
    ],
}]


def _quote_leg(w3: Web3, token_out: str, amount_usd: float, fee: int) -> dict:
    """Fluxion QuoterV2 pre-trade quote for USDC -> ``token_out``.

    Returns amount_out (wei, 18-dec), slippage-guarded min_out (wei), the real
    price impact vs the pool spot (bps) and the slippage (bps) applied. Never
    raises — a failed quote (no pool / no liquidity) marks the leg non-tradable so
    the orchestrator can skip it and still execute the other legs (partial exec).
    No price-impact cap: the full requested size is always quoted/executed.
    """
    amount_in = int(round(amount_usd * 1e6))  # USDC has 6 decimals
    if amount_in <= 0:
        return {"ok": False, "reason": "zero amount"}
    try:
        q = w3.eth.contract(address=FLUXION_QUOTER_V2, abi=_QUOTER_ABI)
        out = q.functions.quoteExactInputSingle((
            Web3.to_checksum_address(USDC), Web3.to_checksum_address(token_out),
            amount_in, int(fee), 0,
        )).call()
        amount_out = int(out[0])
    except Exception as e:  # noqa: BLE001
        logger.warning("Fluxion quote failed (%s fee=%s): %s", token_out, fee, e)
        return {"ok": False, "reason": "no Fluxion liquidity"}
    if amount_out <= 0:
        return {"ok": False, "reason": "zero output"}
    tokens_out = amount_out / 1e18
    exec_px = amount_usd / tokens_out if tokens_out > 0 else 0.0   # realised USDC/token
    spot = price_in_usdc(w3, token_out, 18) or exec_px
    impact_bps = int(round(abs(exec_px / spot - 1.0) * 10000)) if spot > 0 else 0
    return {
        "ok": True,
        "amount_out": amount_out,
        "min_out": int(amount_out * (1.0 - _SLIPPAGE)),
        "price_impact_bps": impact_bps,
        "slippage_bps": SLIPPAGE_BPS,
    }


def _meth_fee(w3: Web3) -> int:
    fac = w3.eth.contract(address=Web3.to_checksum_address(FLUXION_FACTORY), abi=_FACTORY_ABI)
    for fee in _FEE_TIERS:
        try:
            if int(fac.functions.getPool(
                Web3.to_checksum_address(METH), Web3.to_checksum_address(USDC), fee
            ).call().lower().replace("0x", ""), 16) != 0:
                return fee
        except Exception:  # noqa: BLE001
            continue
    return 3000


def _min_out(w3: Web3, token: str, usdc_amount_usd: float) -> int:
    """Token min-out (18-dec) for ``usdc_amount_usd`` of USDC, with slippage guard."""
    px = price_in_usdc(w3, token, 18) or 0.0
    if px <= 0:
        return 0
    expected = usdc_amount_usd / px
    return int(expected * (1.0 - _SLIPPAGE) * 1e18)


async def build_plan(
    amount_usdc: float,
    user_wallet: Optional[str],
    risk_profile: str = "balanced",
    symbols: Optional[list[str]] = None,
    region: Optional[str] = None,
) -> dict:
    """Compute the manual-cycle plan (regime + weights + signed-in-one-tx legs)."""
    if amount_usdc is None or amount_usdc <= 0:
        return {"ok": False, "error": "amount_usdc must be > 0"}

    tradable = {t["symbol"]: t for t in get_tradable_tokens()}
    if not tradable:
        return {"ok": False, "error": "no tradable tokens (Fluxion sync unavailable)"}

    # Flexible selection: 1..all of the live tradable xStocks (no min-3, no max-5).
    picks = [s for s in (symbols or []) if s in tradable]
    if not picks:
        return {"ok": False, "error": "select at least 1 xStock"}

    signals = await gather_signals(picks)
    regime, rule_reason = classify_regime(signals, risk_profile)
    layers, _intra = target_allocation(regime, picks, risk_profile)
    reason = await generate_reason(regime, signals, layers, rule_reason)
    w_stocks, w_usdy, w_meth = layers

    w3 = _w3()
    # Current holdings — informational (current-vs-target view), not used for sizing.
    cur_x = cur_m = 0.0
    if user_wallet:
        try:
            pf = read_agent_portfolio(user_wallet, picks)
            cur_x = float(pf["layers"].get("xstocks_usd") or 0.0)
            cur_m = float(pf["layers"].get("meth_usd") or 0.0)
        except Exception as e:  # noqa: BLE001
            logger.warning("portfolio read failed for %s: %s", user_wallet, e)

    invest = float(amount_usdc)
    # Each layer gets its weight share of the ENTERED amount (no forced sells).
    x_spend = invest * w_stocks / 10000.0
    m_spend = invest * w_meth / 10000.0
    usdy_held = max(0.0, invest - x_spend - m_spend)

    legs: list[dict] = []

    # Growth legs — the xStocks budget is split EQUALLY across the user's picks
    # (1 = 100%, 2 = 50/50, 3 ≈ 33% each …). The rounding remainder goes to the
    # first pick so the spent USDC reconciles 1:1 with the xStocks share.
    n = len(picks)
    per = round(x_spend / n, 6) if n else 0.0
    alloc = {sym: per for sym in picks}
    if n:
        alloc[picks[0]] = round(x_spend - per * (n - 1), 6)
    for sym in picks:
        amt = alloc.get(sym, 0.0)
        if amt < _MIN_LEG_USD:
            continue
        meta = tradable[sym]
        wrapper = Web3.to_checksum_address(meta["wrapper"])
        fee = int(meta["fee"])
        q = _quote_leg(w3, wrapper, amt, fee)
        leg = {
            "symbol": sym,
            "layer": "xstocks",
            "token_out": wrapper,
            "unwrap": True,
            "fee": fee,
            "amount_usdc": str(int(round(amt * 1e6))),
            "min_out": str(int(q.get("min_out", 0))),
            "est_usd": round(amt, 4),
            "price_impact_bps": int(q.get("price_impact_bps", 0)),
            "slippage_bps": int(q.get("slippage_bps", SLIPPAGE_BPS)),
            "tradable": bool(q.get("ok")),
            "note": "",
        }
        if not q.get("ok"):
            leg["note"] = q.get("reason", "no Fluxion liquidity")
        legs.append(leg)

    # Yield leg — mETH via Fluxion (no unwrap).
    if m_spend >= _MIN_LEG_USD:
        meth_fee = _meth_fee(w3)
        q = _quote_leg(w3, METH, m_spend, meth_fee)
        leg = {
            "symbol": "mETH",
            "layer": "meth",
            "token_out": Web3.to_checksum_address(METH),
            "unwrap": False,
            "fee": meth_fee,
            "amount_usdc": str(int(round(m_spend * 1e6))),
            "min_out": str(int(q.get("min_out", 0))),
            "est_usd": round(m_spend, 4),
            "price_impact_bps": int(q.get("price_impact_bps", 0)),
            "slippage_bps": int(q.get("slippage_bps", SLIPPAGE_BPS)),
            "tradable": bool(q.get("ok")),
            "note": "",
        }
        if not q.get("ok"):
            leg["note"] = q.get("reason", "no Fluxion liquidity")
        legs.append(leg)

    # USDY leg — bought for REAL via a multi-hop USDC->USDT->USDY swap on the Agni
    # SwapRouter (separate user-signed exactInput(path) tx). The direct USDC/USDY
    # pool is one-sided, so routing through the deep USDY/USDT pool gives a fair
    # price. Quoted via QuoterV2 quoteExactInput; the full share is swapped unless
    # the soft impact cap (USDY_MAX_PRICE_IMPACT_BPS) trims it — the trimmed part is
    # flagged "thin liquidity", not silently held. USDC is only kept back if the
    # route genuinely can't be quoted at all.
    usdy_leg: Optional[dict] = None
    usdy_quote: Optional[dict] = None
    if usdy_held >= agni._MIN_LEG_USDC:
        q = routing.best_usdy_buy(w3, user_wallet or "", usdy_held)
        usdy_quote = q
        if q.get("ok") and float(q.get("exec_usdc") or 0) >= agni._MIN_LEG_USDC:
            usdy_leg = {
                "symbol": "USDY",
                "layer": "usdy",
                "route_kind": q.get("route_kind", "agni"),
                "router": q.get("router"),
                "token_in": q.get("token_in"),
                "token_out": q.get("token_out"),
                "path": q.get("path"),
                "multihop": True,
                "route": q.get("route", "USDC->USDT->USDY"),
                "route_label": q.get("route_label", agni.ROUTE_LABEL_BUY),
                "amount_usdc": str(int(q["amount_in_wei"])),
                "min_out": str(int(q["min_out"])),
                "est_usd": round(float(q["exec_usdc"]), 4),
                "quote_usdy": q["quote_usdy"],
                "price_impact_bps": int(q["price_impact_bps"]),
                "slippage_bps": int(q.get("slippage_bps", agni.DEFAULT_SLIPPAGE_BPS)),
                "max_impact_bps": int(q.get("max_impact_bps", agni.USDY_MAX_PRICE_IMPACT_BPS)),
                "capped": bool(q.get("capped")),
                "fees": q.get("fees") or {},
                "routes": q.get("routes") or {},
                "chosen_reason": q.get("chosen_reason") or "",
                "note": q.get("note") or "",
            }
            # Whatever the soft cap trimmed (thin liquidity) stays as USDC.
            usdy_held = float(q.get("held_usdc") or 0.0)
        # else: route genuinely unavailable — the whole share stays as USDC (usdy_held unchanged).

    plan = {
        "ok": True,
        "regime": int(regime),
        "regime_label": REGIME_LABELS[regime],
        "risk_profile": risk_profile,
        "symbols": picks,
        "weights_percent": {
            "xstocks": round(w_stocks / 100.0, 1),
            "usdy": round(w_usdy / 100.0, 1),
            "meth": round(w_meth / 100.0, 1),
        },
        "weights_bps": {"xstocks": w_stocks, "usdy": w_usdy, "meth": w_meth},
        "signals": {
            "sentiment": round(signals.sentiment, 3),
            "smart_money": round(signals.smart_money, 3),
            "volatility": round(signals.volatility, 3),
            "usdy_yield_pct": round(signals.usdy_yield_pct, 3),
            "sources": signals.sources,
        },
        "reason": reason,
        "invest_usdc": round(invest, 2),
        "executor": STRATEGY_EXECUTOR,
        "usdc": Web3.to_checksum_address(USDC),
        "legs": legs,
        "usdy_leg": usdy_leg,
        "usdy_quote": usdy_quote,
        "usdy_usdc_held": round(usdy_held, 4),
        "current_usd": {"xstocks": round(cur_x, 2), "meth": round(cur_m, 2)},
        "total_target_usd": round(cur_x + cur_m + invest, 2),
        "deadline": int(time.time()) + 1800,
    }

    # AI-assisted pre-trade compliance gate: block restricted-asset legs / sanctioned
    # wallets and attach per-asset disclosures (surfaced honestly, never silent).
    compliance.gate_plan(plan, region, user_wallet)
    return plan
