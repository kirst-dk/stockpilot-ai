"""AI-assisted pre-trade compliance gate for the RWA legs.

This is the executable counterpart of the ``/compliance`` page: before a plan is
returned (or executed), every leg is checked so restricted assets are *blocked and
surfaced honestly* rather than silently traded.

Three checks, run per cycle:
  1. Asset eligibility  — is this asset restricted for the connected region?
  2. Wallet screening    — is the connected address on a sanctioned denylist?
  3. Risk disclosure     — attach a per-asset securities/eligibility note.

Design notes:
  * Server-side geolocation is unreliable, so the region is supplied by the caller
    (the user's self-declared jurisdiction). The gate is therefore an *honesty /
    record-keeping* control, not a legal geofence — it never claims to be one.
  * The denylist is env-configurable (``OFAC_DENYLIST`` = comma-separated
    addresses) and pluggable for a real screening provider later.
"""
from __future__ import annotations

import logging
import os

logger = logging.getLogger("stockpilot.compliance")

# Regions where tokenized securities (xStocks, USDY) are restricted. Normalised to
# uppercase; both ISO codes and common names are accepted from the UI.
_US = {"US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"}
# OFAC-sanctioned jurisdictions (illustrative, env-extendable).
_SANCTIONED = {"CU", "CUBA", "IR", "IRAN", "KP", "NORTH KOREA", "SY", "SYRIA", "RU", "RUSSIA"}
_EXTRA = {r.strip().upper() for r in os.getenv("RESTRICTED_REGIONS_EXTRA", "").split(",") if r.strip()}
RESTRICTED_SECURITIES_REGIONS = _US | _SANCTIONED | _EXTRA

# Per-layer regulatory profile. mETH is a liquid-staking token (not a security), so
# it carries a disclosure but no jurisdictional restriction.
_LAYER_PROFILE = {
    "xstocks": {
        "asset_class": "tokenized equity (security)",
        "issuer": "Backed Finance",
        "restricted_regions": RESTRICTED_SECURITIES_REGIONS,
        "disclosure": "Tokenized equity (RWA security). KYC/eligibility enforced by the issuer at mint/redeem; not for US persons.",
    },
    "usdy": {
        "asset_class": "tokenized US Treasuries (security)",
        "issuer": "Ondo Finance",
        "restricted_regions": RESTRICTED_SECURITIES_REGIONS,
        "disclosure": "Tokenized US Treasuries (RWA security). Not available to US persons; KYC enforced by Ondo at mint/redeem.",
    },
    "meth": {
        "asset_class": "liquid-staking token",
        "issuer": "Mantle",
        "restricted_regions": set(),
        "disclosure": "Mantle staked-ETH (liquid-staking token, not a security).",
    },
}


def _norm_region(region: str | None) -> str:
    return (region or "").strip().upper()


def _denylist() -> set[str]:
    raw = os.getenv("OFAC_DENYLIST", "")
    return {a.strip().lower() for a in raw.split(",") if a.strip()}


def screen_wallet(address: str | None) -> dict:
    """Screen the connected wallet against the sanctioned-address denylist."""
    addr = (address or "").strip().lower()
    if not addr:
        return {"screened": False, "sanctioned": False, "reason": "no wallet connected"}
    sanctioned = addr in _denylist()
    return {
        "screened": True,
        "sanctioned": sanctioned,
        "reason": "address on sanctioned denylist" if sanctioned else "address cleared",
    }


def asset_compliance(layer: str, region: str | None) -> dict:
    """Eligibility + disclosure for a single asset layer in a given region."""
    prof = _LAYER_PROFILE.get((layer or "").lower())
    if not prof:
        return {"restricted": False, "reason": "", "disclosure": "", "asset_class": "", "issuer": ""}
    reg = _norm_region(region)
    restricted = bool(reg) and reg in prof["restricted_regions"]
    return {
        "restricted": restricted,
        "reason": (f"{prof['asset_class']} restricted for region {reg}" if restricted else ""),
        "disclosure": prof["disclosure"],
        "asset_class": prof["asset_class"],
        "issuer": prof["issuer"],
    }


def _block_leg(leg: dict, reason: str) -> None:
    """Mark a leg as compliance-blocked without silently dropping it."""
    leg["tradable"] = False
    leg["compliance_blocked"] = True
    leg["note"] = reason
    # Funds that would have bought this leg stay as USDC, surfaced honestly.
    leg["est_usd"] = 0.0


def gate_plan(plan: dict, region: str | None, wallet: str | None) -> dict:
    """Apply the pre-trade compliance gate to a built plan, in place.

    Hard-blocks any leg that is either (a) bound to a sanctioned wallet (OFAC
    screening) or (b) a restricted-jurisdiction asset for the self-declared
    region (e.g. tokenized securities for US persons). Blocked legs are surfaced
    honestly (``tradable=False`` + reason) and their USDC is kept, not silently
    traded. Attaches a ``compliance`` summary and returns the same plan dict.
    """
    reg = _norm_region(region)
    wallet_scan = screen_wallet(wallet)
    blocked: list[str] = []
    disclosures: dict[str, str] = {}
    held_back = 0.0
    usdy_held_back = 0.0

    legs = plan.get("legs") or []
    usdy_leg = plan.get("usdy_leg")

    def _consider(leg: dict, is_usdy: bool = False) -> None:
        nonlocal held_back, usdy_held_back
        layer = leg.get("layer", "")
        symbol = leg.get("symbol", layer)
        ac = asset_compliance(layer, reg)
        leg["compliance"] = {"disclosure": ac["disclosure"], "asset_class": ac["asset_class"], "issuer": ac["issuer"]}
        disclosures[symbol] = ac["disclosure"]
        block_reason = ""
        if wallet_scan["sanctioned"]:
            block_reason = "blocked: wallet failed sanctioned-address screening"
        elif ac["restricted"]:
            block_reason = f"blocked: restricted in {reg} — {ac['asset_class']}"
        if block_reason and leg.get("tradable") is not False:
            spend = float(leg.get("est_usd") or 0.0)
            held_back += spend
            if is_usdy:
                usdy_held_back += spend
            _block_leg(leg, block_reason)
            blocked.append(symbol)

    for leg in legs:
        _consider(leg)
    if usdy_leg:
        _consider(usdy_leg, is_usdy=True)

    # USDY share refused on compliance grounds stays as USDC, surfaced honestly.
    if usdy_held_back:
        plan["usdy_usdc_held"] = round(float(plan.get("usdy_usdc_held") or 0.0) + usdy_held_back, 4)

    plan["compliance"] = {
        "region": reg or "unspecified",
        "wallet": wallet_scan,
        "blocked": blocked,
        "blocked_usdc": round(held_back, 4),
        "disclosures": disclosures,
        "note": (
            "Self-declared jurisdiction gate — restricted assets are blocked for the "
            "declared region; sanctioned-address screening is a hard block."
        ),
    }
    if blocked:
        logger.info("compliance gate blocked %s (region=%s sanctioned=%s)", blocked, reg, wallet_scan["sanctioned"])
    return plan
