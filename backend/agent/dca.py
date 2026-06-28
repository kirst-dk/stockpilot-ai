"""Autopilot DCA — time-sliced dollar-cost averaging (Task 5).

The user picks an amount, risk profile, total duration and interval. The amount is
split evenly across ``cycles = duration / interval`` tranches. Each interval the agent
autonomously analyses the market (regime + weights, risk-profile aware) and buys one
tranche into xStocks + mETH at the current target proportions, recording every cycle
on-chain. It stops when the capital or the time runs out.

Pre-approval model (no per-cycle signature): the agent executes the tranches from its
own funded wallet — i.e. the user makes a single one-time USDC deposit to the agent
vault wallet up front, after which the scheduled buys run autonomously. This is the
"deposit" option from the spec (cleaner than an allowance, since the bought assets are
custodied and managed by the agent for the duration of the plan).
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import asdict
from typing import Optional

from agent.autopilot import (
    AGENT_PRIVATE_KEY,
    LIVE_SWAPS,
    REGIME_LABELS,
    RISK_PROFILES,
    Regime,
    autopilot,
    classify_regime,
    gather_signals,
    generate_reason,
    record_decision_onchain,
    regime_weights_bps,
    target_allocation,
)
from agent.swap_executor import execute_dca_slice

logger = logging.getLogger("stockpilot.dca")

_MAX_CYCLES = 96  # safety cap (e.g. 24h at 15-min intervals)


class DcaManager:
    """Single active DCA plan per process; drives the scheduled tranche buys."""

    def __init__(self) -> None:
        self.active: bool = False
        self.amount_usdc: float = 0.0
        self.per_cycle_usdc: float = 0.0
        self.risk_profile: str = "balanced"
        self.symbols: list[str] = []
        self.interval_sec: int = 0
        self.duration_sec: int = 0
        self.cycles_total: int = 0
        self.cycles_done: int = 0
        self.spent_usdc: float = 0.0
        self.started_at: Optional[int] = None
        self.next_run_ts: Optional[int] = None
        self.end_ts: Optional[int] = None
        self.cycles: list[dict] = []
        self._task: Optional[asyncio.Task] = None

    def status(self) -> dict:
        return {
            "active": self.active,
            "amount_usdc": round(self.amount_usdc, 2),
            "per_cycle_usdc": round(self.per_cycle_usdc, 2),
            "risk_profile": self.risk_profile,
            "symbols": self.symbols,
            "interval_sec": self.interval_sec,
            "duration_sec": self.duration_sec,
            "cycles_total": self.cycles_total,
            "cycles_done": self.cycles_done,
            "spent_usdc": round(self.spent_usdc, 2),
            "remaining_usdc": round(max(0.0, self.amount_usdc - self.spent_usdc), 2),
            "started_at": self.started_at,
            "next_run_ts": self.next_run_ts,
            "end_ts": self.end_ts,
            "live_swaps": LIVE_SWAPS,
            "agent_wallet": autopilot.agent_address(),
            "cycles": self.cycles[:50],
        }

    def start(
        self,
        amount_usdc: float,
        risk_profile: str,
        duration_sec: int,
        interval_sec: int,
        symbols: Optional[list[str]],
    ) -> dict:
        if self.active:
            return {"error": "A DCA plan is already running. Stop it first."}
        if amount_usdc is None or amount_usdc <= 0:
            return {"error": "amount_usdc must be > 0"}
        if interval_sec <= 0 or duration_sec <= 0 or interval_sec > duration_sec:
            return {"error": "need 0 < interval_sec <= duration_sec"}
        if risk_profile not in RISK_PROFILES:
            return {"error": f"risk_profile must be one of {list(RISK_PROFILES)}"}

        cycles = max(1, min(_MAX_CYCLES, int(duration_sec // interval_sec)))
        picks = [s for s in (symbols or []) if s][:5] or list(autopilot.symbols)

        self.amount_usdc = float(amount_usdc)
        self.per_cycle_usdc = self.amount_usdc / cycles
        self.risk_profile = risk_profile
        self.symbols = picks
        self.interval_sec = int(interval_sec)
        self.duration_sec = int(duration_sec)
        self.cycles_total = cycles
        self.cycles_done = 0
        self.spent_usdc = 0.0
        self.cycles = []
        self.started_at = int(time.time())
        self.end_ts = self.started_at + int(duration_sec)
        self.next_run_ts = self.started_at  # first tranche fires immediately
        self.active = True
        self._task = asyncio.create_task(self._loop())
        logger.info(
            "DCA started: %.2f USDC over %d cycles (every %ss), profile=%s, picks=%s",
            self.amount_usdc, cycles, interval_sec, risk_profile, picks,
        )
        return self.status()

    def stop(self) -> dict:
        self.active = False
        self.next_run_ts = None
        logger.info("DCA stopped at cycle %d/%d", self.cycles_done, self.cycles_total)
        return self.status()

    async def _run_one(self, idx: int) -> dict:
        """Analyse the market and buy one tranche; record the decision on-chain."""
        signals = await gather_signals(self.symbols)
        regime, rule_reason = classify_regime(signals, self.risk_profile)
        layers = regime_weights_bps(regime, self.risk_profile)
        _, intra = target_allocation(regime, self.symbols, self.risk_profile)
        base_reason = await generate_reason(regime, signals, layers, rule_reason)
        reason = f"DCA {idx}/{self.cycles_total} (${self.per_cycle_usdc:.2f}): {base_reason}"

        swaps: list[dict] = []
        if LIVE_SWAPS and AGENT_PRIVATE_KEY:
            swaps = await asyncio.to_thread(
                execute_dca_slice, AGENT_PRIVATE_KEY, layers, intra, self.symbols, self.per_cycle_usdc,
            )
        else:
            swaps = [{"status": "simulated", "usd": round(self.per_cycle_usdc, 2)}]

        tx_hash = await asyncio.to_thread(record_decision_onchain, regime, layers, reason)

        cycle = {
            "idx": idx,
            "ts": int(time.time()),
            "regime": int(regime),
            "regime_label": REGIME_LABELS[regime],
            "weights_bps": list(layers),
            "slice_usdc": round(self.per_cycle_usdc, 2),
            "reason": reason,
            "signals": asdict(signals),
            "swaps": swaps,
            "tx_hash": tx_hash,
        }
        # Surface DCA cycles in the shared activity feed too.
        try:
            autopilot.history.insert(0, {
                "ts": cycle["ts"], "regime": int(regime), "regime_label": REGIME_LABELS[regime],
                "w_stocks_bps": layers[0], "w_usdy_bps": layers[1], "w_meth_bps": layers[2],
                "xstocks": intra, "reason": reason, "signals": asdict(signals),
                "swaps": swaps, "tx_hash": tx_hash, "simulated": not (LIVE_SWAPS and bool(AGENT_PRIVATE_KEY)),
            })
            autopilot.history = autopilot.history[:50]
        except Exception:  # noqa: BLE001
            pass
        return cycle

    async def _loop(self) -> None:
        logger.info("DCA loop started (%d cycles, interval=%ss)", self.cycles_total, self.interval_sec)
        while self.active and self.cycles_done < self.cycles_total:
            try:
                cycle = await self._run_one(self.cycles_done + 1)
                self.cycles.insert(0, cycle)
                self.cycles = self.cycles[:50]
                self.cycles_done += 1
                self.spent_usdc += self.per_cycle_usdc
            except Exception as e:  # noqa: BLE001 - never let the loop die silently
                logger.error("DCA cycle errored: %s", e)

            if self.cycles_done >= self.cycles_total:
                break
            self.next_run_ts = int(time.time()) + self.interval_sec
            slept = 0
            while self.active and slept < self.interval_sec:
                await asyncio.sleep(min(5, self.interval_sec - slept))
                slept += 5

        self.active = False
        self.next_run_ts = None
        logger.info("DCA loop finished: %d/%d cycles, spent ~%.2f USDC",
                    self.cycles_done, self.cycles_total, self.spent_usdc)


# Process-wide singleton.
dca = DcaManager()
