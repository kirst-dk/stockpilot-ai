"""StockPilot AI — FastAPI Backend for AI-powered xStocks portfolio management on Mantle."""

import asyncio
import os
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv

# Load .env BEFORE importing local modules: several of them read configuration
# (private keys, RPC URLs, AUTOPILOT_* flags) into module-level constants at
# import time, so the environment must be populated first.
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from web3 import Web3

from xstocks_api.client import XStocksClient
from fluxion.client import FluxionClient
from agent.ai_engine import AIEngine
from agent.portfolio_agent import PortfolioAgent, AVAILABLE_STRATEGIES, YIELD_STRATEGIES
from agent.autopilot import autopilot, RISK_PROFILES
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- On-chain config for recording RWA yield decisions ---
MANTLE_RPC_URL = os.getenv("MANTLE_RPC_URL", "https://rpc.mantle.xyz")
STOCKPILOT_CONTRACT_ADDRESS = os.getenv(
    "STOCKPILOT_CONTRACT_ADDRESS", "0xbbE80ACe5c46b49930ff0229762a1A57BE4CA6F4"
)
AGENT_PRIVATE_KEY = os.getenv("AGENT_PRIVATE_KEY") or os.getenv("DEPLOYER_PRIVATE_KEY")

# Minimal ABI for the on-chain yield-decision recorder.
RECORD_YIELD_ABI = [
    {
        "name": "recordYieldDecision",
        "type": "function",
        "inputs": [
            {"type": "uint8", "name": "usdyPct"},
            {"type": "uint8", "name": "stocksPct"},
            {"type": "string", "name": "reason"},
            {"type": "uint256", "name": "usdyYieldBps"},
        ],
        "outputs": [],
        "stateMutability": "nonpayable",
    }
]


def _record_yield_decision_onchain(decision: dict) -> str | None:
    """Record a yield decision on-chain via recordYieldDecision. Returns tx hash or None.

    Sync web3 signing/sending — call via asyncio.to_thread. Never raises: any
    failure (missing key, RPC down, revert) is logged and returns None so the
    endpoint still returns the decision.
    """
    if not AGENT_PRIVATE_KEY:
        logger.warning("No AGENT_PRIVATE_KEY/DEPLOYER_PRIVATE_KEY set — skipping on-chain record")
        return None
    try:
        w3 = Web3(Web3.HTTPProvider(MANTLE_RPC_URL, request_kwargs={"timeout": 15}))
        acct = w3.eth.account.from_key(AGENT_PRIVATE_KEY)
        contract = w3.eth.contract(
            address=Web3.to_checksum_address(STOCKPILOT_CONTRACT_ADDRESS),
            abi=RECORD_YIELD_ABI,
        )
        usdy_yield_bps = int(round(float(decision.get("usdy_yield_pct", 0.0)) * 100))
        tx = contract.functions.recordYieldDecision(
            int(decision["usdy_pct"]),
            int(decision["stocks_pct"]),
            decision["reason"],
            usdy_yield_bps,
        ).build_transaction({
            "from": acct.address,
            "nonce": w3.eth.get_transaction_count(acct.address),
            "chainId": 5000,
            "gas": 500_000,
            "gasPrice": w3.eth.gas_price,
        })
        signed = acct.sign_transaction(tx)
        # web3.py v6 exposes `rawTransaction`; v7 renamed it to `raw_transaction`.
        raw = getattr(signed, "raw_transaction", None) or signed.rawTransaction
        tx_hash = w3.eth.send_raw_transaction(raw)
        return tx_hash.hex()
    except Exception as e:  # noqa: BLE001 - on-chain failures must not crash the endpoint
        logger.error("On-chain recordYieldDecision failed: %s", e)
        return None

# Global instances
xstocks_client: XStocksClient | None = None
fluxion_client: FluxionClient | None = None
agent: PortfolioAgent | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global xstocks_client, fluxion_client, agent

    xstocks_client = XStocksClient(api_key=os.getenv("XSTOCKS_API_KEY"))
    fluxion_client = FluxionClient(rpc_url=os.getenv("MANTLE_RPC_URL", "https://rpc.mantle.xyz"))
    ai_engine = AIEngine(openai_api_key=os.getenv("OPENAI_API_KEY"))
    agent = PortfolioAgent(xstocks_client, ai_engine)
    logger.info("Fluxion DEX client initialized (Mantle Mainnet)")

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


class RwaStrategyRequest(BaseModel):
    wallet_address: str | None = None


class ExecuteRequest(BaseModel):
    recommendations: list[dict]


class AutopilotConfigRequest(BaseModel):
    symbols: list[str] | None = None
    risk_profile: str | None = None
    interval_sec: int | None = None
    notional_usd: float | None = None


class AutopilotToggleRequest(BaseModel):
    enabled: bool


class StrategyPlanRequest(BaseModel):
    amount_usdc: float
    wallet_address: str | None = None
    risk_profile: str | None = None
    symbols: list[str] | None = None
    region: str | None = None


class StrategyRecordRequest(BaseModel):
    regime: int
    w_stocks: int
    w_usdy: int
    w_meth: int
    reason: str | None = None
    tx_hash: str | None = None


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


@app.get("/api/strategy/tokens")
async def strategy_tokens(refresh: bool = False):
    """Tradable xStock universe, synced live with Fluxion pools.

    Verified on-chain each refresh (inactive pools drop out) and, when an
    ETHERSCAN_API_KEY is configured, auto-extended with newly-listed Fluxion
    xStock pools so new tokens appear without any code change.
    """
    from agent.tokens import get_tradable_tokens

    tokens = await asyncio.to_thread(get_tradable_tokens, refresh)
    return {"tokens": tokens, "count": len(tokens)}


@app.post("/api/strategy/plan")
async def strategy_plan(req: StrategyPlanRequest):
    """Manual cycle: analyse the market for a USDC amount and return the 3-layer
    target weights plus the concrete swap legs the user signs in ONE transaction.

    Pure analysis — no on-chain writes and no funds moved. Legs are sized to
    rebalance the whole portfolio toward target weights using only the new USDC.
    """
    from agent.manual import build_plan

    plan = await build_plan(
        amount_usdc=req.amount_usdc,
        user_wallet=req.wallet_address,
        risk_profile=(req.risk_profile or "balanced"),
        symbols=req.symbols,
        region=req.region,
    )
    if not plan.get("ok"):
        raise HTTPException(400, plan.get("error", "plan failed"))
    return plan


@app.get("/api/strategy/usdy_quote")
async def strategy_usdy_quote(amount_usdc: float = 0.0, side: str = "buy", wallet: str = ""):
    """Fresh pre-trade quote for the USDY layer, fetched right before signing.

    For "buy" it returns the **best route** (Relay primary, Agni multi-hop
    fallback) with the ready-to-sign execution payload: Relay ``steps`` +
    ``request_id`` or Agni ``path`` + ``min_out``, plus the honest ``routes``
    comparison, price impact (bps) and fee breakdown. "sell" stays on Agni
    (amount_usdc is interpreted as USDY).
    """
    from agent.portfolio_reader import _w3
    from agent import agni, routing

    w3 = await asyncio.to_thread(_w3)
    if side == "sell":
        return await asyncio.to_thread(agni.quote_usdy_sell, w3, amount_usdc)
    return await asyncio.to_thread(routing.best_usdy_buy, w3, wallet, amount_usdc)


@app.get("/api/strategy/relay_status")
async def strategy_relay_status(request_id: str = ""):
    """Proxy the Relay intent status so the frontend can poll fulfilment.

    Same-chain swaps fill in the swap tx itself; this lets the UI confirm the
    Relay solver marked the request ``success`` before showing the USDY balance.
    """
    from agent import relay

    return await asyncio.to_thread(relay.get_status, request_id)


@app.get("/api/strategy/portfolio")
async def strategy_portfolio(wallet: str = ""):
    """Real on-chain holdings of ``wallet`` across the 3 layers + cash, valued in USD.

    Reads USDC, USDY, mETH and every live xStock (original + ERC-4626 wrapper) from
    the dynamic Fluxion token list, so the Builder shows the actual Portfolio Value,
    per-asset list and allocation % instead of a blank profile.
    """
    from agent.portfolio_reader import read_agent_portfolio

    if not wallet:
        raise HTTPException(400, "wallet query param required")
    pf = await asyncio.to_thread(read_agent_portfolio, wallet, None)
    return pf


@app.post("/api/strategy/record")
async def strategy_record(req: StrategyRecordRequest):
    """Record a confirmed manual-cycle decision on-chain (recordDecision).

    Called by the frontend after the user's execution tx is mined so the cycle
    appears in Decision History with the live regime/weights/reason.
    """
    from agent.autopilot import Regime, record_decision_onchain

    reason = (req.reason or "manual cycle")
    if req.tx_hash:
        reason = f"{reason} | exec={req.tx_hash[:14]}"
    tx_hash = await asyncio.to_thread(
        record_decision_onchain,
        Regime(req.regime),
        (req.w_stocks, req.w_usdy, req.w_meth),
        reason,
    )
    return {"tx_hash": tx_hash, "recorded": tx_hash is not None}


@app.get("/api/strategies")
async def list_strategies():
    """List available trading strategies."""
    return {
        "strategies": list(AVAILABLE_STRATEGIES.keys()),
        "yield_strategies": list(YIELD_STRATEGIES.keys()),
        "current": agent.state.strategy_name if agent else None,
    }


@app.post("/api/strategy/rwa_balanced")
async def run_rwa_strategy(req: RwaStrategyRequest):
    """Run the RWA Balanced (AI Yield Optimizer) strategy.

    1. Reads the live USDY yield from the Ondo Oracle on Mantle.
    2. Gets ELFA market sentiment for the portfolio's top xStocks.
    3. Decides the USDY/xStocks allocation split.
    4. Records the decision on-chain via recordYieldDecision.
    5. Returns the decision plus the on-chain tx hash (null if unavailable).
    """
    if not agent:
        raise HTTPException(500, "Agent not initialized")
    try:
        decision = await agent.run_yield_strategy(
            "rwa_balanced", wallet_address=req.wallet_address
        )
        if "error" in decision:
            raise HTTPException(400, decision["error"])

        # Record on-chain (best-effort: returns None if no signer / RPC issue).
        tx_hash = await asyncio.to_thread(_record_yield_decision_onchain, decision)

        return {**decision, "tx_hash": tx_hash}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"RWA strategy error: {e}")
        raise HTTPException(500, str(e))


# --- Autopilot: Autonomous RWA Yield Agent ---

@app.get("/api/autopilot/status")
async def autopilot_status():
    """Current autopilot config, last/next run, and last decision."""
    return autopilot.status()


@app.get("/api/autopilot/profiles")
async def autopilot_profiles():
    """Available risk profiles (affect regime thresholds)."""
    return {"profiles": list(RISK_PROFILES.keys()), "current": autopilot.risk_profile}


@app.post("/api/autopilot/config")
async def autopilot_config(req: AutopilotConfigRequest):
    """Configure the agent: 3-5 xStocks, risk profile, interval, notional."""
    result = autopilot.configure(
        symbols=req.symbols,
        risk_profile=req.risk_profile,
        interval_sec=req.interval_sec,
        notional_usd=req.notional_usd,
    )
    if "error" in result:
        raise HTTPException(400, result["error"])
    return result


@app.post("/api/autopilot/toggle")
async def autopilot_toggle(req: AutopilotToggleRequest):
    """Switch between Manual (off) and Autopilot (on). Starts/stops the rebalance loop."""
    return autopilot.start() if req.enabled else autopilot.stop()


@app.post("/api/autopilot/run")
async def autopilot_run():
    """Trigger one full autonomous cycle now (analysis -> regime -> rebalance -> recordDecision)."""
    result = await autopilot.run_cycle(record=True)
    if "error" in result:
        raise HTTPException(409, result["error"])
    return result


class DcaStartRequest(BaseModel):
    amount_usdc: float
    risk_profile: str | None = None
    duration_sec: int
    interval_sec: int
    symbols: list[str] | None = None


@app.post("/api/autopilot/dca/start")
async def autopilot_dca_start(req: DcaStartRequest):
    """Start a time-sliced DCA plan (deposit model — autonomous tranche buys)."""
    from agent.dca import dca

    result = dca.start(
        amount_usdc=req.amount_usdc,
        risk_profile=(req.risk_profile or "balanced"),
        duration_sec=req.duration_sec,
        interval_sec=req.interval_sec,
        symbols=req.symbols,
    )
    if "error" in result:
        raise HTTPException(400, result["error"])
    return result


@app.get("/api/autopilot/dca/status")
async def autopilot_dca_status():
    """Progress of the active DCA plan (cycles done/total, spent/remaining, next run)."""
    from agent.dca import dca

    return dca.status()


@app.post("/api/autopilot/dca/stop")
async def autopilot_dca_stop():
    """Stop the active DCA plan (remaining capital is left untouched)."""
    from agent.dca import dca

    return dca.stop()


@app.get("/api/autopilot/activity")
async def autopilot_activity(limit: int = 20):
    """Recent agent decisions (newest first) for the Agent Activity feed."""
    return {"decisions": autopilot.history[: max(1, min(limit, 50))]}


@app.get("/api/autopilot/portfolio")
async def autopilot_portfolio():
    """Agent wallet's real on-chain holdings valued in USD (current allocation).

    Counts the ORIGINAL xStock tokens plus their ERC-4626 wrappers, so a wallet
    holding e.g. NVDAx shows its true USD value rather than ~0.
    """
    return await autopilot.portfolio()


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


@app.get("/api/market-fees")
async def get_market_fees():
    """Get xStocks fee schedule for issuance, redemption, and xChange operations."""
    if not xstocks_client:
        raise HTTPException(500, "xStocks client not initialized")
    try:
        fees = await xstocks_client.get_market_fees()
        return fees
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/assets/{symbol}/quote")
async def get_xchange_quote(symbol: str):
    """Get real-time Atomic RFQ quote for an xStock via xChange (Fluxion)."""
    if not xstocks_client:
        raise HTTPException(500, "xStocks client not initialized")
    try:
        quote = await xstocks_client.get_xchange_quote(symbol)
        return quote
    except Exception as e:
        raise HTTPException(404, f"Quote for {symbol} not available: {e}")


@app.get("/api/assets/{symbol}/multiplier")
async def get_asset_multiplier(symbol: str):
    """Get current multiplier for an xStock (reflects dividends/splits)."""
    if not xstocks_client:
        raise HTTPException(500, "xStocks client not initialized")
    try:
        multiplier = await xstocks_client.get_multiplier(symbol)
        return multiplier
    except Exception as e:
        raise HTTPException(404, f"Multiplier for {symbol} not found: {e}")


@app.get("/api/proof-of-reserves")
async def get_proof_of_reserves():
    """Get proof of reserves data for all xStock assets."""
    if not xstocks_client:
        raise HTTPException(500, "xStocks client not initialized")
    try:
        por = await xstocks_client.get_proof_of_reserves()
        return por
    except Exception as e:
        raise HTTPException(500, str(e))


# --- Fluxion DEX Endpoints ---

@app.get("/api/fluxion/contracts")
async def get_fluxion_contracts():
    """Get Fluxion Network DEX contract addresses on Mantle."""
    if not fluxion_client:
        raise HTTPException(500, "Fluxion client not initialized")
    return {
        "dex": "Fluxion Network",
        "network": "Mantle Mainnet",
        "docs": "https://fluxion-network.gitbook.io/fluxion-network",
        "site": "https://fluxion.network",
        "contracts": fluxion_client.get_contract_addresses(),
    }


@app.get("/api/fluxion/pool")
async def get_fluxion_pool(token_a: str, token_b: str):
    """Find best Fluxion liquidity pool for a token pair."""
    if not fluxion_client:
        raise HTTPException(500, "Fluxion client not initialized")
    try:
        result = fluxion_client.find_best_pool(token_a, token_b)
        return result
    except Exception as e:
        raise HTTPException(400, f"Pool lookup failed: {e}")


@app.get("/api/fluxion/quote")
async def get_fluxion_quote(token_in: str, token_out: str, amount_in: str):
    """Get best swap quote from Fluxion DEX (compares V2 and V3 pools).

    Args:
        token_in: Input token address
        token_out: Output token address
        amount_in: Amount in wei (string to handle large numbers)
    """
    if not fluxion_client:
        raise HTTPException(500, "Fluxion client not initialized")
    try:
        result = fluxion_client.get_best_quote(
            token_in, token_out, int(amount_in)
        )
        if "error" in result:
            raise HTTPException(404, result["error"])
        return result
    except ValueError:
        raise HTTPException(400, "amount_in must be a valid integer (wei)")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Quote failed: {e}")


@app.get("/api/fluxion/liquidity/{xstock_address}")
async def get_xstock_fluxion_liquidity(xstock_address: str):
    """Check available Fluxion liquidity pools for an xStock token."""
    if not fluxion_client:
        raise HTTPException(500, "Fluxion client not initialized")
    try:
        result = fluxion_client.get_xstock_liquidity_info(xstock_address)
        return result
    except Exception as e:
        raise HTTPException(400, f"Liquidity check failed: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
