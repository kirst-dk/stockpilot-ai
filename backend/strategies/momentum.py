"""Momentum-based trading strategy for xStocks."""

from .base import BaseStrategy, TradeRecommendation, Signal, PortfolioState


class MomentumStrategy(BaseStrategy):
    """Momentum strategy that follows price trends.

    Allocates more to assets with strong upward momentum and reduces
    exposure to underperformers.
    """

    def __init__(self, risk_level: int = 6):
        super().__init__("Momentum", risk_level)
        self.lookback_period = 14  # days
        self.rebalance_threshold = 0.05  # 5% deviation triggers rebalance

        # Default target allocation for momentum portfolio
        self._target_allocation = {
            "SPYx": 0.25,   # S&P 500 ETF - core holding
            "NVDAx": 0.20,  # NVIDIA - AI/tech momentum
            "AAPLx": 0.15,  # Apple - large-cap stability
            "TSLAx": 0.15,  # Tesla - high-momentum play
            "MSFTx": 0.15,  # Microsoft - AI/cloud
            "AMZNx": 0.10,  # Amazon - diversification
        }

    async def analyze(
        self,
        portfolio: PortfolioState,
        market_data: dict,
    ) -> list[TradeRecommendation]:
        recommendations = []
        prices = portfolio.prices
        price_changes = market_data.get("price_changes_24h", {})

        for symbol, target_weight in self._target_allocation.items():
            price = prices.get(symbol, 0)
            if price <= 0:
                continue

            change = price_changes.get(symbol, 0)

            # Calculate current weight
            current_value = portfolio.positions.get(symbol, 0) * price
            current_weight = current_value / portfolio.total_value_usd if portfolio.total_value_usd > 0 else 0

            # Momentum signal
            if change > 3:
                signal = Signal.STRONG_BUY
                adjusted_weight = min(target_weight * 1.3, 0.35)
                reasoning = f"{symbol} showing strong momentum (+{change:.1f}% 24h). Increasing allocation."
            elif change > 1:
                signal = Signal.BUY
                adjusted_weight = target_weight * 1.1
                reasoning = f"{symbol} positive momentum (+{change:.1f}% 24h). Maintaining overweight."
            elif change < -3:
                signal = Signal.STRONG_SELL
                adjusted_weight = target_weight * 0.5
                reasoning = f"{symbol} sharp decline ({change:.1f}% 24h). Reducing exposure."
            elif change < -1:
                signal = Signal.SELL
                adjusted_weight = target_weight * 0.8
                reasoning = f"{symbol} negative trend ({change:.1f}% 24h). Slightly reducing."
            else:
                signal = Signal.HOLD
                adjusted_weight = target_weight
                reasoning = f"{symbol} stable ({change:+.1f}% 24h). Holding target weight."

            # Only recommend if deviation is significant
            weight_diff = abs(adjusted_weight - current_weight)
            if weight_diff > self.rebalance_threshold or signal in (Signal.STRONG_BUY, Signal.STRONG_SELL):
                recommendations.append(TradeRecommendation(
                    symbol=symbol,
                    signal=signal,
                    confidence=min(abs(change) / 5.0, 1.0),
                    target_weight=adjusted_weight,
                    reasoning=reasoning,
                    price_usd=price,
                ))

        return recommendations

    def get_target_allocation(self) -> dict[str, float]:
        return self._target_allocation.copy()
