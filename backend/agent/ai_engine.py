"""AI Engine for StockPilot — orchestrates analysis and decision-making."""

import json
import logging
from typing import Optional

from openai import AsyncOpenAI

from ..strategies.base import PortfolioState, TradeRecommendation, Signal

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are StockPilot AI, an autonomous portfolio management agent 
for tokenized equities (xStocks) on Mantle Network. You analyze market data, news, 
and on-chain metrics to make intelligent portfolio decisions.

Your decisions are recorded on-chain for full transparency.

When analyzing, consider:
1. Current market conditions and macro trends
2. Individual stock fundamentals and momentum
3. Portfolio diversification and risk management
4. Current position sizes vs target allocations

Respond with structured JSON containing your analysis and recommendations."""


class AIEngine:
    """AI decision engine that enhances strategy recommendations with LLM reasoning."""

    def __init__(self, openai_api_key: Optional[str] = None):
        self.client = AsyncOpenAI(api_key=openai_api_key) if openai_api_key else None

    async def enhance_recommendations(
        self,
        recommendations: list[TradeRecommendation],
        portfolio: PortfolioState,
        market_context: dict,
    ) -> list[TradeRecommendation]:
        """Use AI to enhance and validate strategy recommendations."""
        if not self.client:
            return recommendations

        try:
            market_summary = json.dumps({
                "portfolio_value_usd": portfolio.total_value_usd,
                "cash_usd": portfolio.cash_usd,
                "positions": {s: {"amount": a, "price": portfolio.prices.get(s, 0)}
                              for s, a in portfolio.positions.items()},
                "recommendations": [
                    {
                        "symbol": r.symbol,
                        "signal": r.signal.value,
                        "target_weight": r.target_weight,
                        "reasoning": r.reasoning,
                        "price": r.price_usd,
                    }
                    for r in recommendations
                ],
                "market_context": market_context,
            }, indent=2)

            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"""Analyze these portfolio recommendations and market data.
Validate each recommendation and add your reasoning.
If you disagree with any recommendation, explain why.

{market_summary}

Respond with JSON array:
[{{"symbol": "...", "signal": "buy|sell|hold|strong_buy|strong_sell", 
   "confidence": 0.0-1.0, "target_weight": 0.0-1.0, 
   "reasoning": "Your detailed analysis..."}}]"""},
                ],
                response_format={"type": "json_object"},
                temperature=0.3,
                max_tokens=2000,
            )

            result = json.loads(response.choices[0].message.content)
            ai_recs = result.get("recommendations", result.get("analysis", []))

            if isinstance(ai_recs, list):
                enhanced = []
                for ai_rec in ai_recs:
                    try:
                        enhanced.append(TradeRecommendation(
                            symbol=ai_rec["symbol"],
                            signal=Signal(ai_rec["signal"]),
                            confidence=float(ai_rec.get("confidence", 0.5)),
                            target_weight=float(ai_rec.get("target_weight", 0)),
                            reasoning=ai_rec.get("reasoning", "AI analysis"),
                            price_usd=float(ai_rec.get("price_usd", 0)),
                        ))
                    except (KeyError, ValueError) as e:
                        logger.warning(f"Failed to parse AI recommendation: {e}")
                        continue
                return enhanced if enhanced else recommendations

        except Exception as e:
            logger.warning(f"AI enhancement failed, using base recommendations: {e}")

        return recommendations

    async def generate_market_summary(self, prices: dict[str, float], changes: dict) -> str:
        """Generate a human-readable market summary using AI."""
        if not self.client:
            return self._basic_market_summary(prices, changes)

        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "Generate a brief, insightful market summary for tokenized equities."},
                    {"role": "user", "content": f"Current prices: {json.dumps(prices)}\nPrice changes: {json.dumps(changes)}"},
                ],
                max_tokens=300,
            )
            return response.choices[0].message.content
        except Exception:
            return self._basic_market_summary(prices, changes)

    def _basic_market_summary(self, prices: dict[str, float], changes: dict) -> str:
        lines = ["Market Overview:"]
        for symbol, price in prices.items():
            change = changes.get("24h", {}).get(symbol, 0)
            direction = "up" if change > 0 else "down" if change < 0 else "flat"
            lines.append(f"  {symbol}: ${price:.2f} ({direction} {abs(change):.1f}%)")
        return "\n".join(lines)
