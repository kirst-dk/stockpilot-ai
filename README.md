# StockPilot AI

**AI-Powered Portfolio Manager for Tokenized Equities (xStocks) on Mantle Network**

> Built for [Mantle Turing Test Hackathon 2026](https://dorahacks.io/hackathon/mantleturingtesthackathon2026) — AI × RWA Track

## Overview

StockPilot AI is an autonomous AI agent that manages portfolios of tokenized equities (xStocks) on Mantle Network. It combines AI-driven analysis with on-chain transparency — every decision the agent makes is recorded permanently on Mantle for verifiable benchmarking.

### Key Features

- **AI-Driven Portfolio Management** — Three strategies (Balanced Growth, Momentum, Value Investing) with LLM-enhanced analysis
- **xStocks Integration** — Direct integration with xStocks tokenized equities on Mantle via xChange Atomic RFQ
- **On-Chain Transparency** — All agent actions (buy/sell/rebalance) recorded on Mantle smart contracts
- **Real-Time Dashboard** — Beautiful UI showing portfolio, market data, AI recommendations, and trade history
- **ERC-8004 Agent Identity** — Agent has an on-chain identity NFT per hackathon requirements

### How It Works

```
User selects strategy (Balanced / Momentum / Value)
           ↓
AI Agent fetches xStocks prices via API
           ↓
Strategy engine generates trade recommendations
           ↓
AI (GPT-4o-mini) validates and enhances recommendations
           ↓
Agent executes trades via xStocks Atomic RFQ on Mantle
           ↓
All actions recorded on-chain for transparency
```

## Architecture

```
stockpilot-ai/
├── contracts/              # Solidity smart contracts (Mantle)
│   ├── StockPilotAgent.sol # Main agent contract - records all actions on-chain
│   └── interfaces/         # IxStock, IPortfolioManager
├── backend/                # Python FastAPI backend
│   ├── agent/              # AI engine + portfolio agent
│   ├── strategies/         # Trading strategies (balanced, momentum, value)
│   ├── xstocks_api/        # xStocks API client
│   └── main.py             # FastAPI application
├── frontend/               # Next.js dashboard
│   └── src/app/            # React UI components
└── scripts/                # Deployment scripts
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Smart Contracts | Solidity 0.8.20, OpenZeppelin, Hardhat |
| Backend | Python 3.11, FastAPI, OpenAI API |
| Frontend | Next.js 14, React 18, TypeScript |
| xStocks API | REST API (`api.backed.fi/api/v2`) |
| Network | Mantle (Chain ID: 5000) |
| AI | GPT-4o-mini for analysis enhancement |

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.11+
- A Mantle wallet with MNT for gas

### 1. Install Dependencies

```bash
# Root (smart contracts)
npm install

# Backend
cd backend && pip install -r requirements.txt

# Frontend
cd frontend && npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your keys
```

### 3. Compile & Deploy Contracts

```bash
# Compile
npm run compile

# Deploy to Mantle Sepolia testnet
npm run deploy:testnet

# Deploy to Mantle mainnet
npm run deploy:mainnet
```

### 4. Start Backend

```bash
cd backend
python main.py
# API available at http://localhost:8000
```

### 5. Start Frontend

```bash
cd frontend
npm run dev
# Dashboard at http://localhost:3000
```

## Smart Contract — Mantle Deployment

| Contract | Network | Address |
|----------|---------|---------|
| StockPilotAgent | Mantle Sepolia | TBD |
| StockPilotAgent | Mantle Mainnet | TBD |

## xStocks Integration

StockPilot AI integrates with [xStocks](https://xstocks.fi) tokenized equities on Mantle:

- **Price Feeds**: Real-time prices from xStocks API (`/public/assets/{symbol}/price-data`)
- **Asset Data**: Token metadata, multipliers, and contract addresses
- **Atomic RFQ**: Mint/redeem xStocks at live market prices via xChange (Fluxion integration)
- **Supported Assets**: SPYx, NVDAx, AAPLx, TSLAx, MSFTx, AMZNx

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/market` | GET | Current xStocks market data |
| `/api/assets` | GET | All available xStocks assets |
| `/api/portfolio` | GET | Current portfolio state |
| `/api/analyze` | GET | Run AI analysis, get recommendations |
| `/api/execute` | POST | Execute trade recommendations |
| `/api/strategy` | POST | Change trading strategy |
| `/api/strategies` | GET | List available strategies |
| `/api/history` | GET | Trade execution history |

## Trading Strategies

### Balanced Growth (Risk: 5/10)
Conservative diversified approach with stop-loss (10%) and take-profit (20%) mechanisms. Periodic rebalancing to target weights.

### Momentum (Risk: 6/10)
Follows price trends — increases allocation to assets with strong upward momentum, reduces exposure to underperformers.

### Value Investing (Risk: 4/10)
Mean reversion strategy — buys on significant pullbacks, trims on extended rallies. Heavier allocation to stable, cash-rich companies.

## Hackathon Tracks

- **Primary**: AI × RWA — AI-powered management of tokenized real-world assets (xStocks)
- **Secondary**: AI Trading & Strategy — Quant strategies with on-chain execution

## License

MIT

## Team

Built with AI assistance for [Mantle Turing Test Hackathon 2026](https://dorahacks.io/hackathon/mantleturingtesthackathon2026)
