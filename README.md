# StockPilot AI

**AI-Powered Portfolio Manager for Tokenized Equities (xStocks) on Mantle Network**

> Built for [Mantle Turing Test Hackathon 2026](https://dorahacks.io/hackathon/mantleturingtesthackathon2026) — AI × RWA Track

**[Live Demo](https://out-jsgkcxkc.devinapps.com)** | **[DoraHacks BUIDL](https://dorahacks.io/buidl/43884)** | **[Contract on Mantle](https://mantlescan.xyz/address/0x16c5259964C9B2A411aB69dC9DFbcc2EbC7865A9)**

## Overview

StockPilot AI is an autonomous AI agent that manages portfolios of tokenized equities (xStocks) on Mantle Network. It combines AI-driven analysis with on-chain transparency — every decision the agent makes is recorded permanently on Mantle for verifiable benchmarking.

### Key Features

- **AI-Driven Portfolio Management** — Three strategies (Balanced Growth, Momentum, Value Investing) with LLM-enhanced analysis
- **xStocks Integration** — Direct integration with xStocks tokenized equities on Mantle via xChange Atomic RFQ
- **Fluxion DEX Integration** — Secondary market trading via [Fluxion Network](https://fluxion.network), Mantle's core spot DEX with AMM V2/V3 liquidity
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
│   ├── fluxion/            # Fluxion DEX client (secondary market)
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
| Fluxion DEX | AMM V2/V3 on Mantle ([fluxion.network](https://fluxion.network)) |
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
| StockPilotAgent | Mantle Sepolia | [`0x16c5259964C9B2A411aB69dC9DFbcc2EbC7865A9`](https://sepolia.mantlescan.xyz/address/0x16c5259964C9B2A411aB69dC9DFbcc2EbC7865A9) |
| StockPilotAgent | Mantle Mainnet | [`0x16c5259964C9B2A411aB69dC9DFbcc2EbC7865A9`](https://mantlescan.xyz/address/0x16c5259964C9B2A411aB69dC9DFbcc2EbC7865A9) |

## xStocks Integration

StockPilot AI integrates with [xStocks](https://xstocks.fi) tokenized equities on Mantle:

- **Price Feeds**: Real-time prices from xStocks API (`/public/assets/{symbol}/price-data`)
- **Asset Data**: Token metadata, multipliers, and contract addresses
- **Atomic RFQ (xChange)**: Mint/redeem xStocks at live market prices via xStocks' atomic settlement
- **Supported Assets**: SPYx, NVDAx, AAPLx, TSLAx, MSFTx, AMZNx

## Fluxion DEX Integration

StockPilot AI integrates with [Fluxion Network](https://fluxion.network) — Mantle's core spot DEX — for secondary market trading of xStocks:

- **Smart Routing**: Compares V2 and V3 pools to find optimal execution price
- **Pool Discovery**: Scans all fee tiers (0.01%, 0.05%, 0.3%, 1%) for available liquidity
- **Price Quoting**: Real-time quotes via QuoterV2 (V3) and Router (V2)
- **Liquidity Analysis**: Checks xStock/stablecoin pool availability across all tiers

### Fluxion Contracts on Mantle

| Contract | Address |
|----------|----------|
| V2 Router | [`0xd772E655af24Fe5Af92504D613D1Da0d9cFb6408`](https://mantlescan.xyz/address/0xd772E655af24Fe5Af92504D613D1Da0d9cFb6408) |
| V3 SwapRouter | [`0x5628a59dF0ECAC3f3171f877A94bEb26BA6DFAa0`](https://mantlescan.xyz/address/0x5628a59dF0ECAC3f3171f877A94bEb26BA6DFAa0) |
| V3 QuoterV2 | [`0x3E4eE18Ac7280813236a1EB850679Da5322E14CE`](https://mantlescan.xyz/address/0x3E4eE18Ac7280813236a1EB850679Da5322E14CE) |
| V3 Factory | [`0xF883162Ed9c7E8EF604214c964c678E40c9B737C`](https://mantlescan.xyz/address/0xF883162Ed9c7E8EF604214c964c678E40c9B737C) |

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
| `/api/market-fees` | GET | xStocks fee schedule (issuance/redemption/xChange) |
| `/api/assets/{symbol}/quote` | GET | Real-time Atomic RFQ quote via xChange |
| `/api/assets/{symbol}/multiplier` | GET | Asset multiplier (dividends/splits) |
| `/api/proof-of-reserves` | GET | Proof of reserves for all xStocks |
| `/api/fluxion/contracts` | GET | Fluxion DEX contract addresses |
| `/api/fluxion/pool` | GET | Find best liquidity pool for token pair |
| `/api/fluxion/quote` | GET | Get best swap quote (V2 vs V3) |
| `/api/fluxion/liquidity/{address}` | GET | Check xStock liquidity on Fluxion |

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

## Ecosystem Partners

- [xStocks](https://xstocks.fi) — Tokenized equities (1:1 backed by real stocks)
- [Fluxion Network](https://fluxion.network) — Core spot DEX on Mantle (AMM V2/V3)
- [Mantle Network](https://mantle.xyz) — EVM-compatible L2 with native xStocks support

## License

MIT

## Team

Built with AI assistance for [Mantle Turing Test Hackathon 2026](https://dorahacks.io/hackathon/mantleturingtesthackathon2026)
