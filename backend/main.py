"""StockPilot AI — FastAPI Backend for AI-powered xStocks portfolio management on Mantle."""

import os
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from xstocks_api.client import XStocksClient
from agent.ai_engine import AIEngine
from agent.portfolio_agent import PortfolioAgent, AVAILABLE_STRATEGIES

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global instances
xstocks_client: XStocksClient | None = None
agent: PortfolioAgent | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global xstocks_client, agent

    xstocks_client = XStocksClient(api_key=os.getenv("XSTOCKS_API_KEY"))
    ai_engine = AIEngine(openai_api_key=os.getenv("OPENAI_API_KEY"))
    agent = PortfolioAgent(xstocks_client, ai_engine)

    # Start with some simulated capital
    agent.deposit(100_000.0)
    logger.info("StockPilot AI agent initialized with $100,000 simulated capital")

    yield

    if xstocks_client:
        await xstocks_client.close()


app = FastAPI(
    title="StockPilot AI",
    description="AI-powered portfolio manager for tokenized equities (xStocks) on Mantle Network",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request Models ---

class DepositRequest(BaseModel):
    amount_usd: float


class StrategyRequest(BaseModel):
    strategy: str


class ExecuteRequest(BaseModel):
    recommendations: list[dict]


# --- Endpoints ---

@app.get("/")
async def root():
    return {
        "name": "StockPilot AI",
        "description": "AI-powered xStocks portfolio manager on Mantle",
        "version": "1.0.0",
        "network": "Mantle (Chain ID: 5000)",
        "tracks": ["AI x RWA", "AI Trading & Strategy"],
    }


@app.get("/api/health")
async def health():
    return {"status": "ok", "agent": agent is not None}


@app.get("/api/market")
async def get_market_data():
    """Fetch current xStocks market data from the API."""
    if not xstocks_client:
        raise HTTPException(500, "xStocks client not initialized")
    try:
        data = await agent.get_market_data()
        return data
    except Exception as e:
        logger.error(f"Market data error: {e}")
        raise HTTPException(500, str(e))


@app.get("/api/assets")
async def get_assets():
    """List all available xStocks assets on Mantle."""
    if not xstocks_client:
        raise HTTPException(500, "xStocks client not initialized")
    try:
        assets = await xstocks_client.get_all_assets()
        return assets
    except Exception as e:
        logger.error(f"Assets error: {e}")
        raise HTTPException(500, str(e))


@app.get("/api/assets/{symbol}/price")
async def get_asset_price(symbol: str):
    """Get current price for a specific xStock token."""
    if not xstocks_client:
        raise HTTPException(500, "xStocks client not initialized")
    try:
        price = await xstocks_client.get_asset_price(symbol)
        return price
    except Exception as e:
        raise HTTPException(404, f"Asset {symbol} not found: {e}")


@app.get("/api/portfolio")
async def get_portfolio():
    """Get current portfolio state."""
    if not agent:
        raise HTTPException(500, "Agent not initialized")
    return agent.get_performance()


@app.get("/api/analyze")
async def analyze_portfolio():
    """Run AI analysis on the portfolio and get recommendations."""
    if not agent:
        raise HTTPException(500, "Agent not initialized")
    try:
        analysis = await agent.analyze()
        return analysis
    except Exception as e:
        logger.error(f"Analysis error: {e}")
        raise HTTPException(500, str(e))


@app.post("/api/execute")
async def execute_trades(req: ExecuteRequest):
    """Execute trade recommendations."""
    if not agent:
        raise HTTPException(500, "Agent not initialized")
    try:
        results = await agent.execute_recommendations(req.recommendations)
        return {"executed": results, "portfolio": agent.get_performance()}
    except Exception as e:
        logger.error(f"Execution error: {e}")
        raise HTTPException(500, str(e))


@app.post("/api/deposit")
async def deposit(req: DepositRequest):
    """Deposit funds into the agent portfolio."""
    if not agent:
        raise HTTPException(500, "Agent not initialized")
    if req.amount_usd <= 0:
        raise HTTPException(400, "Amount must be positive")
    result = agent.deposit(req.amount_usd)
    return result


@app.post("/api/strategy")
async def set_strategy(req: StrategyRequest):
    """Change the active trading strategy."""
    if not agent:
        raise HTTPException(500, "Agent not initialized")
    result = agent.set_strategy(req.strategy)
    if "error" in result:
        raise HTTPException(400, result["error"])
    return result


@app.get("/api/strategies")
async def list_strategies():
    """List available trading strategies."""
    return {
        "strategies": list(AVAILABLE_STRATEGIES.keys()),
        "current": agent.state.strategy_name if agent else None,
    }


@app.get("/api/history")
async def get_history():
    """Get trade execution history."""
    if not agent:
        raise HTTPException(500, "Agent not initialized")
    return {"history": agent.state.action_history}


@app.get("/api/mantle-tokens")
async def get_mantle_tokens():
    """Get xStock tokens deployed on Mantle network."""
    if not xstocks_client:
        raise HTTPException(500, "xStocks client not initialized")
    try:
        tokens = await xstocks_client.get_mantle_deployments()
        return {"tokens": tokens}
    except Exception as e:
        raise HTTPException(500, str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
