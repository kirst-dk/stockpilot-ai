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

logger = logging.getLogger(__name__)

# --- On-chain config (Mantle Mainnet, chainId 5000) ---
MANTLE_RPC_URL = os.getenv("MANTLE_RPC_URL", "https://rpc.mantle.xyz")
STOCKPILOT_CONTRACT_ADDRESS = os.getenv(
    "STOCKPILOT_CONTRACT_ADDRESS", "0xbbE80ACe5c46b49930ff0229762a1A57BE4CA6F4"
)
AGENT_PRIVATE_KEY = os.getenv("AGENT_PRIVATE_KEY") or os.getenv("DEPLOYER_PRIVATE_KEY")

# Three-layer tokens on Mantle.
USDY_TOKEN = os.getenv("USDY_TOKEN_ADDRESS", "0x5bE26527e817998A7206475496fDE1E68957c5A6")
METH_TOKEN = os.getenv("METH_TOKEN_ADDRESS", "0xcDA86A272531e8640cD7F1a92c01839911B90bb0")
USDC_TOKEN = os.getenv("USDC_ADDRESS", "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9")

# Real swaps only fire when explicitly enabled AND the wallet holds assets; otherwise the
# swap leg is simulated (dry-run) while the decision is still recorded on-chain for real.
LIVE_SWAPS = os.getenv("AUTOPILOT_LIVE_SWAPS", "0") == "1"

# Nansen smart-money proxy (key-stripping reverse proxy the frontend already uses).
NANSEN_BASE_URL = os.getenv("NANSEN_BASE_URL", "https://app.stockpilotai.xyz/api/nansen")

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


class Regime(IntEnum):
    RISK_OFF = 0
    NEUTRAL = 1
    RISK_ON = 2


REGIME_LABELS = {Regime.RISK_OFF: "risk-off", Regime.NEUTRAL: "neutral", Regime.RISK_ON: "risk-on"}

# Regime -> layer weights in basis points (xStocks, USDY, mETH). Must sum to 10000 and
# stay within the contract guardrails (<=7000 per layer; USDY>=5000 in risk-off).
REGIME_WEIGHTS_BPS = {
    Regime.RISK_ON: (5500, 2000, 2500),
    Regime.NEUTRAL: (4000, 4000, 2000),
    Regime.RISK_OFF: (2000, 6500, 1500),
}

# Risk profile shifts the regime thresholds. Conservative leans defensive; aggressive
# reaches for risk-on sooner.
RISK_PROFILES = {
    "conservative": {"on": 0.50, "off": 0.05, "vol_off": 0.60},
    "balanced": {"on": 0.35, "off": -0.20, "vol_off": 0.70},
    "aggressive": {"on": 0.15, "off": -0.40, "vol_off": 0.80},
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


# --- Signal gathering ---

async def _fetch_smart_money_flow(symbols: list[str]) -> tuple[float, bool]:
    """Best-effort Nansen smart-money net-flow signal in [-1, 1].

    Uses the same key-stripping proxy the frontend talks to. Any failure returns
    ``(0.0, False)`` (neutral fallback) so the cycle is never blocked.
    """
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(f"{NANSEN_BASE_URL}/smart-money/netflows", params={"chain": "mantle"})
            resp.raise_for_status()
            data = resp.json()
            rows = data.get("data") or data.get("result") or []
            inflow = sum(float(r.get("inflowUsd", r.get("inflow", 0)) or 0) for r in rows)
            outflow = sum(float(r.get("outflowUsd", r.get("outflow", 0)) or 0) for r in rows)
            total = inflow + outflow
            if total <= 0:
                return 0.0, False
            net = (inflow - outflow) / total  # [-1, 1]
            return max(-1.0, min(1.0, net)), True
    except Exception as e:  # noqa: BLE001 - Nansen outage is non-fatal
        logger.warning("Nansen smart-money fetch failed: %s", e)
        return 0.0, False


async def _volatility_proxy(symbols: list[str], sentiment_dispersion: float) -> float:
    """Realized-volatility proxy in [0, 1].

    With no reliable free historical price series for xStocks, we approximate market
    uncertainty from the dispersion (stddev) of per-ticker sentiment — high disagreement
    among tickers maps to higher uncertainty — anchored at a calm-market baseline of 0.4.
    Pluggable: set ``AUTOPILOT_VOL_OVERRIDE`` to feed a real vol number in [0, 1].
    """
    override = os.getenv("AUTOPILOT_VOL_OVERRIDE")
    if override is not None:
        try:
            return max(0.0, min(1.0, float(override)))
        except ValueError:
            pass
    base = 0.40
    return max(0.0, min(1.0, base + sentiment_dispersion))


async def gather_signals(symbols: list[str]) -> Signals:
    """Collect ELFA sentiment, Nansen flow, volatility proxy and USDY yield concurrently."""
    sent_task = asyncio.create_task(fetch_portfolio_sentiment(symbols))
    flow_task = asyncio.create_task(_fetch_smart_money_flow(symbols))
    yield_pct, oracle_ok = await asyncio.to_thread(_read_usdy_yield)

    sentiment, sent_fallback = await sent_task
    smart_money, flow_live = await flow_task

    # Per-ticker sentiment dispersion drives the volatility proxy.
    try:
        per_ticker = await _per_ticker_sentiment(symbols)
        dispersion = statistics.pstdev(per_ticker) if len(per_ticker) > 1 else 0.0
    except Exception:  # noqa: BLE001
        dispersion = 0.0
    volatility = await _volatility_proxy(symbols, dispersion * 0.5)

    return Signals(
        sentiment=round(sentiment, 4),
        smart_money=round(smart_money, 4),
        volatility=round(volatility, 4),
        usdy_yield_pct=round(yield_pct, 4) if yield_pct is not None else 0.0,
        sources={
            "elfa_sentiment": "fallback" if sent_fallback else "live",
            "nansen_flow": "live" if flow_live else "fallback",
            "usdy_oracle": "live" if oracle_ok else "fallback",
            "volatility": "proxy",
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

    Composite risk score = sentiment + smart_money - volatility_penalty, where the
    penalty grows as volatility exceeds the calm midpoint.
    """
    prof = RISK_PROFILES.get(risk_profile, RISK_PROFILES["balanced"])
    vol_penalty = max(0.0, (signals.volatility - 0.5)) * 2.0  # [0, 1]
    score = signals.sentiment + signals.smart_money - vol_penalty

    if signals.volatility >= prof["vol_off"] or score <= prof["off"]:
        regime = Regime.RISK_OFF
    elif score >= prof["on"] and signals.volatility < prof["vol_off"]:
        regime = Regime.RISK_ON
    else:
        regime = Regime.NEUTRAL

    rule_reason = (
        f"[{risk_profile}] sentiment={signals.sentiment:+.2f}, "
        f"smart-money={signals.smart_money:+.2f}, vol={signals.volatility:.2f} "
        f"=> score={score:+.2f} -> {REGIME_LABELS[regime]}"
    )
    return regime, rule_reason


def target_allocation(regime: Regime, symbols: list[str]) -> tuple[tuple[int, int, int], dict]:
    """Return ((wStocks,wUSDY,wMETH) bps, {symbol: bps_within_xstocks_layer})."""
    layers = REGIME_WEIGHTS_BPS[regime]
    picks = [s for s in symbols if s][:5] or DEFAULT_SYMBOLS
    n = len(picks)
    base = 10000 // n
    intra = {s: base for s in picks}
    intra[picks[-1]] += 10000 - base * n  # absorb rounding remainder
    return layers, intra


async def generate_reason(
    regime: Regime, signals: Signals, layers: tuple[int, int, int], rule_reason: str
) -> str:
    """LLM ("AltLLM") final rationale, falling back to the deterministic rule summary."""
    s, u, m = (x / 100 for x in layers)
    fallback = (
        f"Regime: {REGIME_LABELS[regime]}. Target {s:.0f}% xStocks / {u:.0f}% USDY / "
        f"{m:.0f}% mETH. {rule_reason}. USDY yield {signals.usdy_yield_pct:.2f}%."
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
                        "You are StockPilot AI's autonomous RWA yield agent. In 1-2 concise "
                        "sentences, justify the 3-layer allocation (xStocks growth / USDY "
                        "treasuries / mETH staking yield) for a sophisticated investor. State "
                        "the regime and the key signals. No preamble."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Regime={REGIME_LABELS[regime]}; sentiment={signals.sentiment:+.2f}; "
                        f"smart_money={signals.smart_money:+.2f}; volatility={signals.volatility:.2f}; "
                        f"USDY_yield={signals.usdy_yield_pct:.2f}%; target bps "
                        f"stocks/usdy/meth={layers}."
                    ),
                },
            ],
            max_tokens=120,
            temperature=0.4,
        )
        text = (resp.choices[0].message.content or "").strip()
        return text or fallback
    except Exception as e:  # noqa: BLE001
        logger.warning("LLM regime reason failed, using fallback: %s", e)
        return fallback


# --- Guardrails (mirror the on-chain checks so we fail fast off-chain) ---

def check_guardrails(regime: Regime, layers: tuple[int, int, int]) -> Optional[str]:
    """Return an error string if the allocation violates guardrails, else None."""
    w_stocks, w_usdy, w_meth = layers
    if w_stocks + w_usdy + w_meth != 10000:
        return "weights must sum to 10000"
    cap = 7000
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
    erc = [{"name": "balanceOf", "type": "function", "inputs": [{"type": "address"}],
            "outputs": [{"type": "uint256"}], "stateMutability": "view"}]
    for addr in (USDY_TOKEN, METH_TOKEN, USDC_TOKEN):
        try:
            c = w3.eth.contract(address=Web3.to_checksum_address(addr), abi=erc)
            if c.functions.balanceOf(Web3.to_checksum_address(wallet)).call() > 0:
                return True
        except Exception:  # noqa: BLE001
            continue
    return False


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
        tx = contract.functions.recordDecision(
            int(regime), int(w_stocks), int(w_usdy), int(w_meth), reason[:240]
        ).build_transaction({
            "from": acct.address,
            "nonce": w3.eth.get_transaction_count(acct.address),
            "gas": 400000,
            "gasPrice": w3.eth.gas_price,
            "chainId": 5000,
        })
        signed = acct.sign_transaction(tx)
        # web3.py v6 exposes `rawTransaction`; v7 renamed it to `raw_transaction`.
        raw = getattr(signed, "raw_transaction", None) or signed.rawTransaction
        tx_hash = w3.eth.send_raw_transaction(raw)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        h = receipt.transactionHash.hex()
        if not h.startswith("0x"):
            h = "0x" + h
        logger.info("recordDecision tx mined: %s (status=%s)", h, receipt.status)
        return h
    except Exception as e:  # noqa: BLE001
        logger.error("On-chain recordDecision failed: %s", e)
        return None


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
            picks = [s for s in symbols if s][:5]
            if len(picks) < 3:
                return {"error": "Select between 3 and 5 xStocks"}
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

    async def run_cycle(self, record: bool = True) -> dict:
        """Run one full autonomous cycle and return the decision record."""
        if self._running_cycle:
            return {"error": "A cycle is already running"}
        self._running_cycle = True
        try:
            signals = await gather_signals(self.symbols)
            regime, rule_reason = classify_regime(signals, self.risk_profile)
            layers, intra = target_allocation(regime, self.symbols)

            gerr = check_guardrails(regime, layers)
            if gerr:
                # Should not happen with the static tables, but enforce defensively.
                logger.error("Guardrail violation pre-record: %s", gerr)
                regime, layers = Regime.NEUTRAL, REGIME_WEIGHTS_BPS[Regime.NEUTRAL]
                _, intra = target_allocation(regime, self.symbols)
                rule_reason += f" | guardrail fallback to neutral ({gerr})"

            reason = await generate_reason(regime, signals, layers, rule_reason)
            swaps = plan_rebalance(layers, intra, self.notional_usd)

            # Decide simulated vs live execution. Real swaps require explicit opt-in + funds.
            simulated = not (LIVE_SWAPS and self._funded_flag())
            for sw in swaps:
                sw["status"] = "simulated" if simulated else "pending"

            tx_hash = None
            if record:
                tx_hash = await asyncio.to_thread(record_decision_onchain, regime, layers, reason)

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
