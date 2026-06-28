"""Agni Finance (Uniswap V3 fork on Mantle) — real USDC<->USDY swaps.

The direct USDC/USDY pool on Agni is one-sided (almost no USDY), so a single-hop
USDC->USDY swap prices terribly (~-58%). The real USDY liquidity sits in the
**USDY/USDT** pool, so we route through USDT:

    USDC --(fee 0.01%)--> USDT --(fee 0.01%)--> USDY     (buy)
    USDY --(fee 0.01%)--> USDT --(fee 0.01%)--> USDC     (sell)

This module provides:

- ``quote_usdy_buy`` / ``quote_usdy_sell`` — off-chain QuoterV2 ``quoteExactInput``
  simulation over the multi-hop ``path``. Returns the expected output, the
  slippage-protected ``min_out``, the encoded ``path`` (reused on-chain) and the
  real price-impact figure for the UI. Never trades blind.
- ``build_exact_input_tx`` — an unsigned ``exactInput(path, ...)`` tx on the Agni
  SwapRouter, used by the agent-signed executor (Autopilot/DCA). The user-signed
  Manual flow builds the same call in the frontend from the quote returned here.

Soft, configurable price-impact cap (``USDY_MAX_PRICE_IMPACT_BPS``, default 800 =
8%): if the full target's impact is within the cap it is swapped whole; otherwise
the leg is shrunk by binary search to the largest size whose impact is <= cap, the
rest is flagged "not executed: thin liquidity" (never silently held as USDC).
``min_out = quote * (1 - DEFAULT_SLIPPAGE_BPS)`` (default 1%) guards the on-chain
``amountOutMinimum``. A leg is only skipped when the route genuinely can't quote.

Decimals are handled explicitly: USDC = 6, USDT = 6, USDY = 18 (no "18 everywhere").
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from web3 import Web3

logger = logging.getLogger("stockpilot.agni")

# --- Addresses (Mantle mainnet, env-overridable) -------------------------------
AGNI_SWAP_ROUTER = Web3.to_checksum_address(
    os.getenv("AGNI_SWAP_ROUTER", "0x319B69888b0d11cEC22caA5034e25FfFBDc88421")
)
AGNI_QUOTER_V2 = Web3.to_checksum_address(
    os.getenv("AGNI_QUOTER_V2", "0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb")
)
USDC_ADDRESS = Web3.to_checksum_address(
    os.getenv("USDC_ADDRESS", "0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9")
)
USDT_ADDRESS = Web3.to_checksum_address(
    os.getenv("USDT_ADDRESS", "0x201eba5cc46d216ce6dc03f6a759e8e766e956ae")
)
USDY_ADDRESS = Web3.to_checksum_address(
    os.getenv("USDY_ADDRESS", "0x5bE26527e817998A7206475496fDE1E68957c5A6")
)

# --- Token decimals (verified on-chain) ----------------------------------------
USDC_DECIMALS = 6
USDT_DECIMALS = 6
USDY_DECIMALS = 18
_USDC_UNIT = 10 ** USDC_DECIMALS
_USDY_UNIT = 10 ** USDY_DECIMALS

# --- Config ---------------------------------------------------------------------
# Multi-hop route fees: USDC -hop1- USDT -hop2- USDY (both 0.01% pools on Agni).
USDY_HOP1_FEE = int(os.getenv("USDY_HOP1_FEE", "100"))   # USDC/USDT pool
USDY_HOP2_FEE = int(os.getenv("USDY_HOP2_FEE", "100"))   # USDT/USDY pool
# Soft, configurable price-impact cap. Within it -> full target; above it the leg
# is shrunk by binary search and the remainder flagged (never silently held).
USDY_MAX_PRICE_IMPACT_BPS = int(os.getenv("USDY_MAX_PRICE_IMPACT_BPS", "800"))
# Slippage on amountOutMinimum. The USDY pool is thin, so a tight 1% min-out is
# routinely unmet ("Return amount is not enough" / "Too little received") when the
# pool moves between quote and execution. The USDY leg therefore uses its OWN,
# wider tolerance (default 3%) instead of the generic DEFAULT_SLIPPAGE_BPS (1%).
DEFAULT_SLIPPAGE_BPS = int(os.getenv("DEFAULT_SLIPPAGE_BPS", "100"))
USDY_SLIPPAGE_BPS = int(os.getenv("USDY_SLIPPAGE_BPS", "300"))
# Dust floor: don't bother with legs smaller than this (USDC or USDC-equivalent).
_MIN_LEG_USDC = float(os.getenv("USDY_MIN_LEG_USDC", "0.01"))
# Probe size used to estimate the marginal (spot) rate without state change.
_SPOT_PROBE_USDC = 0.001
_SPOT_PROBE_USDY = 0.001

_QUOTER_MULTIHOP_ABI = [{
    "inputs": [{"name": "path", "type": "bytes"}, {"name": "amountIn", "type": "uint256"}],
    "name": "quoteExactInput", "outputs": [
        {"name": "amountOut", "type": "uint256"},
        {"name": "sqrtPriceX96AfterList", "type": "uint160[]"},
        {"name": "initializedTicksCrossedList", "type": "uint32[]"},
        {"name": "gasEstimate", "type": "uint256"}],
    "stateMutability": "nonpayable", "type": "function"}]

_ROUTER_EXACTINPUT_ABI = [{
    "inputs": [{"components": [
        {"name": "path", "type": "bytes"}, {"name": "recipient", "type": "address"},
        {"name": "deadline", "type": "uint256"}, {"name": "amountIn", "type": "uint256"},
        {"name": "amountOutMinimum", "type": "uint256"}], "name": "params", "type": "tuple"}],
    "name": "exactInput", "outputs": [{"name": "amountOut", "type": "uint256"}],
    "stateMutability": "payable", "type": "function"}]


# --- Path helpers ---------------------------------------------------------------
def _encode_path(tokens: list[str], fees: list[int]) -> bytes:
    """Uniswap V3 path: token0 (20b) + fee (3b) + token1 (20b) + fee (3b) + ..."""
    out = bytes.fromhex(tokens[0][2:] if tokens[0].startswith("0x") else tokens[0])
    for fee, tok in zip(fees, tokens[1:]):
        hex_tok = tok[2:] if tok.startswith("0x") else tok
        out += int(fee).to_bytes(3, "big") + bytes.fromhex(hex_tok)
    return out


def _buy_path() -> bytes:
    return _encode_path([USDC_ADDRESS, USDT_ADDRESS, USDY_ADDRESS], [USDY_HOP1_FEE, USDY_HOP2_FEE])


def _sell_path() -> bytes:
    return _encode_path([USDY_ADDRESS, USDT_ADDRESS, USDC_ADDRESS], [USDY_HOP2_FEE, USDY_HOP1_FEE])


ROUTE_LABEL_BUY = "USDC→USDT→USDY via Agni"
ROUTE_LABEL_SELL = "USDY→USDT→USDC via Agni"


def _quoter(w3: Web3):
    return w3.eth.contract(address=AGNI_QUOTER_V2, abi=_QUOTER_MULTIHOP_ABI)


def quote_exact_input(w3: Web3, path_bytes: bytes, amount_in_wei: int) -> int:
    """Return ``amountOut`` (wei) for an exact-input multi-hop swap via QuoterV2."""
    out = _quoter(w3).functions.quoteExactInput(path_bytes, int(amount_in_wei)).call()
    return int(out[0])


def _spot_usdy_per_usdc(w3: Web3, path: bytes) -> float:
    """Marginal USDY-per-USDC rate from a tiny probe quote (near-zero impact)."""
    amt = int(_SPOT_PROBE_USDC * _USDC_UNIT)
    out = quote_exact_input(w3, path, amt)
    return (out / _USDY_UNIT) / _SPOT_PROBE_USDC


def _spot_usdc_per_usdy(w3: Web3) -> float:
    """Marginal USDC-per-USDY rate from a tiny probe quote (near-zero impact)."""
    amt = int(_SPOT_PROBE_USDY * _USDY_UNIT)
    out = quote_exact_input(w3, _sell_path(), amt)
    return (out / _USDC_UNIT) / _SPOT_PROBE_USDY


def _impact_buy(w3: Web3, path: bytes, amount_usdc: float, spot: float) -> tuple[int, float]:
    """(price_impact_bps, quote_usdy) for buying USDY with ``amount_usdc`` USDC."""
    out = quote_exact_input(w3, path, int(round(amount_usdc * _USDC_UNIT)))
    usdy = out / _USDY_UNIT
    exec_rate = usdy / amount_usdc if amount_usdc > 0 else 0.0
    impact = max(0.0, (1.0 - exec_rate / spot)) * 10000.0 if spot > 0 else 1e9
    return int(round(impact)), usdy


def _impact_sell(w3: Web3, path: bytes, amount_usdy: float, spot: float) -> tuple[int, float]:
    """(price_impact_bps, quote_usdc) for selling ``amount_usdy`` USDY for USDC."""
    out = quote_exact_input(w3, path, int(round(amount_usdy * _USDY_UNIT)))
    usdc = out / _USDC_UNIT
    exec_rate = usdc / amount_usdy if amount_usdy > 0 else 0.0
    impact = max(0.0, (1.0 - exec_rate / spot)) * 10000.0 if spot > 0 else 1e9
    return int(round(impact)), usdc


def _largest_under_cap(w3: Web3, path: bytes, requested: float, spot: float,
                       cap_bps: int, side: str) -> float:
    """Binary-search the largest input whose price impact is <= ``cap_bps``.

    Impact is monotonic in size, so we bisect [0, requested]. Used only when the
    full target already exceeds the cap.
    """
    impact_fn = _impact_buy if side == "buy" else _impact_sell
    lo, hi = 0.0, requested
    for _ in range(24):
        mid = (lo + hi) / 2.0
        if mid <= 0:
            break
        imp, _out = impact_fn(w3, path, mid, spot)
        if imp <= cap_bps:
            lo = mid
        else:
            hi = mid
    return lo


def quote_usdy_buy(w3: Web3, requested_usdc: float, max_in_wei: Optional[int] = None) -> dict:
    """Plan a USDC->USDT->USDY buy for the requested amount (soft impact cap).

    Returns a dict describing the swap:
        ok, requested_usdc, exec_usdc, held_usdc (0 unless capped/no-pool),
        quote_usdy, min_out_wei, amount_in_wei, price_impact_bps, slippage_bps,
        capped, path, route, route_label, multihop, note.
    ``max_in_wei`` (when given) hard-caps the input to the wallet's real USDC
    balance so ``exactInput`` never reverts ``STF`` on a balance shortfall — the
    most common live failure when an earlier leg already spent some USDC.
    Never raises — a failed quote (no route / revert) marks the leg non-tradable so
    the caller can skip it and keep the rest as USDC.
    """
    requested_usdc = max(0.0, float(requested_usdc))
    balance_clamped = False
    if max_in_wei is not None:
        cap_usdc = max(0.0, int(max_in_wei) / _USDC_UNIT)
        if requested_usdc > cap_usdc:
            requested_usdc = cap_usdc
            balance_clamped = True
    path = _buy_path()
    base = {
        "ok": False, "side": "buy", "requested_usdc": round(requested_usdc, 6),
        "exec_usdc": 0.0, "held_usdc": round(requested_usdc, 6),
        "quote_usdy": 0.0, "min_out_wei": "0", "amount_in_wei": "0",
        "price_impact_bps": 0, "slippage_bps": USDY_SLIPPAGE_BPS, "capped": False,
        "router": AGNI_SWAP_ROUTER, "token_in": USDC_ADDRESS, "token_out": USDY_ADDRESS,
        "path": "0x" + path.hex(), "multihop": True,
        "route": "USDC->USDT->USDY", "route_label": ROUTE_LABEL_BUY,
        "max_impact_bps": USDY_MAX_PRICE_IMPACT_BPS, "note": "",
    }
    if requested_usdc < _MIN_LEG_USDC:
        base["note"] = ("insufficient USDC balance for the USDY leg"
                        if balance_clamped else "below dust floor")
        return base
    try:
        spot = _spot_usdy_per_usdc(w3, path)
        exec_usdc = requested_usdc
        impact_bps, quote_usdy = _impact_buy(w3, path, exec_usdc, spot)
        capped = False
        note = ""
        if impact_bps > USDY_MAX_PRICE_IMPACT_BPS:
            # Thin pool: shrink the leg to the largest size within the soft cap.
            exec_usdc = _largest_under_cap(w3, path, requested_usdc, spot, USDY_MAX_PRICE_IMPACT_BPS, "buy")
            if exec_usdc < _MIN_LEG_USDC:
                base["note"] = "not executed: thin liquidity (impact over cap)"
                return base
            impact_bps, quote_usdy = _impact_buy(w3, path, exec_usdc, spot)
            capped = True
            note = "partial: USDY leg reduced to keep impact within cap (thin liquidity)"
        if quote_usdy <= 0:
            base["note"] = "route unavailable — no USDY output quoted"
            return base
        min_out_wei = int(quote_usdy * _USDY_UNIT * (10000 - USDY_SLIPPAGE_BPS) / 10000)
        amount_in_wei = int(round(exec_usdc * _USDC_UNIT))
        # Hard safety clamp: never let float rounding push amount_in above balance.
        if max_in_wei is not None and amount_in_wei > int(max_in_wei):
            amount_in_wei = int(max_in_wei)
            exec_usdc = amount_in_wei / _USDC_UNIT
        if note and balance_clamped:
            note = (note + "; ").strip()
        if balance_clamped:
            note = (note + "input capped to wallet USDC balance").strip()
        base.update({
            "ok": True, "exec_usdc": round(exec_usdc, 6),
            "held_usdc": round(max(0.0, requested_usdc - exec_usdc), 6),
            "quote_usdy": round(quote_usdy, 8), "min_out_wei": str(min_out_wei),
            "amount_in_wei": str(amount_in_wei),
            "price_impact_bps": impact_bps, "slippage_bps": USDY_SLIPPAGE_BPS,
            "capped": capped, "note": note,
        })
        return base
    except Exception as e:  # noqa: BLE001
        logger.warning("quote_usdy_buy failed: %s", e)
        base["note"] = f"quote unavailable: {str(e)[:120]}"
        return base


def quote_usdy_sell(w3: Web3, requested_usdy: float) -> dict:
    """Plan a USDY->USDT->USDC sell for the requested amount (soft impact cap)."""
    requested_usdy = max(0.0, float(requested_usdy))
    path = _sell_path()
    base = {
        "ok": False, "side": "sell", "requested_usdy": round(requested_usdy, 8),
        "exec_usdy": 0.0, "held_usdy": round(requested_usdy, 8), "quote_usdc": 0.0,
        "min_out_wei": "0", "amount_in_wei": "0",
        "price_impact_bps": 0, "slippage_bps": USDY_SLIPPAGE_BPS, "capped": False,
        "router": AGNI_SWAP_ROUTER, "token_in": USDY_ADDRESS, "token_out": USDC_ADDRESS,
        "path": "0x" + path.hex(), "multihop": True,
        "route": "USDY->USDT->USDC", "route_label": ROUTE_LABEL_SELL,
        "max_impact_bps": USDY_MAX_PRICE_IMPACT_BPS, "note": "",
    }
    if requested_usdy <= 0:
        return base
    try:
        spot = _spot_usdc_per_usdy(w3)
        exec_usdy = requested_usdy
        impact_bps, quote_usdc = _impact_sell(w3, path, exec_usdy, spot)
        capped = False
        note = ""
        if impact_bps > USDY_MAX_PRICE_IMPACT_BPS:
            exec_usdy = _largest_under_cap(w3, path, requested_usdy, spot, USDY_MAX_PRICE_IMPACT_BPS, "sell")
            if exec_usdy <= 0:
                base["note"] = "not executed: thin liquidity (impact over cap)"
                return base
            impact_bps, quote_usdc = _impact_sell(w3, path, exec_usdy, spot)
            capped = True
            note = "partial: USDY leg reduced to keep impact within cap (thin liquidity)"
        if quote_usdc <= 0:
            base["note"] = "route unavailable — no USDC output quoted"
            return base
        min_out_wei = int(quote_usdc * _USDC_UNIT * (10000 - USDY_SLIPPAGE_BPS) / 10000)
        base.update({
            "ok": True, "exec_usdy": round(exec_usdy, 8),
            "held_usdy": round(max(0.0, requested_usdy - exec_usdy), 8),
            "quote_usdc": round(quote_usdc, 6), "min_out_wei": str(min_out_wei),
            "amount_in_wei": str(int(round(exec_usdy * _USDY_UNIT))),
            "price_impact_bps": impact_bps, "slippage_bps": USDY_SLIPPAGE_BPS,
            "capped": capped, "note": note,
        })
        return base
    except Exception as e:  # noqa: BLE001
        logger.warning("quote_usdy_sell failed: %s", e)
        base["note"] = f"quote unavailable: {str(e)[:120]}"
        return base


def build_exact_input_tx(w3: Web3, sender: str, path_bytes: bytes, amount_in_wei: int,
                         min_out_wei: int, deadline: int) -> dict:
    """Build (unsigned) Agni ``exactInput(path, ...)`` tx; recipient = ``sender``."""
    router = w3.eth.contract(address=AGNI_SWAP_ROUTER, abi=_ROUTER_EXACTINPUT_ABI)
    params = (
        path_bytes, Web3.to_checksum_address(sender), int(deadline),
        int(amount_in_wei), int(min_out_wei),
    )
    return router.functions.exactInput(params).build_transaction(
        {"from": Web3.to_checksum_address(sender), "gasPrice": w3.eth.gas_price, "chainId": 5000, "value": 0}
    )


def path_from_hex(path_hex: str) -> bytes:
    """Decode a ``0x``-prefixed path hex string back to bytes (for the executor)."""
    return bytes.fromhex(path_hex[2:] if path_hex.startswith("0x") else path_hex)
