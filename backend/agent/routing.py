"""USDY-leg route selection: Relay (primary) vs Agni multi-hop (fallback).

Both routers are quoted for the same requested USDC and the one returning more
USDY (net of fees — Relay's ``currencyOut.amount`` and Agni's QuoterV2 output are
both post-fee) is chosen. The soft impact cap is applied inside each router's
own quote function before the comparison, so a thin-pool trim never makes one
route look artificially better. The choice and the losing route's numbers are
logged and surfaced for an honest UI.
"""
from __future__ import annotations

import logging
from typing import Optional

from web3 import Web3

from agent import agni, relay

logger = logging.getLogger("stockpilot.routing")

_USDC_UNIT = 10 ** 6
_ERC20_BALANCE_ABI = [{
    "inputs": [{"name": "a", "type": "address"}], "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view", "type": "function"}]


def _usdc_balance_wei(w3: Web3, wallet: str) -> Optional[int]:
    """On-chain USDC balance (wei) of ``wallet`` — used to cap the swap input so a
    thin-balance leg never reverts ``STF`` / pulls more USDC than the wallet holds.
    Returns None if it can't be read (the caller then skips the balance cap)."""
    if not wallet:
        return None
    try:
        c = w3.eth.contract(address=Web3.to_checksum_address(agni.USDC_ADDRESS),
                            abi=_ERC20_BALANCE_ABI)
        return int(c.functions.balanceOf(Web3.to_checksum_address(wallet)).call())
    except Exception as e:  # noqa: BLE001
        logger.warning("USDC balance read failed for %s: %s", wallet, e)
        return None


def _net_per_usdc(leg: dict) -> float:
    """Net USDY received per 1 USDC actually spent (the fair cross-route metric).

    Both routers quote post-pool-fee output, so dividing the quoted USDY by the
    executed USDC normalises routes that executed different sizes (e.g. one got
    trimmed by the impact cap) onto the same per-USDC basis.
    """
    exec_usdc = float(leg.get("exec_usdc") or 0.0)
    if exec_usdc <= 0:
        return 0.0
    return float(leg.get("quote_usdy") or 0.0) / exec_usdc


def _agni_to_leg(q: dict) -> dict:
    """Normalise an Agni ``quote_usdy_buy`` dict to the common leg shape."""
    return {
        "ok": bool(q.get("ok")),
        "route_kind": "agni",
        "exec_usdc": float(q.get("exec_usdc") or 0.0),
        "held_usdc": float(q.get("held_usdc") or 0.0),
        "quote_usdy": float(q.get("quote_usdy") or 0.0),
        "amount_in_wei": str(q.get("amount_in_wei") or "0"),
        "min_out": str(q.get("min_out_wei") or "0"),
        "price_impact_bps": int(q.get("price_impact_bps") or 0),
        "slippage_bps": int(q.get("slippage_bps") or agni.DEFAULT_SLIPPAGE_BPS),
        "max_impact_bps": int(q.get("max_impact_bps") or agni.USDY_MAX_PRICE_IMPACT_BPS),
        "capped": bool(q.get("capped")),
        "token_in": q.get("token_in"),
        "token_out": q.get("token_out"),
        "router": q.get("router"),
        "path": q.get("path"),
        "multihop": True,
        "route_label": q.get("route_label", agni.ROUTE_LABEL_BUY),
        "fees": {},
        "steps": [],
        "request_id": "",
        "check_endpoint": "",
        "note": q.get("note") or "",
    }


def _summary(leg: dict) -> dict:
    """Compact per-route summary for logs / UI comparison."""
    return {
        "ok": bool(leg.get("ok")),
        "exec_usdc": round(float(leg.get("exec_usdc") or 0.0), 6),
        "quote_usdy": round(float(leg.get("quote_usdy") or 0.0), 8),
        "net_per_usdc": round(_net_per_usdc(leg), 8),
        "price_impact_bps": int(leg.get("price_impact_bps") or 0),
        "note": leg.get("note") or "",
    }


def best_usdy_buy(w3: Web3, wallet: str, requested_usdc: float,
                  prefer: Optional[str] = None) -> dict:
    """Quote both routers and return the better USDY-buy leg (common shape).

    Best-of-two: Relay and Agni are quoted in parallel for the SAME input (capped
    to the wallet's real USDC balance), each normalised to net USDY per 1 USDC,
    and the higher-yielding route is chosen. The returned dict carries
    ``route_kind`` ("relay"|"agni"), that route's execution payload, a ``routes``
    comparison, a ``chosen_reason`` and an ``alt`` payload (the other route, ready
    to execute) so the caller can auto-fall-back on revert without a re-quote.

    ``prefer`` ("relay"|"agni") forces a specific route when it's executable —
    used by the auto-fallback path to retry the OTHER route with its own fresh
    quote. When the preferred route can't quote, the best available is returned.
    """
    max_in_wei = _usdc_balance_wei(w3, wallet)

    relay_leg = relay.quote_usdy_buy(wallet, requested_usdc, max_in_wei=max_in_wei)
    agni_leg = _agni_to_leg(agni.quote_usdy_buy(w3, requested_usdc, max_in_wei=max_in_wei))
    by_kind = {"relay": relay_leg, "agni": agni_leg}

    routes = {"relay": _summary(relay_leg), "agni": _summary(agni_leg)}

    candidates = [leg for leg in (relay_leg, agni_leg) if leg.get("ok")]
    if not candidates:
        # Neither route could quote — return the Agni leg (carries held_usdc) so
        # the caller keeps the share as USDC, with both notes for the UI.
        chosen = agni_leg
        chosen["routes"] = routes
        chosen["alt"] = None
        chosen["chosen_reason"] = "no route available (relay: %s; agni: %s)" % (
            relay_leg.get("note") or "n/a", agni_leg.get("note") or "n/a")
        logger.info("USDY route -> none available | %s", chosen["chosen_reason"])
        return chosen

    # Honour an explicit preference (auto-fallback retry) when it's executable.
    chosen = None
    if prefer in by_kind and by_kind[prefer].get("ok"):
        chosen = by_kind[prefer]
    if chosen is None:
        # Pick the route with the best net USDY per USDC actually spent.
        chosen = max(candidates, key=_net_per_usdc)
    other = next((l for l in candidates if l is not chosen), None)

    if other is not None:
        cn, on = _net_per_usdc(chosen), _net_per_usdc(other)
        tag = "preferred" if (prefer in by_kind and chosen is by_kind.get(prefer)) else "best net"
        chosen["chosen_reason"] = (
            f"{tag}: {chosen['route_kind']} {cn:.6f} USDY/USDC vs "
            f"{other['route_kind']} {on:.6f} USDY/USDC "
            f"({chosen['quote_usdy']:.6f} vs {other['quote_usdy']:.6f} USDY total)"
        )
    else:
        only = chosen.get("route_kind")
        skipped = "agni" if only == "relay" else "relay"
        chosen["chosen_reason"] = (
            f"{only} only ({skipped} unavailable: {routes[skipped]['note'] or 'n/a'})"
        )
    chosen["routes"] = routes
    # Compact summary of the losing route, for the UI/logs. The auto-fallback path
    # re-quotes the other route fresh (prefer=<kind>) rather than reusing this.
    chosen["alt"] = ({"route_kind": other.get("route_kind"), **_summary(other)}
                     if other is not None else None)
    logger.info("USDY route -> %s | %s", chosen.get("route_kind"), chosen["chosen_reason"])
    return chosen
