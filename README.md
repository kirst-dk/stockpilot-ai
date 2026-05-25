# StockPilot AI

**AI-Powered Portfolio Manager for Tokenized Equities (xStocks) on Mantle Network**

> Built for [Mantle Turing Test Hackathon 2026](https://dorahacks.io/hackathon/mantleturingtesthackathon2026) — AI × RWA Track

**[Live App](https://app.stockpilotai.xyz)** | **[Landing](https://stockpilotai.xyz)** | **[DoraHacks BUIDL](https://dorahacks.io/buidl/43884)** | **[Contract on Mantle](https://mantlescan.xyz/address/0x16c5259964C9B2A411aB69dC9DFbcc2EbC7865A9)**

## Overview

StockPilot AI is an autonomous AI agent that manages portfolios of tokenized equities (xStocks) on Mantle Network. It combines AI-driven analysis with on-chain transparency — every decision the agent makes is recorded permanently on Mantle for verifiable benchmarking.

### Key Features

- **155+ xStocks Assets** — Full integration with all xStocks tokenized equities on Mantle (dynamic loading, searchable)
- **AI-Driven Portfolio Management** — Three strategies (Balanced Growth, Momentum, Value Investing) with LLM-enhanced analysis
- **Fluxion DEX Integration** — On-page swap with 161 tokens, real-time quotes, wallet balance display, native MNT support
- **Liquidity Pools** — Provide liquidity on Fluxion V3 pools with dual-token deposits via NonfungiblePositionManager
- **Cross-Chain Bridge** — Relay.link SwapWidget integrated directly on-page (no external redirects)
- **On-Chain Transparency** — All agent actions (buy/sell/rebalance) recorded on Mantle smart contracts
- **AI Analysis** — Nansen (on-chain analytics) + ELFA AI (market intelligence) + AltLLM (portfolio analysis)
- **ERC-8004 Agent Identity** — Agent has an on-chain identity NFT per hackathon requirements

### How It Works

```
User connects wallet (RainbowKit)
           ↓
Browses 155+ xStocks on Market tab with AI analysis
           ↓
Selects strategy (Balanced / Momentum / Value) or builds custom portfolio
           ↓
AI Agent analyzes portfolio (risk, diversification, recommendations)
           ↓
User buys via Swap tab (Fluxion DEX) or bridges assets (Relay.link)
           ↓
Dashboard shows positions, pools, and strategy performance
```

## App Architecture — 6 Tabs

| Tab | Description |
|-----|-------------|
| **Market** | AI strategies + 155 xStocks with AI info (company/risks) + BUY buttons |
| **Swap** | Fluxion DEX — 161 tokens, searchable selector, real quotes, wallet balances, native MNT |
| **Pools** | Fluxion V3 liquidity pools — 12 pools, dual-token deposit, search/filter |
| **Bridge** | Relay.link SwapWidget — cross-chain bridge to Mantle (on-page, no redirect) |
| **Dashboard** | Portfolio overview, positions, liquidity, strategy allocation |
| **Education** | How it works, partners, contracts, xStocks/Fluxion explainer |

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Smart Contracts | Solidity 0.8.20, OpenZeppelin, Hardhat |
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| Wallet | RainbowKit + Wagmi + Viem |
| DEX | Fluxion Network (Uniswap V3 fork on Mantle) |
| Bridge | Relay.link (`@reservoir0x/relay-kit-ui` SwapWidget) |
| AI | Nansen API + ELFA AI + AltLLM |
| xStocks | 155 tokenized equities (static JSON + API fallback) |
| Network | Mantle (Chain ID: 5000) |

## Project Structure

```
stockpilot-ai/
├── contracts/              # Solidity smart contracts (Mantle)
│   ├── StockPilotAgent.sol # Main agent contract - records all actions on-chain
│   └── interfaces/         # IxStock, IPortfolioManager
├── backend/                # Python FastAPI backend
│   ├── agent/              # AI engine + portfolio agent
│   ├── strategies/         # Trading strategies (balanced, momentum, value)
│   ├── xstocks_api/        # xStocks API client
│   ├── fluxion/            # Fluxion DEX client
│   └── main.py             # FastAPI application
├── frontend/               # Next.js dashboard
│   ├── src/app/
│   │   ├── page.tsx        # Main app (6 tabs, swap, pools, bridge)
│   │   ├── providers.tsx   # RainbowKit + Wagmi + Relay providers
│   │   └── layout.tsx      # HTML layout
│   └── public/
│       └── xstocks-data.json # 155 xStocks static data
└── landing/                # Landing page (stockpilotai.xyz)
```

## Smart Contracts

| Contract | Network | Address |
|----------|---------|---------|
| StockPilotAgent | Mantle Mainnet | [`0x16c5259964C9B2A411aB69dC9DFbcc2EbC7865A9`](https://mantlescan.xyz/address/0x16c5259964C9B2A411aB69dC9DFbcc2EbC7865A9) |
| Fluxion V3 Factory | Mantle | [`0xF883162Ed9c7E8EF604214c964c678E40c9B737C`](https://mantlescan.xyz/address/0xF883162Ed9c7E8EF604214c964c678E40c9B737C) |
| Fluxion V3 SwapRouter | Mantle | [`0x5628a59dF0ECAC3f3171f877A94bEb26BA6DFAa0`](https://mantlescan.xyz/address/0x5628a59dF0ECAC3f3171f877A94bEb26BA6DFAa0) |
| Fluxion PositionManager | Mantle | [`0x2b70C4e7cA8E920435A5dB191e066E9E3AFd8DB3`](https://mantlescan.xyz/address/0x2b70C4e7cA8E920435A5dB191e066E9E3AFd8DB3) |

## Integrations

### xStocks (155 Tokenized Equities)
- **Data:** Static JSON (`/xstocks-data.json`) + API fallback (`api.xstocks.fi`)
- **Assets:** SPYx, NVDAx, AAPLx, TSLAx, MSFTx, AMZNx, GOOGLx, METAx + 147 more
- **Bridge:** 12 bridgeable assets via CCIP (Ethereum, Solana, Arbitrum, Base, etc.)
- **Docs:** https://docs.xstocks.fi

### Fluxion DEX (Swap & Pools)
- **Quote API:** `POST https://skillapi.fluxion.network/quote/exact-in`
- **Swap:** Direct approve + swap through SwapRouter on-page
- **Pools:** NonfungiblePositionManager for liquidity provision
- **Tokens:** USDC, WMNT, USDT, WETH, mETH, native MNT + all xStocks
- **Docs:** https://fluxion-network.gitbook.io/fluxion-network

### Relay.link (Cross-Chain Bridge)
- **Widget:** `@reservoir0x/relay-kit-ui` SwapWidget embedded on-page
- **Destination:** Mantle (chainId: 5000)
- **Sources:** ETH, Arbitrum, Optimism, Base, Polygon, BSC, Avalanche, zkSync
- **Docs:** https://docs.relay.link

### Squid Router (Legacy)
- **Integrator ID:** `stockpilot-ai-83f92aed-1e4a-411f-b5fe-809e52b8158f`
- **API:** https://v2.api.squidrouter.com

### AI & Analytics
- **Nansen** — On-chain analytics, smart money tracking
- **ELFA AI** — Market intelligence, sentiment analysis
- **AltLLM** — Portfolio analysis, risk scoring, recommendations

## Quick Start

### Prerequisites
- Node.js 18+
- A wallet with MNT for gas (Mantle Network)

### Install & Run

```bash
# Frontend
cd frontend && npm install && npm run dev
# → http://localhost:3000

# Build for production
npm run build
# → outputs to out/ (static export)
```

### Deploy

```bash
# Build
cd frontend && npm run build

# Deploy to server
scp -r out/* root@YOUR_SERVER:/var/www/app/
```

## Trading Strategies

### Balanced Growth (Risk: 5/10)
Conservative diversified approach with stop-loss (10%) and take-profit (20%) mechanisms.

### Momentum (Risk: 6/10)
Follows price trends — increases allocation to assets with strong upward momentum.

### Value Investing (Risk: 4/10)
Mean reversion strategy — buys on significant pullbacks, trims on extended rallies.

## Hackathon Tracks

- **Primary**: AI × RWA — AI-powered management of tokenized real-world assets (xStocks)
- **Secondary**: AI Trading & Strategy — Quant strategies with on-chain execution

## Ecosystem Partners

| Partner | Role |
|---------|------|
| [Mantle Network](https://mantle.xyz) | L2 Network |
| [Fluxion Network](https://fluxion.network) | Core spot DEX (Uniswap V3 fork) |
| [xStocks](https://xstocks.fi) | Tokenized equities (155 assets) |
| [Relay.link](https://relay.link) | Cross-chain bridge |
| [Nansen](https://nansen.ai) | On-chain analytics |
| [ELFA AI](https://elfa.ai) | Market intelligence |
| [AltLLM](https://altlayer.io) | AI analysis |
| [RainbowKit](https://rainbowkit.com) | Wallet connection |

## License

MIT
