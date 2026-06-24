"""Relay (relay.link) meta-aggregator — primary route for the USDY leg.

The direct USDC/USDY pool on Agni is one-sided (thin, ~$180), so a naive swap
prices terribly. Relay's solver network builds the best available route (usually
USDC->USDT->USDY) across Mantle DEX liquidity, lifting the per-trade liquidity
ceiling. We use it as the **primary** USDY route; Agni multi-hop stays as the
fallback (see ``agent.routing``).

Flow (same-chain swap on Mantle, chainId 5000):

1. ``POST {RELAY_QUOTE_URL}`` with origin==destination==Mantle, EXACT_INPUT,
   ``slippageTolerance`` in bps. The response carries:
   - ``details.currencyOut.amount`` — expected USDY out (18 dec, wei).
   - ``details.currencyOut.minimumAmount`` — slippage-protected min out (wei).
   - ``details.totalImpact.percent`` — honest price impact (%).
   - ``details.expandedPriceImpact`` — fee breakdown in USD (relay / app / swap /
     execution).
   - ``steps[].items[].data`` — ready-to-sign txs (approve then swap) with
     ``{to, data, value, chainId, ...}``.
   - the swap step's ``check`` endpoint (``/intents/status/v3?requestId=...``).
2. The caller signs each step's tx (non-custodial — user wallet in Manual, agent
   wallet in Autopilot/DCA), then polls the status endpoint until ``success``.

Soft, configurable price-impact cap (``USDY_MAX_PRICE_IMPACT_BPS``, default 800 =
8%): within the cap the full target is routed; above it the leg is shrunk by
binary search to the largest size whose impact is <= cap, and the remainder is
flagged "not executed: thin liquidity" (never silently held as USDC).

Decimals are explicit: USDC = 6, USDY = 18.
"""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request

logger = logging.getLogger("stockpilot.relay")

# --- Config (env-overridable) --------------------------------------------------
RELAY_QUOTE_URL = os.getenv("RELAY_QUOTE_URL", "https://api.relay.link/quote/v2")
RELAY_API_BASE = os.getenv("RELAY_API_BASE", "https://api.relay.link")
RELAY_CHAIN_ID = int(os.getenv("RELAY_CHAIN_ID", "5000"))
RELAY_CLIENT_ID = os.getenv("RELAY_CLIENT_ID", "stockpilot-ai")
# Kill-switch used by the fallback test (set RELAY_ENABLED=0 to force Agni).
RELAY_ENABLED = os.getenv("RELAY_ENABLED", "1") == "1"

USDC_ADDRESS = os.getenv("USDC_ADDRESS", "0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9")
USDY_ADDRESS = os.getenv("USDY_ADDRESS", "0x5bE26527e817998A7206475496fDE1E68957c5A6")

USDC_DECIMALS = 6
USDY_DECIMALS = 18
_USDC_UNIT = 10 ** USDC_DECIMALS
_USDY_UNIT = 10 ** USDY_DECIMALS

USDY_MAX_PRICE_IMPACT_BPS = int(os.getenv("USDY_MAX_PRICE_IMPACT_BPS", "800"))
DEFAULT_SLIPPAGE_BPS = int(os.getenv("DEFAULT_SLIPPAGE_BPS", "100"))
_MIN_LEG_USDC = float(os.getenv("USDY_MIN_LEG_USDC", "0.01"))
_HTTP_TIMEOUT = float(os.getenv("RELAY_HTTP_TIMEOUT", "30"))

ROUTE_LABEL_BUY = "USDC→USDT→USDY via Relay"


def _http(method: str, url: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    headers = {"x-client-id": RELAY_CLIENT_ID}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=_HTTP_TIMEOUT) as r:
        return json.load(r)


def _raw_quote(wallet: str, amount_in_wei: int) -> dict:
    """Raw Relay quote for an exact-input USDC->USDY swap on Mantle."""
    body = {
        "user": wallet,
        "recipient": wallet,
        "originChainId": RELAY_CHAIN_ID,
        "destinationChainId": RELAY_CHAIN_ID,
        "originCurrency": USDC_ADDRESS,
        "destinationCurrency": USDY_ADDRESS,
        "amount": str(int(amount_in_wei)),
        "tradeType": "EXACT_INPUT",
        "slippageTolerance": str(DEFAULT_SLIPPAGE_BPS),
    }
    return _http("POST", RELAY_QUOTE_URL, body)


def _impact_bps(q: dict) -> int:
    det = q.get("details", {})
    pct = det.get("totalImpact", {}).get("percent")
    try:
        return max(0, int(round(float(pct) * 100)))
    except (TypeError, ValueError):
        return 0


def _out_usdy(q: dict) -> float:
    amt = q.get("details", {}).get("currencyOut", {}).get("amount", "0")
    try:
        return int(amt) / _USDY_UNIT
    except (TypeError, ValueError):
        return 0.0


def _steps(q: dict) -> list[dict]:
    """Flatten Relay steps into ordered ready-to-sign txs.

    Each entry: {id, to, data, value, chainId}. ``id`` is the step kind
    ("approve"/"swap") so the executor can label/identify the swap tx.
    """
    out: list[dict] = []
    for st in q.get("steps", []):
        sid = st.get("id") or st.get("action") or "step"
        for it in st.get("items", []):
            d = it.get("data") or {}
            if not d.get("to"):
                continue
            out.append({
                "id": sid,
                "to": d["to"],
                "data": d.get("data", "0x"),
                "value": str(d.get("value", "0")),
                "chainId": int(d.get("chainId", RELAY_CHAIN_ID)),
            })
    return out


def _check_endpoint(q: dict) -> tuple[str, str]:
    """Return (request_id, status_endpoint_path) from the swap step's check."""
    for st in q.get("steps", []):
        for it in st.get("items", []):
            chk = it.get("check")
            if chk and chk.get("endpoint"):
                ep = chk["endpoint"]
                rid = ""
                if "requestId=" in ep:
                    rid = ep.split("requestId=", 1)[1].split("&", 1)[0]
                return rid, ep
    return "", ""


def _fees_usd(q: dict) -> dict:
    exp = q.get("details", {}).get("expandedPriceImpact", {})

    def usd(key: str) -> float:
        try:
            return float(exp.get(key, {}).get("usd", 0) or 0)
        except (TypeError, ValueError):
            return 0.0

    gas = 0.0
    try:
        gas = float(q.get("fees", {}).get("gas", {}).get("amountUsd", 0) or 0)
    except (TypeError, ValueError):
        gas = 0.0
    return {
        "relay_usd": round(abs(usd("relay")), 6),
        "app_usd": round(abs(usd("app")), 6),
        "swap_usd": round(abs(usd("swap")), 6),
        "execution_usd": round(abs(usd("execution")), 6),
        "gas_usd": round(gas, 6),
    }


def quote_usdy_buy(wallet: str, requested_usdc: float) -> dict:
    """Plan a USDC->USDY buy via Relay for ``requested_usdc`` (soft impact cap).

    Returns a leg dict shaped like ``agni.quote_usdy_buy`` plus Relay execution
    payload (``steps``, ``request_id``, ``check_endpoint``, ``fees``). Never
    raises — any failure marks the route unavailable so the caller falls back.
    """
    requested_usdc = max(0.0, float(requested_usdc))
    base = {
        "ok": False, "side": "buy", "route_kind": "relay",
        "requested_usdc": round(requested_usdc, 6),
        "exec_usdc": 0.0, "held_usdc": round(requested_usdc, 6),
        "quote_usdy": 0.0, "min_out": "0", "amount_in_wei": "0",
        "price_impact_bps": 0, "slippage_bps": DEFAULT_SLIPPAGE_BPS,
        "max_impact_bps": USDY_MAX_PRICE_IMPACT_BPS, "capped": False,
        "token_in": USDC_ADDRESS, "token_out": USDY_ADDRESS,
        "route_label": ROUTE_LABEL_BUY, "multihop": True,
        "steps": [], "request_id": "", "check_endpoint": "",
        "fees": {}, "note": "",
    }
    if not RELAY_ENABLED:
        base["note"] = "relay disabled"
        return base
    if not wallet:
        base["note"] = "relay needs a wallet address"
        return base
    if requested_usdc < _MIN_LEG_USDC:
        base["note"] = "below dust floor"
        return base
    try:
        exec_usdc = requested_usdc
        q = _raw_quote(wallet, int(round(exec_usdc * _USDC_UNIT)))
        impact = _impact_bps(q)
        capped = False
        note = ""
        if impact > USDY_MAX_PRICE_IMPACT_BPS:
            # Thin pool: shrink the leg to the largest size within the soft cap.
            lo, hi = 0.0, requested_usdc
            best_q, best_amt = None, 0.0
            for _ in range(12):
                mid = (lo + hi) / 2.0
                if mid < _MIN_LEG_USDC:
                    break
                qm = _raw_quote(wallet, int(round(mid * _USDC_UNIT)))
                if _impact_bps(qm) <= USDY_MAX_PRICE_IMPACT_BPS:
                    lo, best_q, best_amt = mid, qm, mid
                else:
                    hi = mid
            if best_q is None or best_amt < _MIN_LEG_USDC:
                base["note"] = "not executed: thin liquidity (impact over cap)"
                return base
            q, exec_usdc, capped = best_q, best_amt, True
            impact = _impact_bps(q)
            note = "partial: USDY leg reduced to keep impact within cap (thin liquidity)"

        out_usdy = _out_usdy(q)
        if out_usdy <= 0:
            base["note"] = "route unavailable — no USDY output quoted"
            return base
        det = q.get("details", {})
        min_out = det.get("currencyOut", {}).get("minimumAmount") or "0"
        amount_in = det.get("currencyIn", {}).get("amount") or str(int(round(exec_usdc * _USDC_UNIT)))
        rid, ep = _check_endpoint(q)
        base.update({
            "ok": True,
            "exec_usdc": round(exec_usdc, 6),
            "held_usdc": round(max(0.0, requested_usdc - exec_usdc), 6),
            "quote_usdy": round(out_usdy, 8),
            "min_out": str(int(min_out)),
            "amount_in_wei": str(int(amount_in)),
            "price_impact_bps": impact,
            "capped": capped,
            "steps": _steps(q),
            "request_id": rid,
            "check_endpoint": ep,
            "fees": _fees_usd(q),
            "note": note,
        })
        return base
    except urllib.error.HTTPError as e:  # noqa: BLE001
        logger.warning("relay quote HTTP %s: %s", e.code, e.read()[:200])
        base["note"] = f"relay unavailable: HTTP {e.code}"
        return base
    except Exception as e:  # noqa: BLE001
        logger.warning("relay quote failed: %s", e)
        base["note"] = f"relay unavailable: {str(e)[:120]}"
        return base


def get_status(request_id: str) -> dict:
    """Poll the Relay intent status (``/intents/status/v3?requestId=...``)."""
    if not request_id:
        return {"status": "unknown"}
    try:
        return _http("GET", f"{RELAY_API_BASE}/intents/status/v3?requestId={request_id}")
    except Exception as e:  # noqa: BLE001
        logger.warning("relay status failed: %s", e)
        return {"status": "error", "error": str(e)[:120]}
