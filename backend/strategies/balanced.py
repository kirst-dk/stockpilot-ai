"""Balanced growth strategy for xStocks portfolio management."""

from .base import BaseStrategy, TradeRecommendation, Signal, PortfolioState


class BalancedStrategy(BaseStrategy):
    """Balanced strategy that maintains diversified allocation.

    Focuses on risk-adjusted returns with periodic rebalancing
    back to target weights.
    """

    def __init__(self, risk_level: int = 5):
        super().__init__("Balanced Growth", risk_level)
        self.rebalance_threshold = 0.03  # 3% deviation triggers rebalance
        self.stop_loss_pct = 0.10  # 10% stop loss
        self.take_profit_pct = 0.20  # 20% take profit

        self._target_allocation = {
            "SPYx": 0.30,   # S&P 500 ETF - broad market
            "NVDAx": 0.15,  # NVIDIA - growth
            "AAPLx": 0.15,  # Apple - quality
            "MSFTx": 0.15,  # Microsoft - quality
            "AMZNx": 0.10,  # Amazon - growth
            "TSLAx": 0.10,  # Tesla - high risk/reward
        }

    async def analyze(
        self,
        portfolio: PortfolioState,
        market_data: dict,
    ) -> list[TradeRecommendation]:
        recommendations = []
        prices = portfolio.prices
        entry_prices = market_data.get("entry_prices", {})

        for symbol, target_weight in self._target_allocation.items():
            price = prices.get(symbol, 0)
            if price <= 0:
                continue

            current_amount = portfolio.positions.get(symbol, 0)
            current_value = current_amount * price
            current_weight = current_value / portfolio.total_value_usd if portfolio.total_value_usd > 0 else 0

            entry_price = entry_prices.get(symbol, price)
            pnl_pct = (price - entry_price) / entry_price if entry_price > 0 else 0

            # Check stop loss / take profit
            if pnl_pct <= -self.stop_loss_pct and current_amount > 0:
                recommendations.append(TradeRecommendation(
                    symbol=symbol,
                    signal=Signal.STRONG_SELL,
                    confidence=0.9,
                    target_weight=0,
                    reasoning=f"STOP LOSS triggered: {symbol} down {pnl_pct*100:.1f}% from entry. Exiting position.",
                    price_usd=price,
                ))
                continue

            if pnl_pct >= self.take_profit_pct and current_amount > 0:
                # Take partial profits - reduce to half the target weight
                recommendations.append(TradeRecommendation(
                    symbol=symbol,
                    signal=Signal.SELL,
                    confidence=0.7,
                    target_weight=target_weight * 0.5,
                    reasoning=f"TAKE PROFIT: {symbol} up {pnl_pct*100:.1f}% from entry. Taking partial profits.",
                    price_usd=price,
                ))
                continue

            # Standard rebalancing
            weight_diff = target_weight - current_weight
            if abs(weight_diff) > self.rebalance_threshold:
                if weight_diff > 0:
                    signal = Signal.BUY
                    reasoning = f"Rebalancing: {symbol} underweight by {weight_diff*100:.1f}%. Buying to target."
                else:
                    signal = Signal.SELL
                    reasoning = f"Rebalancing: {symbol} overweight by {abs(weight_diff)*100:.1f}%. Trimming to target."

                recommendations.append(TradeRecommendation(
                    symbol=symbol,
                    signal=signal,
                    confidence=0.6,
                    target_weight=target_weight,
                    reasoning=reasoning,
                    price_usd=price,
                ))

        return recommendations

    def get_target_allocation(self) -> dict[str, float]:
        return self._target_allocation.copy()
