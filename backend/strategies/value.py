"""Value investing strategy for xStocks — focuses on undervalued equities."""

from .base import BaseStrategy, TradeRecommendation, Signal, PortfolioState


class ValueStrategy(BaseStrategy):
    """Value strategy that identifies undervalued equities.

    Uses fundamental analysis signals and mean reversion principles
    to find buying opportunities in quality stocks trading below fair value.
    """

    def __init__(self, risk_level: int = 4):
        super().__init__("Value Investing", risk_level)
        self.rebalance_threshold = 0.04
        self.margin_of_safety = 0.15  # 15% below fair value to buy

        # Value-oriented allocation (heavier on stable, dividend-paying stocks)
        self._target_allocation = {
            "SPYx": 0.30,   # S&P 500 ETF - broad market value
            "AAPLx": 0.20,  # Apple - cash-rich, buybacks
            "MSFTx": 0.20,  # Microsoft - stable earnings
            "AMZNx": 0.15,  # Amazon - growth at reasonable price
            "NVDAx": 0.10,  # NVIDIA - growth (smaller allocation due to valuation)
            "TSLAx": 0.05,  # Tesla - small speculative position
        }

    async def analyze(
        self,
        portfolio: PortfolioState,
        market_data: dict,
    ) -> list[TradeRecommendation]:
        recommendations = []
        prices = portfolio.prices
        price_changes_7d = market_data.get("price_changes_7d", {})

        for symbol, target_weight in self._target_allocation.items():
            price = prices.get(symbol, 0)
            if price <= 0:
                continue

            current_amount = portfolio.positions.get(symbol, 0)
            current_value = current_amount * price
            current_weight = current_value / portfolio.total_value_usd if portfolio.total_value_usd > 0 else 0

            change_7d = price_changes_7d.get(symbol, 0)

            # Value logic: buy dips, trim rallies
            if change_7d < -5:
                # Significant pullback — potential value opportunity
                adjusted_weight = min(target_weight * 1.4, 0.35)
                signal = Signal.STRONG_BUY
                reasoning = f"VALUE: {symbol} pulled back {change_7d:.1f}% in 7d. Increasing allocation on discount."
                confidence = 0.8
            elif change_7d < -2:
                adjusted_weight = target_weight * 1.15
                signal = Signal.BUY
                reasoning = f"VALUE: {symbol} dipped {change_7d:.1f}% in 7d. Buying the dip."
                confidence = 0.6
            elif change_7d > 8:
                # Extended rally — trim back
                adjusted_weight = target_weight * 0.7
                signal = Signal.SELL
                reasoning = f"VALUE: {symbol} rallied {change_7d:.1f}% in 7d. Trimming extended position."
                confidence = 0.65
            else:
                adjusted_weight = target_weight
                signal = Signal.HOLD
                reasoning = f"VALUE: {symbol} within normal range ({change_7d:+.1f}% 7d). Holding."
                confidence = 0.5

            weight_diff = abs(adjusted_weight - current_weight)
            if weight_diff > self.rebalance_threshold or signal in (Signal.STRONG_BUY, Signal.STRONG_SELL):
                recommendations.append(TradeRecommendation(
                    symbol=symbol,
                    signal=signal,
                    confidence=confidence,
                    target_weight=adjusted_weight,
                    reasoning=reasoning,
                    price_usd=price,
                ))

        return recommendations

    def get_target_allocation(self) -> dict[str, float]:
        return self._target_allocation.copy()
