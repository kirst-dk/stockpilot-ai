"""Autopilot — the Autonomous RWA Yield Agent for StockPilot AI.

This module turns StockPilot from a manual AI assistant into an **autonomous agent**
that, on a schedule (or on a volatility trigger / manual run), performs one full cycle:

    1. Gather signals  — ELFA sentiment, Nansen smart-money flow, realized-volatility proxy.
    2. Classify regime — rule thresholds (risk-profile aware) + LLM ("AltLLM") final call & reason.
    3. Target weights  — map regime -> 3-layer allocation (xStocks / USDY / mETH) + intra-xStocks.
    4. Diff + guardrails — vs the current portfolio, then enforce on-chain-mirrored guardrails.
    5. Execute swaps   — via Fluxion (XStockSwapHelper / V3), or dry-run when the wallet is unfunded.
    6. Record on-chain — call ``recordDecision`` on StockPilotAgent (the core hackathon criterion).
    7. Persist state   — for the Stocky Agent UI (history, current/target allocations, next run).

Every external dependency is wrapped with a fallback so a single outage never crashes the
cycle. The on-chain ``recordDecision`` is the source of truth for the activity feed; the UI can
also read it directly from the chain.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import statistics
import time
from dataclasses import dataclass, field, asdict
from enum import IntEnum
from typing import Optional

import httpx
from web3 import Web3

from strategies.rwa_balanced import (
    fetch_portfolio_sentiment,
    _read_usdy_yield,
)
from agent.portfolio_reader import read_agent_portfolio
from agent.swap_executor import execute_rebalance_swaps
from agent.compliance import asset_compliance, screen_wallet

logger = logging.getLogger(__name__)

# --- On-chain config (Mantle Mainnet, chainId 5000) ---
MANTLE_RPC_URL = os.getenv("MANTLE_RPC_URL", "https://rpc.mantle.xyz")
STOCKPILOT_CONTRACT_ADDRESS = os.getenv(
    "STOCKPILOT_CONTRACT_ADDRESS", "0xbbE80ACe5c46b49930ff0229762a1A57BE4CA6F4"
)
AGENT_PRIVATE_KEY = os.getenv("AGENT_PRIVATE_KEY") or os.getenv("DEPLOYER_PRIVATE_KEY")

# ERC-8004-style agent identity + reputation + verifiable-AI rationale anchor.
AGENT_IDENTITY_ADDRESS = os.getenv(
    "AGENT_IDENTITY_ADDRESS", "0x98611629c106FCf8Dc35A28a2db3a59638DB237a"
)

# On-chain, verifiable pre-trade compliance attestations (StockPilotComplianceAttestor).
COMPLIANCE_ATTESTOR_ADDRESS = os.getenv(
    "COMPLIANCE_ATTESTOR_ADDRESS", "0x6d8aADb868CF8d2C7031d593D78b11119D0f3e72"
)
# Self-declared jurisdiction the compliance gate is evaluated against each cycle. xStocks/USDY
# are tokenized securities (not for US persons); default to a permitted jurisdiction.
AUTOPILOT_REGION = os.getenv("AUTOPILOT_REGION", "CH")

# Three-layer tokens on Mantle.
USDY_TOKEN = os.getenv("USDY_TOKEN_ADDRESS", "0x5bE26527e817998A7206475496fDE1E68957c5A6")
METH_TOKEN = os.getenv("METH_TOKEN_ADDRESS", "0xcDA86A272531e8640cD7F1a92c01839911B90bb0")
USDC_TOKEN = os.getenv("USDC_ADDRESS", "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9")

# Real swaps only fire when explicitly enabled AND the wallet holds assets; otherwise the
# swap leg is simulated (dry-run) while the decision is still recorded on-chain for real.
LIVE_SWAPS = os.getenv("AUTOPILOT_LIVE_SWAPS", "0") == "1"

# Nansen smart-money proxy (key-stripping reverse proxy the frontend already uses).
NANSEN_BASE_URL = os.getenv("NANSEN_BASE_URL", "https://app.stockpilotai.xyz/api/nansen")

# AltLayer LLM ("AltLLM") — OpenAI-compatible gateway used as the agent's reasoning
# brain and a sentiment fallback. Routed through the same key-stripping nginx proxy.
ALTLLM_BASE_URL = os.getenv("ALTLLM_BASE_URL", "https://app.stockpilotai.xyz/api/altllm")
ALTLLM_MODEL = os.getenv("ALTLLM_MODEL", "altllm-standard")

# Notional portfolio value (USD) used to size the simulated rebalance when the agent
# wallet is unfunded, so the activity feed shows realistic swap amounts.
NOTIONAL_USD = float(os.getenv("AUTOPILOT_NOTIONAL_USD", "10000"))

# Default rebalance interval (seconds). Default 6h per spec.
DEFAULT_INTERVAL_SEC = int(os.getenv("AUTOPILOT_INTERVAL_SEC", str(6 * 3600)))

# Minimal ABI for recordDecision + reads.
AGENT_ABI = [
    {
        "name": "recordDecision",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "regime", "type": "uint8"},
            {"name": "wStocks", "type": "uint16"},
            {"name": "wUSDY", "type": "uint16"},
            {"name": "wMETH", "type": "uint16"},
            {"name": "reason", "type": "string"},
        ],
        "outputs": [{"name": "index", "type": "uint256"}],
    },
    {
        "name": "getDecisionCount",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "uint256"}],
    },
]

# Minimal ABI for the ERC-8004 identity contract's rationale anchor.
IDENTITY_ABI = [
    {
        "name": "anchorRationale",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "decisionRef", "type": "uint256"},
            {"name": "rationaleHash", "type": "bytes32"},
        ],
        "outputs": [{"name": "anchorIndex", "type": "uint256"}],
    },
    {
        "name": "getAnchorCount",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "uint256"}],
    },
]

# Minimal ABI for the on-chain compliance attestor.
COMPLIANCE_ABI = [
    {
        "name": "attestCompliance",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "decisionRef", "type": "uint256"},
            {"name": "passed", "type": "bool"},
            {"name": "region", "type": "string"},
            {"name": "blockedCount", "type": "uint16"},
            {"name": "complianceHash", "type": "bytes32"},
        ],
        "outputs": [{"name": "attestationIndex", "type": "uint256"}],
    },
    {
        "name": "getAttestationCount",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "uint256"}],
    },
    {
        "name": "verifyCompliance",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "report", "type": "string"}],
        "outputs": [{"name": "", "type": "bool"}],
    },
]


class Regime(IntEnum):
    RISK_OFF = 0
    NEUTRAL = 1
    RISK_ON = 2


REGIME_LABELS = {Regime.RISK_OFF: "risk-off", Regime.NEUTRAL: "neutral", Regime.RISK_ON: "risk-on"}

# Risk-profile -> regime -> layer weights in basis points (xStocks, USDY, mETH).
# Each row sums to 10000 and stays within the contract guardrails (<=7500 per layer;
# USDY>=5000 in risk-off). The profile shifts the target mix within every regime, so
# Conservative leans into USDY treasuries while Aggressive leans into xStocks growth.
PROFILE_REGIME_WEIGHTS_BPS = {
    "conservative": {
        Regime.RISK_ON:  (4000, 4000, 2000),
        Regime.NEUTRAL:  (2500, 5500, 2000),
        Regime.RISK_OFF: (1000, 7500, 1500),
    },
    "balanced": {
        Regime.RISK_ON:  (5000, 2500, 2500),
        Regime.NEUTRAL:  (4000, 4000, 2000),
        Regime.RISK_OFF: (2000, 6500, 1500),
    },
    "aggressive": {
        Regime.RISK_ON:  (5500, 2000, 2500),
        Regime.NEUTRAL:  (4500, 3500, 2000),
        Regime.RISK_OFF: (2500, 5500, 2000),
    },
}


def regime_weights_bps(regime: Regime, risk_profile: str) -> tuple[int, int, int]:
    """Layer weights (bps) for a regime under a risk profile (defaults to balanced)."""
    table = PROFILE_REGIME_WEIGHTS_BPS.get(risk_profile, PROFILE_REGIME_WEIGHTS_BPS["balanced"])
    return table[regime]


# Backward-compatible alias (balanced profile) for callers that don't pass a profile.
REGIME_WEIGHTS_BPS = PROFILE_REGIME_WEIGHTS_BPS["balanced"]

# Risk profile shifts the regime thresholds. Conservative leans defensive; aggressive
# reaches for risk-on sooner.
# Thresholds are on the normalized composite score in [-1, 1] (see classify_regime).
RISK_PROFILES = {
    "conservative": {"on": 0.35, "off": 0.00, "vol_off": 0.62},
    "balanced": {"on": 0.18, "off": -0.18, "vol_off": 0.72},
    "aggressive": {"on": 0.05, "off": -0.35, "vol_off": 0.82},
}

DEFAULT_SYMBOLS = ["AAPLx", "NVDAx", "SPYx"]


@dataclass
class Signals:
    sentiment: float = 0.0          # ELFA, [-1, 1]
    smart_money: float = 0.0        # Nansen net flow, [-1, 1]
    volatility: float = 0.5         # proxy, [0, 1] (0 calm, 1 turbulent)
    usdy_yield_pct: float = 0.0
    sources: dict = field(default_factory=dict)  # which signals were live vs fallback


@dataclass
class DecisionRecord:
    ts: int
    regime: int
    regime_label: str
    w_stocks_bps: int
    w_usdy_bps: int
    w_meth_bps: int
    xstocks: dict           # symbol -> bps within the xStocks layer
    reason: str
    signals: dict
    swaps: list             # planned swaps (simulated or executed)
    tx_hash: Optional[str]
    simulated: bool
    portfolio: Optional[dict] = None  # real on-chain holdings snapshot (live cycles)
    rationale_hash: Optional[str] = None  # keccak256(reason) committed on-chain (ERC-8004 anchor)
    anchor_tx_hash: Optional[str] = None  # tx that anchored the rationale hash on the identity contract
    compliance_report: Optional[str] = None  # exact pre-trade compliance verdict string (hashed on-chain)
    compliance_passed: Optional[bool] = None  # True when no leg was compliance-blocked this cycle
    compliance_blocked: list = field(default_factory=list)  # layers blocked by the gate
    compliance_hash: Optional[str] = None  # keccak256(compliance_report) committed on-chain
    compliance_tx_hash: Optional[str] = None  # tx that attested the compliance verdict on-chain


# --- Signal gathering ---

async def _nansen_post(path: str, body: dict) -> Optional[list]:
    """POST to the key-stripping Nansen proxy (same one the frontend uses).

    The proxy mounts the upstream Nansen API under ``/api/v1/...``; the frontend
    therefore calls ``{NANSEN_BASE}/api/v1/...`` with a JSON body. Returns the
    ``data`` rows, or None on any failure (so the cycle never blocks).
    """
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post(f"{NANSEN_BASE_URL}{path}", json=body)
            resp.raise_for_status()
            data = resp.json()
            return data.get("data") or data.get("result") or []
    except Exception as e:  # noqa: BLE001 - Nansen outage is non-fatal
        logger.warning("Nansen POST %s failed: %s", path, e)
        return None


async def _fetch_market_signals(symbols: list[str]) -> tuple[float, float, Optional[float], dict]:
    """Derive live signals from Nansen, returning (smart_money, breadth, volatility, sources).

    - smart_money  : net direction of smart-money 24h USD flow across the biggest
                     movers, in [-1, 1]. Sampled symmetrically (top inflows AND top
                     outflows) and magnitude-weighted, so the sign reflects whether
                     professional flow is net buying or selling. The old DESC-only
                     query cherry-picked the most positive tokens and saturated at +1.00.
    - breadth      : fraction of top-by-volume Mantle tokens whose 24h price is up,
                     remapped to [-1, 1] — an unbiased market-wide sentiment proxy.
    - volatility   : realized-volatility proxy in [0, 1] from the dispersion (stddev) of
                     24h price changes across Mantle tokens, or None if unavailable.
    """
    sources = {"nansen_flow": "fallback", "nansen_breadth": "fallback", "volatility": "proxy"}
    smart_money, breadth, volatility = 0.0, 0.0, None

    # Symmetric basket: biggest inflows (DESC) + biggest outflows (ASC). Combining both
    # tails removes the positive bias; magnitude-weighting keeps the signal directional
    # (near 0 when buying/selling pressure is balanced, not pinned to ±1).
    inflows = await _nansen_post(
        "/api/v1/smart-money/netflow",
        {
            "chains": ["ethereum", "mantle"],
            "order_by": [{"field": "net_flow_24h_usd", "direction": "DESC"}],
            "pagination": {"page": 1, "per_page": 50},
        },
    ) or []
    outflows = await _nansen_post(
        "/api/v1/smart-money/netflow",
        {
            "chains": ["ethereum", "mantle"],
            "order_by": [{"field": "net_flow_24h_usd", "direction": "ASC"}],
            "pagination": {"page": 1, "per_page": 50},
        },
    ) or []
    seen: dict[str, float] = {}
    for r in list(inflows) + list(outflows):
        key = (r.get("token_address") or r.get("token_symbol") or "").lower()
        if key and key not in seen:
            seen[key] = float(r.get("net_flow_24h_usd") or 0)
    flows = [f for f in seen.values() if f != 0]
    if flows:
        gross = sum(abs(f) for f in flows)
        smart_money = max(-1.0, min(1.0, sum(flows) / gross)) if gross > 0 else 0.0
        sources["nansen_flow"] = "live"

    screener = await _nansen_post(
        "/api/v1/token-screener",
        {
            "chains": ["mantle"],
            "timeframe": "24h",
            "pagination": {"page": 1, "per_page": 50},
            "order_by": [{"field": "volume", "direction": "DESC"}],
        },
    )
    if screener:
        changes = [float(r.get("price_change") or 0) for r in screener]
        changes = [c for c in changes if c != 0]
        if changes:
            up = sum(1 for c in changes if c > 0)
            breadth = max(-1.0, min(1.0, (up / len(changes)) * 2 - 1))
            sources["nansen_breadth"] = "live"
            if len(changes) > 1:
                # price_change is a fraction (e.g. 0.03 = +3%); dispersion → [0,1].
                disp = statistics.pstdev(changes)
                volatility = max(0.0, min(1.0, disp * 8.0))
                sources["volatility"] = "live"

    return smart_money, breadth, volatility, sources


async def _altllm_sentiment(
    symbols: list[str], smart_money: float, breadth: float, volatility: float
) -> Optional[float]:
    """AltLayer LLM sentiment read in [-1, 1], best-effort (None on failure).

    AltLLM is an agentic, verbose model, so we give it room and parse the sentiment
    number out of either the content or its reasoning trace. Never blocks a cycle.
    """
    tickers = ", ".join(s[:-1] if s.endswith("x") else s for s in symbols[:5])
    prompt = (
        f"Market snapshot: smart-money flow={smart_money:+.2f} in [-1,1], "
        f"price breadth={breadth:+.2f} in [-1,1], volatility={volatility:.2f} in [0,1]. "
        f"Watchlist: {tickers}. Judging risk appetite for AI/tech equities and crypto, "
        f'reply with ONLY JSON {{"sentiment": x}} where x is a number in [-1,1]. '
        f"Do not call tools; answer directly."
    )
    try:
        async with httpx.AsyncClient(timeout=35.0) as client:
            resp = await client.post(
                f"{ALTLLM_BASE_URL}/v1/chat/completions",
                json={
                    "model": ALTLLM_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 400,
                    "temperature": 0.2,
                },
            )
            resp.raise_for_status()
            msg = ((resp.json().get("choices") or [{}])[0]).get("message", {}) or {}
            text = f"{msg.get('content') or ''} {msg.get('reasoning_content') or ''}"
            m = re.search(r'sentiment"?\s*[:=]\s*(-?\d*\.?\d+)', text)
            if not m:
                m = re.search(r"-?\d*\.\d+", msg.get("content") or "")
            if m:
                return max(-1.0, min(1.0, float(m.group(1) if m.lastindex else m.group(0))))
    except Exception as e:  # noqa: BLE001 - AltLLM outage is non-fatal
        logger.warning("AltLLM sentiment failed: %s", e)
    return None


async def gather_signals(symbols: list[str]) -> Signals:
    """Collect live Nansen flow/breadth/volatility, ELFA sentiment and USDY yield.

    Sentiment precedence: live ELFA text polarity if available (free tier rarely
    returns tweet text), else the live Nansen market-breadth proxy, else neutral.
    A manual ``AUTOPILOT_VOL_OVERRIDE`` in [0,1] always wins for volatility (useful
    to demo a risk-off stress scenario on demand).
    """
    sent_task = asyncio.create_task(fetch_portfolio_sentiment(symbols))
    market_task = asyncio.create_task(_fetch_market_signals(symbols))
    yield_pct, oracle_ok = await asyncio.to_thread(_read_usdy_yield)

    elfa_sentiment, sent_fallback = await sent_task
    smart_money, breadth, live_vol, msrc = await market_task

    # Sentiment precedence: live ELFA text > AltLayer LLM read > live Nansen breadth
    # > neutral. AltLLM gives a genuine, varied sentiment when ELFA's free tier is empty.
    if not sent_fallback:
        sentiment, sent_src = elfa_sentiment, "elfa-live"
    else:
        alt = await _altllm_sentiment(
            symbols, smart_money, breadth, live_vol if live_vol is not None else 0.5
        )
        if alt is not None:
            sentiment, sent_src = alt, "altllm-live"
        elif msrc.get("nansen_breadth") == "live":
            sentiment, sent_src = breadth, "nansen-breadth"
        else:
            sentiment, sent_src = 0.0, "fallback"

    # Volatility: manual override > live dispersion > calm baseline.
    override = os.getenv("AUTOPILOT_VOL_OVERRIDE")
    if override is not None:
        try:
            volatility, vol_src = max(0.0, min(1.0, float(override))), "override"
        except ValueError:
            volatility, vol_src = (live_vol if live_vol is not None else 0.40), msrc["volatility"]
    elif live_vol is not None:
        volatility, vol_src = live_vol, "live"
    else:
        volatility, vol_src = 0.40, "proxy"

    return Signals(
        sentiment=round(sentiment, 4),
        smart_money=round(smart_money, 4),
        volatility=round(volatility, 4),
        usdy_yield_pct=round(yield_pct, 4) if yield_pct is not None else 0.0,
        sources={
            "elfa_sentiment": sent_src,
            "nansen_flow": msrc["nansen_flow"],
            "usdy_oracle": "live" if oracle_ok else "fallback",
            "volatility": vol_src,
        },
    )


async def _per_ticker_sentiment(symbols: list[str]) -> list[float]:
    """Per-ticker ELFA polarity, reusing the strategy's single-ticker helper."""
    from strategies.rwa_balanced import _elfa_ticker_sentiment  # local import avoids cycle

    out: list[float] = []
    async with httpx.AsyncClient() as client:
        for sym in symbols[:5]:
            base = sym[:-1] if sym.endswith("x") else sym
            try:
                s = await _elfa_ticker_sentiment(client, base)
                if s is not None:
                    out.append(s)
            except Exception:  # noqa: BLE001
                continue
    return out


# --- Regime classification ---

def classify_regime(signals: Signals, risk_profile: str) -> tuple[Regime, str]:
    """Rule-based regime classification, risk-profile aware.

    Risk appetite = mean(sentiment, smart_money) in [-1, 1]; a volatility penalty
    pulls the composite down as volatility exceeds the calm midpoint. The profile
    shifts both the score thresholds and the hard volatility-off trigger, so the
    same signals can map to different regimes per profile.
    """
    prof = RISK_PROFILES.get(risk_profile, RISK_PROFILES["balanced"])
    risk_appetite = (signals.sentiment + signals.smart_money) / 2.0  # [-1, 1]
    vol_penalty = max(0.0, (signals.volatility - 0.5)) * 0.8
    score = risk_appetite - vol_penalty

    if signals.volatility >= prof["vol_off"] or score <= prof["off"]:
        regime = Regime.RISK_OFF
    elif score >= prof["on"] and signals.volatility < prof["vol_off"]:
        regime = Regime.RISK_ON
    else:
        regime = Regime.NEUTRAL

    src = signals.sources or {}
    rule_reason = (
        f"[{risk_profile}] sent={signals.sentiment:+.2f}({src.get('elfa_sentiment', '?')}) "
        f"flow={signals.smart_money:+.2f}({src.get('nansen_flow', '?')}) "
        f"vol={signals.volatility:.2f}({src.get('volatility', '?')}) "
        f"=> score={score:+.2f} -> {REGIME_LABELS[regime]}"
    )
    return regime, rule_reason


def target_allocation(
    regime: Regime, symbols: list[str], risk_profile: str = "balanced"
) -> tuple[tuple[int, int, int], dict]:
    """Return ((wStocks,wUSDY,wMETH) bps, {symbol: bps_within_xstocks_layer})."""
    layers = regime_weights_bps(regime, risk_profile)
    picks = [s for s in symbols if s][:5] or DEFAULT_SYMBOLS
    n = len(picks)
    base = 10000 // n
    intra = {s: base for s in picks}
    intra[picks[-1]] += 10000 - base * n  # absorb rounding remainder
    return layers, intra


async def generate_reason(
    regime: Regime, signals: Signals, layers: tuple[int, int, int], rule_reason: str
) -> str:
    """AltLayer LLM ("AltLLM") final rationale + a compact live/fallback feed map.

    The feed map is always appended so the on-chain ``reason`` is transparent about
    which data was live this cycle vs which fell back to a proxy/neutral default.
    """
    s, u, m = (x / 100 for x in layers)
    src = signals.sources or {}
    feed_tag = (
        f" | feeds: sentiment={src.get('elfa_sentiment', '?')}, "
        f"nansen={src.get('nansen_flow', '?')}, vol={src.get('volatility', '?')}, "
        f"usdy={src.get('usdy_oracle', '?')}"
    )
    fallback = (
        f"Regime: {REGIME_LABELS[regime]}. Target {s:.0f}% xStocks / {u:.0f}% USDY / "
        f"{m:.0f}% mETH. {rule_reason}. USDY yield {signals.usdy_yield_pct:.2f}%."
    )
    base_reason = fallback
    try:
        async with httpx.AsyncClient(timeout=40.0) as client:
            resp = await client.post(
                f"{ALTLLM_BASE_URL}/v1/chat/completions",
                json={
                    "model": ALTLLM_MODEL,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are StockPilot AI's autonomous RWA yield agent on Mantle. "
                                "In 1-2 concise sentences justify the 3-layer allocation (xStocks "
                                "growth / USDY treasuries / mETH staking yield). State the regime "
                                "and the key signals. No preamble, no lists. Do not call tools."
                            ),
                        },
                        {
                            "role": "user",
                            "content": (
                                f"Regime={REGIME_LABELS[regime]}; sentiment={signals.sentiment:+.2f}; "
                                f"smart_money={signals.smart_money:+.2f}; volatility={signals.volatility:.2f}; "
                                f"USDY_yield={signals.usdy_yield_pct:.2f}%; target % "
                                f"stocks/usdy/meth={s:.0f}/{u:.0f}/{m:.0f}."
                            ),
                        },
                    ],
                    "max_tokens": 400,
                    "temperature": 0.4,
                },
            )
            resp.raise_for_status()
            text = (
                ((resp.json().get("choices") or [{}])[0]).get("message", {}).get("content") or ""
            ).strip()
            if text:
                base_reason = text
    except Exception as e:  # noqa: BLE001
        logger.warning("AltLLM regime reason failed, using fallback: %s", e)
    return (base_reason[:170] + feed_tag)


# --- Guardrails (mirror the on-chain checks so we fail fast off-chain) ---

def check_guardrails(regime: Regime, layers: tuple[int, int, int]) -> Optional[str]:
    """Return an error string if the allocation violates guardrails, else None."""
    w_stocks, w_usdy, w_meth = layers
    if w_stocks + w_usdy + w_meth != 10000:
        return "weights must sum to 10000"
    cap = 7500
    if max(layers) > cap:
        return f"asset weight exceeds guardrail ({cap} bps)"
    if regime == Regime.RISK_OFF and w_usdy < 5000:
        return "USDY below risk-off minimum (5000 bps)"
    return None


# --- Swap planning + execution ---

def plan_rebalance(layers: tuple[int, int, int], intra: dict, notional_usd: float) -> list[dict]:
    """Build the list of swaps to reach the target allocation from USDC notional.

    For the demo (unfunded wallet) this is the intended trade set; amounts are derived
    from the notional portfolio value so the activity feed shows realistic sizing.
    """
    w_stocks, w_usdy, w_meth = layers
    swaps: list[dict] = []
    usdy_usd = notional_usd * w_usdy / 10000
    meth_usd = notional_usd * w_meth / 10000
    if usdy_usd > 0:
        swaps.append({"from": "USDC", "to": "USDY", "to_address": USDY_TOKEN, "usd": round(usdy_usd, 2)})
    if meth_usd > 0:
        swaps.append({"from": "USDC", "to": "mETH", "to_address": METH_TOKEN, "usd": round(meth_usd, 2)})
    stocks_usd = notional_usd * w_stocks / 10000
    for sym, bps in intra.items():
        usd = stocks_usd * bps / 10000
        if usd > 0:
            swaps.append({"from": "USDC", "to": sym, "usd": round(usd, 2), "layer": "xStocks"})
    return swaps


def _agent_holds_assets(w3: Web3, wallet: str) -> bool:
    """True if the wallet holds any tradable capital — USDC/USDY/mETH OR an xStock.

    Checks ORIGINAL xStock addresses (and their wrappers), not just USDC/USDY/mETH,
    so a wallet funded only with e.g. NVDAx still counts as funded.
    """
    from agent.portfolio_reader import XSTOCK_TOKENS

    erc = [{"name": "balanceOf", "type": "function", "inputs": [{"type": "address"}],
            "outputs": [{"type": "uint256"}], "stateMutability": "view"}]
    addrs = [USDY_TOKEN, METH_TOKEN, USDC_TOKEN]
    for reg in XSTOCK_TOKENS.values():
        addrs.extend((reg["original"], reg["wrapper"]))
    for addr in addrs:
        try:
            c = w3.eth.contract(address=Web3.to_checksum_address(addr), abi=erc)
            if c.functions.balanceOf(Web3.to_checksum_address(wallet)).call() > 0:
                return True
        except Exception:  # noqa: BLE001
            continue
    return False


def _parse_next_nonce(err_msg: str) -> Optional[int]:
    """Extract the suggested nonce from a Mantle 'nonce too low: next nonce N' error."""
    m = re.search(r"next nonce (\d+)", err_msg)
    return int(m.group(1)) if m else None


def record_decision_onchain(
    regime: Regime, layers: tuple[int, int, int], reason: str
) -> Optional[str]:
    """Sign and broadcast ``recordDecision`` on StockPilotAgent. Returns tx hash or None.

    The reason is truncated to keep calldata/gas bounded. Runs synchronously (web3);
    callers should offload via ``asyncio.to_thread``.
    """
    if not AGENT_PRIVATE_KEY:
        logger.warning("No AGENT_PRIVATE_KEY/DEPLOYER_PRIVATE_KEY — skipping on-chain record")
        return None
    try:
        w3 = Web3(Web3.HTTPProvider(MANTLE_RPC_URL, request_kwargs={"timeout": 30}))
        acct = w3.eth.account.from_key(AGENT_PRIVATE_KEY)
        contract = w3.eth.contract(
            address=Web3.to_checksum_address(STOCKPILOT_CONTRACT_ADDRESS), abi=AGENT_ABI
        )
        w_stocks, w_usdy, w_meth = layers
        # Seed from pending so we account for any swap txs broadcast earlier in
        # this same cycle. On Mantle the sequencer can briefly report a stale
        # count, so we retry and adopt the "next nonce N" it suggests.
        nonce = w3.eth.get_transaction_count(acct.address, "pending")
        last_err: Optional[Exception] = None
        for _attempt in range(6):
            tx = contract.functions.recordDecision(
                int(regime), int(w_stocks), int(w_usdy), int(w_meth), reason[:240]
            ).build_transaction({
                "from": acct.address,
                "nonce": nonce,
                "gas": 400000,
                "gasPrice": w3.eth.gas_price,
                "chainId": 5000,
            })
            signed = acct.sign_transaction(tx)
            # web3.py v6 exposes `rawTransaction`; v7 renamed it to `raw_transaction`.
            raw = getattr(signed, "raw_transaction", None) or signed.rawTransaction
            try:
                tx_hash = w3.eth.send_raw_transaction(raw)
            except Exception as send_err:  # noqa: BLE001
                last_err = send_err
                suggested = _parse_next_nonce(str(send_err))
                if suggested is not None and suggested != nonce:
                    logger.warning(
                        "recordDecision nonce %s rejected; retrying with %s",
                        nonce, suggested,
                    )
                    nonce = suggested
                    continue
                nonce += 1  # generic bump and retry
                continue
            receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            h = receipt.transactionHash.hex()
            if not h.startswith("0x"):
                h = "0x" + h
            logger.info("recordDecision tx mined: %s (status=%s)", h, receipt.status)
            return h
        logger.error("On-chain recordDecision failed after retries: %s", last_err)
        return None
    except Exception as e:  # noqa: BLE001
        logger.error("On-chain recordDecision failed: %s", e)
        return None


def _read_decision_count() -> int:
    """Read StockPilotAgent.getDecisionCount() so we can reference the just-recorded decision."""
    w3 = Web3(Web3.HTTPProvider(MANTLE_RPC_URL, request_kwargs={"timeout": 15}))
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(STOCKPILOT_CONTRACT_ADDRESS), abi=AGENT_ABI
    )
    return int(contract.functions.getDecisionCount().call())


def anchor_rationale_onchain(decision_ref: int, reason: str) -> tuple[Optional[str], Optional[str]]:
    """Anchor keccak256(reason) on the ERC-8004 identity contract. Returns (rationale_hash, tx_hash).

    This is the verifiable-AI step: the exact rationale the UI shows is hashed and committed
    on-chain next to the decision, so anyone can later call ``verifyRationale(reason)`` and get
    MATCH. Runs synchronously (web3); callers should offload via ``asyncio.to_thread``.
    """
    if not AGENT_PRIVATE_KEY or not AGENT_IDENTITY_ADDRESS:
        return None, None
    try:
        w3 = Web3(Web3.HTTPProvider(MANTLE_RPC_URL, request_kwargs={"timeout": 30}))
        acct = w3.eth.account.from_key(AGENT_PRIVATE_KEY)
        rationale_hash = Web3.keccak(text=reason)
        contract = w3.eth.contract(
            address=Web3.to_checksum_address(AGENT_IDENTITY_ADDRESS), abi=IDENTITY_ABI
        )
        nonce = w3.eth.get_transaction_count(acct.address, "pending")
        last_err: Optional[Exception] = None
        for _attempt in range(6):
            tx = contract.functions.anchorRationale(int(decision_ref), rationale_hash).build_transaction({
                "from": acct.address,
                "nonce": nonce,
                "gas": 200000,
                "gasPrice": w3.eth.gas_price,
                "chainId": 5000,
            })
            signed = acct.sign_transaction(tx)
            raw = getattr(signed, "raw_transaction", None) or signed.rawTransaction
            try:
                tx_hash = w3.eth.send_raw_transaction(raw)
            except Exception as send_err:  # noqa: BLE001
                last_err = send_err
                suggested = _parse_next_nonce(str(send_err))
                nonce = suggested if (suggested is not None and suggested != nonce) else nonce + 1
                continue
            receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            h = receipt.transactionHash.hex()
            if not h.startswith("0x"):
                h = "0x" + h
            hh = rationale_hash.hex()
            if not hh.startswith("0x"):
                hh = "0x" + hh
            logger.info("anchorRationale tx mined: %s (status=%s)", h, receipt.status)
            return hh, h
        logger.error("On-chain anchorRationale failed after retries: %s", last_err)
        return None, None
    except Exception as e:  # noqa: BLE001
        logger.error("On-chain anchorRationale failed: %s", e)
        return None, None


def build_compliance_verdict(
    region: str, wallet: Optional[str], layers: tuple[int, int, int]
) -> dict:
    """Run the pre-trade compliance gate for this cycle and produce a deterministic verdict.

    Evaluates each funded layer (xStocks / USDY / mETH) for jurisdictional eligibility in the
    self-declared ``region`` and screens the agent wallet against the sanctions denylist. Returns
    a dict with the exact human-readable ``report`` string (the thing hashed on-chain), the pass
    flag, and the list of blocked layers. The report is reproducible so anyone can call
    ``verifyCompliance(report)`` on-chain and get MATCH.
    """
    wallet_scan = screen_wallet(wallet)
    sanctioned = bool(wallet_scan.get("sanctioned"))
    # Map the three layers to their compliance module keys; only evaluate funded legs.
    layer_map = [("xstocks", layers[0]), ("usdy", layers[1]), ("meth", layers[2])]
    parts: list[str] = []
    blocked: list[str] = []
    for key, weight in layer_map:
        if weight <= 0:
            continue
        ac = asset_compliance(key, region)
        restricted = bool(ac["restricted"]) or sanctioned
        if restricted:
            blocked.append(key)
        verdict = "BLOCKED" if restricted else "OK"
        parts.append(f"{key}:{verdict}")
    passed = len(blocked) == 0
    wallet_str = (wallet or "unknown").lower()
    wallet_state = "sanctioned" if sanctioned else "cleared"
    report = (
        f"StockPilot pre-trade compliance | region={(region or 'unspecified').upper()} "
        f"| wallet={wallet_str}:{wallet_state} | " + " | ".join(parts)
        + f" | blocked={blocked or '[]'}"
    )
    return {"report": report, "passed": passed, "blocked": blocked, "blocked_count": len(blocked)}


def attest_compliance_onchain(
    decision_ref: int, passed: bool, region: str, blocked_count: int, report: str
) -> tuple[Optional[str], Optional[str]]:
    """Commit keccak256(report) as a compliance attestation on-chain. Returns (hash, tx_hash).

    This makes the compliance gate independently verifiable: the exact verdict the UI shows is
    hashed and committed next to the decision, so anyone can call ``verifyCompliance(report)`` and
    get MATCH. Runs synchronously (web3); callers should offload via ``asyncio.to_thread``.
    """
    if not AGENT_PRIVATE_KEY or not COMPLIANCE_ATTESTOR_ADDRESS:
        return None, None
    try:
        w3 = Web3(Web3.HTTPProvider(MANTLE_RPC_URL, request_kwargs={"timeout": 30}))
        acct = w3.eth.account.from_key(AGENT_PRIVATE_KEY)
        compliance_hash = Web3.keccak(text=report)
        contract = w3.eth.contract(
            address=Web3.to_checksum_address(COMPLIANCE_ATTESTOR_ADDRESS), abi=COMPLIANCE_ABI
        )
        nonce = w3.eth.get_transaction_count(acct.address, "pending")
        last_err: Optional[Exception] = None
        for _attempt in range(6):
            tx = contract.functions.attestCompliance(
                int(decision_ref), bool(passed), (region or "unspecified").upper(),
                int(blocked_count), compliance_hash,
            ).build_transaction({
                "from": acct.address,
                "nonce": nonce,
                "gas": 300000,
                "gasPrice": w3.eth.gas_price,
                "chainId": 5000,
            })
            signed = acct.sign_transaction(tx)
            raw = getattr(signed, "raw_transaction", None) or signed.rawTransaction
            try:
                tx_hash = w3.eth.send_raw_transaction(raw)
            except Exception as send_err:  # noqa: BLE001
                last_err = send_err
                suggested = _parse_next_nonce(str(send_err))
                nonce = suggested if (suggested is not None and suggested != nonce) else nonce + 1
                continue
            receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            h = receipt.transactionHash.hex()
            if not h.startswith("0x"):
                h = "0x" + h
            hh = compliance_hash.hex()
            if not hh.startswith("0x"):
                hh = "0x" + hh
            logger.info("attestCompliance tx mined: %s (status=%s)", h, receipt.status)
            return hh, h
        logger.error("On-chain attestCompliance failed after retries: %s", last_err)
        return None, None
    except Exception as e:  # noqa: BLE001
        logger.error("On-chain attestCompliance failed: %s", e)
        return None, None


# --- The agent ---

class AutopilotAgent:
    """Stateful autonomous agent. One instance per process; drives the rebalance loop."""

    def __init__(self) -> None:
        self.enabled: bool = False
        self.risk_profile: str = "balanced"
        self.symbols: list[str] = list(DEFAULT_SYMBOLS)
        self.interval_sec: int = DEFAULT_INTERVAL_SEC
        self.notional_usd: float = NOTIONAL_USD
        self.last_run_ts: Optional[int] = None
        self.next_run_ts: Optional[int] = None
        self.last_decision: Optional[dict] = None
        self.history: list[dict] = []
        self._task: Optional[asyncio.Task] = None
        self._running_cycle = False

    def configure(
        self,
        symbols: Optional[list[str]] = None,
        risk_profile: Optional[str] = None,
        interval_sec: Optional[int] = None,
        notional_usd: Optional[float] = None,
    ) -> dict:
        if symbols is not None:
            picks = [s for s in symbols if s]
            if len(picks) < 1:
                return {"error": "Select at least 1 xStock"}
            self.symbols = picks
        if risk_profile is not None:
            if risk_profile not in RISK_PROFILES:
                return {"error": f"risk_profile must be one of {list(RISK_PROFILES)}"}
            self.risk_profile = risk_profile
        if interval_sec is not None and interval_sec > 0:
            self.interval_sec = int(interval_sec)
        if notional_usd is not None and notional_usd > 0:
            self.notional_usd = float(notional_usd)
        return self.status()

    def status(self) -> dict:
        return {
            "enabled": self.enabled,
            "risk_profile": self.risk_profile,
            "symbols": self.symbols,
            "interval_sec": self.interval_sec,
            "notional_usd": self.notional_usd,
            "last_run_ts": self.last_run_ts,
            "next_run_ts": self.next_run_ts,
            "live_swaps": LIVE_SWAPS,
            "contract": STOCKPILOT_CONTRACT_ADDRESS,
            "identity_contract": AGENT_IDENTITY_ADDRESS,
            "compliance_contract": COMPLIANCE_ATTESTOR_ADDRESS,
            "agent_id": 1,
            "agent_wallet": self.agent_address(),
            "agent_funded": self._funded_flag(),
            "last_decision": self.last_decision,
            "decision_count": len(self.history),
        }

    def _funded_flag(self) -> bool:
        if not AGENT_PRIVATE_KEY:
            return False
        try:
            w3 = Web3(Web3.HTTPProvider(MANTLE_RPC_URL, request_kwargs={"timeout": 10}))
            acct = w3.eth.account.from_key(AGENT_PRIVATE_KEY)
            return _agent_holds_assets(w3, acct.address)
        except Exception:  # noqa: BLE001
            return False

    def agent_address(self) -> Optional[str]:
        """Public address of the agent signer, or None when no key is configured."""
        if not AGENT_PRIVATE_KEY:
            return os.getenv("AGENT_WALLET_ADDRESS")
        try:
            return Web3().eth.account.from_key(AGENT_PRIVATE_KEY).address
        except Exception:  # noqa: BLE001
            return None

    async def portfolio(self) -> dict:
        """Read the agent wallet's real on-chain holdings, valued in USD.

        Counts the original xStock tokens (not just the ERC-4626 wrappers) so the
        UI shows true current allocation vs the on-chain target weights.
        """
        addr = self.agent_address()
        if not addr:
            return {"ok": False, "error": "No agent wallet configured", "holdings": []}
        return await asyncio.to_thread(read_agent_portfolio, addr, self.symbols)

    async def run_cycle(self, record: bool = True) -> dict:
        """Run one full autonomous cycle and return the decision record."""
        if self._running_cycle:
            return {"error": "A cycle is already running"}
        self._running_cycle = True
        try:
            signals = await gather_signals(self.symbols)
            regime, rule_reason = classify_regime(signals, self.risk_profile)
            layers, intra = target_allocation(regime, self.symbols, self.risk_profile)

            gerr = check_guardrails(regime, layers)
            if gerr:
                # Should not happen with the static tables, but enforce defensively.
                logger.error("Guardrail violation pre-record: %s", gerr)
                regime, layers = Regime.NEUTRAL, regime_weights_bps(Regime.NEUTRAL, self.risk_profile)
                _, intra = target_allocation(regime, self.symbols, self.risk_profile)
                rule_reason += f" | guardrail fallback to neutral ({gerr})"

            reason = await generate_reason(regime, signals, layers, rule_reason)

            # Decide simulated vs live execution. Real swaps require explicit opt-in + funds.
            simulated = not (LIVE_SWAPS and self._funded_flag())
            portfolio_snapshot = None
            if simulated:
                swaps = plan_rebalance(layers, intra, self.notional_usd)
                for sw in swaps:
                    sw["status"] = "simulated"
            else:
                # Live: size swaps from the REAL on-chain portfolio and execute them.
                portfolio_snapshot = await self.portfolio()
                swaps = await asyncio.to_thread(
                    execute_rebalance_swaps,
                    AGENT_PRIVATE_KEY, portfolio_snapshot, layers, intra, self.symbols,
                )

            # Pre-trade compliance gate: evaluate every funded layer for jurisdictional
            # eligibility + screen the agent wallet, producing a deterministic verdict that is
            # committed on-chain (verifiable compliance, not a claim).
            verdict = build_compliance_verdict(AUTOPILOT_REGION, self.agent_address(), layers)

            tx_hash = None
            rationale_hash = None
            anchor_tx_hash = None
            compliance_hash = None
            compliance_tx_hash = None
            if record:
                tx_hash = await asyncio.to_thread(record_decision_onchain, regime, layers, reason)
                if tx_hash:
                    try:
                        decision_ref = await asyncio.to_thread(_read_decision_count)
                        decision_ref = max(0, decision_ref - 1)
                    except Exception:  # noqa: BLE001
                        decision_ref = 0
                    # Anchor keccak256(reason) on the ERC-8004 identity contract so the
                    # rationale is independently verifiable (verifiable AI, not a black box).
                    rationale_hash, anchor_tx_hash = await asyncio.to_thread(
                        anchor_rationale_onchain, decision_ref, reason
                    )
                    # Attest the compliance verdict on-chain so verifyCompliance(report) → MATCH.
                    compliance_hash, compliance_tx_hash = await asyncio.to_thread(
                        attest_compliance_onchain,
                        decision_ref, verdict["passed"], AUTOPILOT_REGION,
                        verdict["blocked_count"], verdict["report"],
                    )

            rec = DecisionRecord(
                ts=int(time.time()),
                regime=int(regime),
                regime_label=REGIME_LABELS[regime],
                w_stocks_bps=layers[0],
                w_usdy_bps=layers[1],
                w_meth_bps=layers[2],
                xstocks=intra,
                reason=reason,
                signals=asdict(signals),
                swaps=swaps,
                tx_hash=tx_hash,
                simulated=simulated,
                portfolio=portfolio_snapshot,
                rationale_hash=rationale_hash,
                anchor_tx_hash=anchor_tx_hash,
                compliance_report=verdict["report"],
                compliance_passed=verdict["passed"],
                compliance_blocked=verdict["blocked"],
                compliance_hash=compliance_hash,
                compliance_tx_hash=compliance_tx_hash,
            )
            decision = asdict(rec)
            self.last_decision = decision
            self.history.insert(0, decision)
            self.history = self.history[:50]
            self.last_run_ts = rec.ts
            self.next_run_ts = rec.ts + self.interval_sec
            logger.info(
                "Autopilot cycle: %s | stocks/usdy/meth=%s | tx=%s | simulated=%s",
                REGIME_LABELS[regime], layers, tx_hash, simulated,
            )
            return decision
        finally:
            self._running_cycle = False

    async def _loop(self) -> None:
        logger.info("Autopilot loop started (interval=%ss)", self.interval_sec)
        while self.enabled:
            try:
                await self.run_cycle(record=True)
            except Exception as e:  # noqa: BLE001 - never let the loop die silently
                logger.error("Autopilot cycle errored: %s", e)
            # Sleep in short slices so toggling off is responsive.
            slept = 0
            while self.enabled and slept < self.interval_sec:
                await asyncio.sleep(min(5, self.interval_sec - slept))
                slept += 5
        logger.info("Autopilot loop stopped")

    def start(self) -> dict:
        if self.enabled:
            return self.status()
        self.enabled = True
        self.next_run_ts = int(time.time())
        self._task = asyncio.create_task(self._loop())
        return self.status()

    def stop(self) -> dict:
        self.enabled = False
        self.next_run_ts = None
        return self.status()


# Process-wide singleton used by the API layer.
autopilot = AutopilotAgent()
