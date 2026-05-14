"""StockPilot Portfolio Agent — orchestrates strategies, AI, and on-chain execution."""

import logging
from dataclasses import dataclass, field
from typing import Optional

from ..xstocks_api.client import XStocksClient
from ..strategies.base import BaseStrategy, PortfolioState, TradeRecommendation
from ..strategies.balanced import BalancedStrategy
from ..strategies.momentum import MomentumStrategy
from ..strategies.value import ValueStrategy
from .ai_engine import AIEngine

logger = logging.getLogger(__name__)


AVAILABLE_STRATEGIES = {
    "balanced": BalancedStrategy,
    "momentum": MomentumStrategy,
    "value": ValueStrategy,
}

# xStocks symbols available on Mantle
DEFAULT_SYMBOLS = ["SPYx", "NVDAx", "AAPLx", "TSLAx", "MSFTx", "AMZNx"]


@dataclass
class AgentState:
    positions: dict[str, float] = field(default_factory=dict)
    entry_prices: dict[str, float] = field(default_factory=dict)
    cash_usd: float = 0.0
    total_deposited: float = 0.0
    strategy_name: str = "balanced"
    action_history: list[dict] = field(default_factory=list)


class PortfolioAgent:
    """Main agent that manages the xStocks portfolio on Mantle."""

    def __init__(
        self,
        xstocks_client: XStocksClient,
        ai_engine: Optional[AIEngine] = None,
        strategy_name: str = "balanced",
    ):
        self.xstocks = xstocks_client
        self.ai_engine = ai_engine or AIEngine()
        self.state = AgentState(strategy_name=strategy_name)
        self.strategy = self._get_strategy(strategy_name)
        self.symbols = DEFAULT_SYMBOLS

    def _get_strategy(self, name: str) -> BaseStrategy:
        cls = AVAILABLE_STRATEGIES.get(name, BalancedStrategy)
        return cls()

    def set_strategy(self, name: str) -> dict:
        if name not in AVAILABLE_STRATEGIES:
            return {"error": f"Unknown strategy: {name}. Available: {list(AVAILABLE_STRATEGIES.keys())}"}

        self.strategy = self._get_strategy(name)
        self.state.strategy_name = name
        return {"strategy": name, "allocation": self.strategy.get_target_allocation()}

    async def get_market_data(self) -> dict:
        """Fetch current market data from xStocks API."""
        prices = await self.xstocks.get_prices_batch(self.symbols)
        return {
            "prices": prices,
            "price_changes_24h": {},  # Would come from historical data
            "price_changes_7d": {},
            "timestamp": "now",
        }

    async def analyze(self) -> dict:
        """Run full portfolio analysis and return recommendations."""
        market_data = await self.get_market_data()
        prices = market_data["prices"]

        # Calculate portfolio state
        total_value = self.state.cash_usd
        for symbol, amount in self.state.positions.items():
            total_value += amount * prices.get(symbol, 0)

        portfolio = PortfolioState(
            positions=self.state.positions.copy(),
            prices=prices,
            total_value_usd=total_value if total_value > 0 else 1.0,
            cash_usd=self.state.cash_usd,
        )

        # Get strategy recommendations
        recommendations = await self.strategy.analyze(
            portfolio,
            {**market_data, "entry_prices": self.state.entry_prices},
        )

        # Enhance with AI
        if self.ai_engine:
            recommendations = await self.ai_engine.enhance_recommendations(
                recommendations, portfolio, market_data,
            )

        return {
            "portfolio": {
                "total_value_usd": total_value,
                "cash_usd": self.state.cash_usd,
                "positions": self.state.positions,
                "strategy": self.state.strategy_name,
            },
            "market_data": {
                "prices": prices,
            },
            "recommendations": [
                {
                    "symbol": r.symbol,
                    "signal": r.signal.value,
                    "confidence": r.confidence,
                    "target_weight": r.target_weight,
                    "reasoning": r.reasoning,
                    "price_usd": r.price_usd,
                }
                for r in recommendations
            ],
            "target_allocation": self.strategy.get_target_allocation(),
        }

    async def execute_recommendations(self, recommendations: list[dict]) -> list[dict]:
        """Execute approved recommendations (simulation mode for hackathon)."""
        executed = []

        for rec in recommendations:
            symbol = rec["symbol"]
            signal = rec["signal"]
            target_weight = rec.get("target_weight", 0)
            price = rec.get("price_usd", 0)

            if signal in ("buy", "strong_buy") and price > 0:
                # Simulate buy
                target_value = target_weight * (self.state.cash_usd + sum(
                    self.state.positions.get(s, 0) * price for s in self.symbols
                ))
                current_value = self.state.positions.get(symbol, 0) * price
                buy_value = max(0, target_value - current_value)

                if buy_value > 0 and buy_value <= self.state.cash_usd:
                    buy_amount = buy_value / price
                    self.state.positions[symbol] = self.state.positions.get(symbol, 0) + buy_amount
                    self.state.cash_usd -= buy_value
                    self.state.entry_prices.setdefault(symbol, price)

                    action = {
                        "action": "BUY",
                        "symbol": symbol,
                        "amount": buy_amount,
                        "value_usd": buy_value,
                        "price": price,
                        "reasoning": rec.get("reasoning", ""),
                    }
                    self.state.action_history.append(action)
                    executed.append(action)

            elif signal in ("sell", "strong_sell") and symbol in self.state.positions:
                current_amount = self.state.positions[symbol]
                if target_weight == 0:
                    sell_amount = current_amount
                else:
                    # Sell to reach target weight
                    total_value = self.state.cash_usd + sum(
                        self.state.positions.get(s, 0) * price for s in self.symbols
                    )
                    target_amount = (target_weight * total_value) / price if price > 0 else 0
                    sell_amount = max(0, current_amount - target_amount)

                if sell_amount > 0:
                    sell_value = sell_amount * price
                    self.state.positions[symbol] -= sell_amount
                    self.state.cash_usd += sell_value

                    if self.state.positions[symbol] <= 0:
                        del self.state.positions[symbol]
                        self.state.entry_prices.pop(symbol, None)

                    action = {
                        "action": "SELL",
                        "symbol": symbol,
                        "amount": sell_amount,
                        "value_usd": sell_value,
                        "price": price,
                        "reasoning": rec.get("reasoning", ""),
                    }
                    self.state.action_history.append(action)
                    executed.append(action)

        return executed

    def deposit(self, amount_usd: float) -> dict:
        self.state.cash_usd += amount_usd
        self.state.total_deposited += amount_usd
        return {"cash_usd": self.state.cash_usd, "total_deposited": self.state.total_deposited}

    def get_performance(self) -> dict:
        return {
            "total_deposited": self.state.total_deposited,
            "cash_usd": self.state.cash_usd,
            "positions": self.state.positions,
            "action_count": len(self.state.action_history),
            "strategy": self.state.strategy_name,
        }
