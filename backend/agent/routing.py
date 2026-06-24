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

from web3 import Web3

from agent import agni, relay

logger = logging.getLogger("stockpilot.routing")


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
        "price_impact_bps": int(leg.get("price_impact_bps") or 0),
        "note": leg.get("note") or "",
    }


def best_usdy_buy(w3: Web3, wallet: str, requested_usdc: float) -> dict:
    """Quote both routers and return the better USDY-buy leg (common shape).

    The returned dict carries ``route_kind`` ("relay"|"agni"), the execution
    payload for that route, a ``routes`` comparison and a ``chosen_reason``.
    """
    relay_leg = relay.quote_usdy_buy(wallet, requested_usdc)
    agni_raw = agni.quote_usdy_buy(w3, requested_usdc)
    agni_leg = _agni_to_leg(agni_raw)

    routes = {"relay": _summary(relay_leg), "agni": _summary(agni_leg)}

    candidates = [leg for leg in (relay_leg, agni_leg) if leg.get("ok")]
    if not candidates:
        # Neither route could quote — return the Agni leg (carries held_usdc) so
        # the caller keeps the share as USDC, with both notes for the UI.
        chosen = agni_leg
        chosen["routes"] = routes
        chosen["chosen_reason"] = "no route available (relay: %s; agni: %s)" % (
            relay_leg.get("note") or "n/a", agni_leg.get("note") or "n/a")
        return chosen

    # Pick the route delivering the most USDY for the requested USDC.
    chosen = max(candidates, key=lambda l: float(l.get("quote_usdy") or 0.0))
    other = next((l for l in candidates if l is not chosen), None)
    if other is not None:
        delta = float(chosen["quote_usdy"]) - float(other["quote_usdy"])
        chosen["chosen_reason"] = (
            f"{chosen['route_kind']} {chosen['quote_usdy']:.6f} USDY vs "
            f"{other['route_kind']} {other['quote_usdy']:.6f} USDY "
            f"(+{delta:.6f} for the chosen route)"
        )
    else:
        only = "relay" if chosen.get("route_kind") == "relay" else "agni"
        skipped = "agni" if only == "relay" else "relay"
        chosen["chosen_reason"] = (
            f"{only} only ({skipped} unavailable: {routes[skipped]['note'] or 'n/a'})"
        )
    chosen["routes"] = routes
    logger.info("USDY route -> %s | %s", chosen.get("route_kind"), chosen["chosen_reason"])
    return chosen
