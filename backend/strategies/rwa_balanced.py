"""RWA Balanced strategy — the AI Yield Optimizer for StockPilot AI.

Dynamically rotates the portfolio between **USDY** (tokenized US Treasuries from
Ondo Finance, stable ~5% APY) and **xStocks** (growth) based on market sentiment.
This directly addresses the Mantle Turing Test Hackathon AI x RWA requirement:
*"dynamic yield strategies for assets including USDY, built on Mantle's RWA
infrastructure"*.

The other strategies in this package (``balanced`` / ``momentum`` / ``value``)
are rule-based ``BaseStrategy`` classes that return per-token
``TradeRecommendation`` lists. This optimizer instead answers a higher-level
asset-class question (how much USDY vs. xStocks?), so it is exposed as an async
function returning an allocation decision ``dict``. That dict is consumed by the
``/api/strategy/rwa_balanced`` endpoint, which records it on-chain via
``recordYieldDecision``.

Resilience: every external call (Oracle, ELFA, LLM) is wrapped with a fallback so
the decision never crashes the endpoint — if the USDY Oracle is unreachable we
fall back to a neutral 30/70 split and say so in the ``reason``.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re

import httpx
from web3 import Web3

logger = logging.getLogger(__name__)

# --- On-chain config (Mantle Mainnet, Chain ID 5000) ---
MANTLE_RPC_URL = os.getenv("MANTLE_RPC_URL", "https://rpc.mantle.xyz")
# Ondo USDY redemption oracle — exposes getPrice() as a 1e18-scaled uint256.
USDY_ORACLE_ADDRESS = os.getenv(
    "USDY_ORACLE_ADDRESS", "0xA96abbe61AfEdEB0D14a20440Ae7100D9aB4882f"
)
USDY_TOKEN_ADDRESS = os.getenv(
    "USDY_TOKEN_ADDRESS", "0x5bE26527e817998A7206475496fDE1E68957c5A6"
)

# ABI for the Oracle contract (only the function we need).
ORACLE_ABI = [
    {
        "name": "getPrice",
        "type": "function",
        "inputs": [],
        "outputs": [{"type": "uint256", "name": ""}],
        "stateMutability": "view",
    }
]

# --- ELFA sentiment config ---
# Reuses the key-stripping reverse proxy the frontend already talks to, so no new
# API key/service is introduced. A direct ELFA key can be supplied via ELFA_API_KEY.
ELFA_BASE_URL = os.getenv("ELFA_BASE_URL", "https://app.stockpilotai.xyz/api/elfa")
ELFA_API_KEY = os.getenv("ELFA_API_KEY", "")

# Default top symbols (mirrors PortfolioAgent.DEFAULT_SYMBOLS without importing it,
# to avoid a circular import).
DEFAULT_TOP_SYMBOLS = ["SPYx", "NVDAx", "AAPLx", "TSLAx", "MSFTx"]

# Neutral split used when the Oracle is unreachable.
FALLBACK_USDY_PCT = 30
FALLBACK_STOCKS_PCT = 70


# --- USDY yield (Oracle) ---

def _read_usdy_yield() -> tuple[float | None, bool]:
    """Read USDY price from the Ondo oracle and derive the accrued yield percent.

    ``getPrice()`` returns the redemption price scaled by 1e18; the USDY price
    accrues over time as Treasury yield compounds, so the percent above par is
    ``(price / 1e18 - 1.0) * 100``.

    Returns ``(yield_pct, oracle_ok)``. On any failure returns ``(None, False)``.
    This is a synchronous web3 call; callers should run it via ``asyncio.to_thread``.
    """
    try:
        w3 = Web3(Web3.HTTPProvider(MANTLE_RPC_URL, request_kwargs={"timeout": 10}))
        oracle = w3.eth.contract(
            address=Web3.to_checksum_address(USDY_ORACLE_ADDRESS),
            abi=ORACLE_ABI,
        )
        price = oracle.functions.getPrice().call()
        yield_pct = (price / 1e18 - 1.0) * 100
        return yield_pct, True
    except Exception as e:  # noqa: BLE001 - oracle/RPC failures must not crash the agent
        logger.warning("USDY oracle read failed (%s): %s", USDY_ORACLE_ADDRESS, e)
        return None, False


# --- ELFA sentiment ---
# ELFA's free tier doesn't expose a true sentiment endpoint, so — exactly like the
# frontend's elfaSentiment() — we derive a polarity score from top-mention text.
_POS = {
    "bull", "bullish", "moon", "up", "buy", "long", "pump", "gains",
    "rally", "breakout", "beat", "strong", "growth",
}
_NEG = {
    "bear", "bearish", "down", "sell", "short", "dump", "crash", "loss",
    "weak", "decline", "drop", "miss", "risk",
}


def _score_text(text: str | None) -> float:
    """Rough text polarity in [-1, 1] from bullish/bearish keyword counts."""
    if not text:
        return 0.0
    words = re.findall(r"[a-z]+", text.lower())
    pos = sum(1 for w in words if w in _POS)
    neg = sum(1 for w in words if w in _NEG)
    if pos == 0 and neg == 0:
        return 0.0
    return (pos - neg) / (pos + neg)


async def _elfa_ticker_sentiment(client: httpx.AsyncClient, ticker: str) -> float | None:
    """Engagement-weighted polarity in [-1, 1] for one ticker, or None on failure."""
    headers = {"x-elfa-api-key": ELFA_API_KEY} if ELFA_API_KEY else {}
    url = f"{ELFA_BASE_URL}/v2/data/top-mentions"
    params = {"ticker": ticker.upper(), "timeWindow": "24h", "limit": 8}
    resp = await client.get(url, params=params, headers=headers, timeout=8.0)
    resp.raise_for_status()
    data = resp.json()
    rows = data.get("data") or []
    scores = [_score_text(r.get("content") or r.get("text")) for r in rows]
    scores = [s for s in scores if s != 0.0]
    if not scores:
        return None
    return sum(scores) / len(scores)


async def fetch_portfolio_sentiment(symbols: list[str]) -> tuple[float, bool]:
    """Average ELFA sentiment in [-1, 1] across the top-5 portfolio symbols.

    Returns ``(score, used_fallback)``; ``score`` is 0.0 (neutral) when ELFA is
    unavailable or returns nothing for these tickers.
    """
    top = [s for s in symbols if s][:5]
    if not top:
        return 0.0, True

    collected: list[float] = []
    try:
        async with httpx.AsyncClient() as client:
            for sym in top:
                # ELFA tracks crypto-Twitter tickers; strip the xStock "x" suffix.
                base_ticker = sym[:-1] if sym.endswith("x") else sym
                try:
                    score = await _elfa_ticker_sentiment(client, base_ticker)
                    if score is not None:
                        collected.append(score)
                except Exception as e:  # noqa: BLE001 - per-ticker failures are non-fatal
                    logger.warning("ELFA sentiment failed for %s: %s", sym, e)
    except Exception as e:  # noqa: BLE001 - ELFA outage must not crash the agent
        logger.warning("ELFA client error: %s", e)

    if not collected:
        return 0.0, True
    avg = sum(collected) / len(collected)
    return max(-1.0, min(1.0, avg)), False


# --- Allocation decision ---

def decide_allocation(sentiment: float) -> tuple[int, int, str]:
    """Map an ELFA sentiment score in [-1, 1] to a (usdy_pct, stocks_pct, mode)."""
    if sentiment < -0.2:
        return 50, 50, "defensive"
    if sentiment > 0.3:
        return 20, 80, "aggressive"
    return 35, 65, "balanced"


def _fallback_reason(
    usdy_pct: int,
    stocks_pct: int,
    usdy_yield_pct: float,
    sentiment: float,
    mode: str,
    oracle_ok: bool,
) -> str:
    """Deterministic, human-readable explanation used when no LLM is configured."""
    if not oracle_ok:
        return (
            f"USDY Oracle unavailable — defaulting to a neutral {usdy_pct}% USDY / "
            f"{stocks_pct}% xStocks split until the on-chain price feed recovers."
        )
    if mode == "defensive":
        return (
            f"Negative market sentiment detected ({sentiment:+.2f}). Rotating "
            f"{usdy_pct}% allocation to USDY at {usdy_yield_pct:.2f}% yield to "
            f"preserve capital during the downturn."
        )
    if mode == "aggressive":
        return (
            f"Positive market sentiment ({sentiment:+.2f}). Reducing USDY to "
            f"{usdy_pct}% and leaning {stocks_pct}% into xStocks to capture upside, "
            f"keeping a USDY buffer at {usdy_yield_pct:.2f}% yield."
        )
    return (
        f"Neutral sentiment ({sentiment:+.2f}). Holding a balanced {usdy_pct}% USDY "
        f"/ {stocks_pct}% xStocks split, earning {usdy_yield_pct:.2f}% on the USDY leg."
    )


async def _generate_reason(
    usdy_pct: int,
    stocks_pct: int,
    usdy_yield_pct: float,
    sentiment: float,
    mode: str,
    oracle_ok: bool,
) -> str:
    """Produce a 1-2 sentence rationale via the LLM, falling back to a templated one.

    Uses the same OpenAI client the rest of the backend uses (``agent/ai_engine.py``);
    if ``OPENAI_API_KEY`` is unset or the call fails, returns the deterministic
    fallback so the decision is always explained.
    """
    fallback = _fallback_reason(
        usdy_pct, stocks_pct, usdy_yield_pct, sentiment, mode, oracle_ok
    )

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return fallback

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=api_key)
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are StockPilot AI's RWA yield optimizer. Explain the "
                        "USDY/xStocks allocation decision in 1-2 concise sentences "
                        "for a sophisticated investor. State the sentiment signal and "
                        "the resulting split. No preamble."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Sentiment score: {sentiment:+.2f}. USDY yield: "
                        f"{usdy_yield_pct:.2f}%. Decision: {usdy_pct}% USDY / "
                        f"{stocks_pct}% xStocks ({mode} mode). "
                        f"Oracle available: {oracle_ok}."
                    ),
                },
            ],
            max_tokens=120,
            temperature=0.4,
        )
        text = (resp.choices[0].message.content or "").strip()
        return text or fallback
    except Exception as e:  # noqa: BLE001 - LLM failures fall back to the template
        logger.warning("LLM reason generation failed, using fallback: %s", e)
        return fallback


# --- Public entrypoint ---

async def rwa_balanced_strategy(
    symbols: list[str] | None = None,
    wallet_address: str | None = None,
) -> dict:
    """Run the RWA Balanced (AI Yield Optimizer) decision.

    Steps:
      1. Read the live USDY yield from the Ondo Oracle on Mantle.
      2. Gauge ELFA sentiment for the top xStocks in the portfolio.
      3. Decide the USDY/xStocks split from the sentiment thresholds.
      4. Generate a readable rationale via the LLM (with fallback).

    Returns a dict with: ``usdy_pct``, ``stocks_pct``, ``reason``,
    ``usdy_yield_pct``, ``sentiment_score``.
    """
    symbols = symbols or DEFAULT_TOP_SYMBOLS

    # Oracle read is sync (web3.py) — offload so we don't block the event loop.
    yield_pct, oracle_ok = await asyncio.to_thread(_read_usdy_yield)
    sentiment, _sentiment_fallback = await fetch_portfolio_sentiment(symbols)

    if oracle_ok:
        usdy_pct, stocks_pct, mode = decide_allocation(sentiment)
    else:
        usdy_pct, stocks_pct, mode = FALLBACK_USDY_PCT, FALLBACK_STOCKS_PCT, "fallback"

    usdy_yield_pct = round(yield_pct, 4) if yield_pct is not None else 0.0

    reason = await _generate_reason(
        usdy_pct, stocks_pct, usdy_yield_pct, sentiment, mode, oracle_ok
    )

    logger.info(
        "RWA decision: %s%% USDY / %s%% xStocks | yield=%.2f%% sentiment=%.2f (%s)",
        usdy_pct, stocks_pct, usdy_yield_pct, sentiment, mode,
    )

    return {
        "usdy_pct": usdy_pct,
        "stocks_pct": stocks_pct,
        "reason": reason,
        "usdy_yield_pct": usdy_yield_pct,
        "sentiment_score": round(sentiment, 4),
    }
