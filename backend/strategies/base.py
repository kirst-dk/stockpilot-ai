"""Base strategy interface for StockPilot AI."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum


class Signal(Enum):
    STRONG_BUY = "strong_buy"
    BUY = "buy"
    HOLD = "hold"
    SELL = "sell"
    STRONG_SELL = "strong_sell"


@dataclass
class TradeRecommendation:
    symbol: str
    signal: Signal
    confidence: float  # 0.0 to 1.0
    target_weight: float  # target portfolio weight as fraction (0.0 to 1.0)
    reasoning: str
    price_usd: float


@dataclass
class PortfolioState:
    positions: dict[str, float]  # symbol -> amount
    prices: dict[str, float]  # symbol -> USD price
    total_value_usd: float
    cash_usd: float


class BaseStrategy(ABC):
    """Abstract base class for portfolio strategies."""

    def __init__(self, name: str, risk_level: int = 5):
        self.name = name
        self.risk_level = risk_level  # 1-10

    @abstractmethod
    async def analyze(
        self,
        portfolio: PortfolioState,
        market_data: dict,
    ) -> list[TradeRecommendation]:
        """Analyze market conditions and return trade recommendations."""
        ...

    @abstractmethod
    def get_target_allocation(self) -> dict[str, float]:
        """Return target portfolio allocation as symbol -> weight mapping."""
        ...
