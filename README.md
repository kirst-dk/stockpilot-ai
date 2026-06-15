# StockPilot AI

**AI-Powered Portfolio Manager for Tokenized Equities (xStocks) on Mantle Network**

> Built for [Mantle Turing Test Hackathon 2026](https://dorahacks.io/hackathon/mantleturingtesthackathon2026) — AI × RWA Track

**[Live App](https://app.stockpilotai.xyz)** | **[Landing](https://stockpilotai.xyz)** | **[Demo Video](https://youtu.be/XTwdpAhcoTo)** | **[DoraHacks BUIDL](https://dorahacks.io/buidl/43884)** | **[X / @0xkirst](https://x.com/0xkirst)** | **[Contract on Mantle](https://mantlescan.xyz/address/0xbbE80ACe5c46b49930ff0229762a1A57BE4CA6F4)**

> **Demo video:** https://youtu.be/XTwdpAhcoTo

## Overview

StockPilot AI is an autonomous AI agent that manages portfolios of tokenized equities (xStocks) on Mantle Network. It combines AI-driven analysis with on-chain transparency — every decision the agent makes is recorded permanently on Mantle for verifiable benchmarking.

### Key Features

- **Redesigned multi-route app** — rebuilt as a Next.js App Router experience with a left sidebar, 7 deep-linkable routes, and a consistent design system
- **Real-time xStock price ticker** — live tokenized-equity prices (SPYx, NVDAx, AAPLx, TSLAx…) with 24h change across the top, not crypto pairs
- **155+ xStocks Assets** — Full integration with all xStocks tokenized equities on Mantle (dynamic loading, searchable)
- **Fluxion DEX Integration** — On-page swap with real-time quotes, ERC-4626 auto-wrapping, native MNT support, wallet balances
- **Cross-Chain Bridge** — Relay.link SwapWidget integrated on-page across 65+ EVM networks (no external redirects)
- **AI-Driven Portfolio Management** — Three strategies (Balanced Growth, Momentum, Value Investing) with LLM-enhanced analysis
- **Stocky AI assistant** — floating concierge (Nansen + ELFA + AltLLM, tool-calling chat) available on every route
- **On-Chain Transparency** — Agent actions (buy/sell/rebalance) recorded on Mantle smart contracts; ERC-8004 agent identity NFT
- **AI Analysis** — Nansen (on-chain analytics) + ELFA AI (market intelligence) + AltLLM (portfolio analysis)
- **Fully mobile responsive** — hamburger menu + bottom navigation bar, no horizontal scroll (tested at 400px)
- **Premium 3D landing** — real-time Three.js / WebGL hero with an infinite xStock token stream and a rich `prefers-reduced-motion` fallback

### How It Works

```
User connects wallet (RainbowKit)
           ↓
Browses 155+ xStocks on the Market route with AI analysis
           ↓
Selects strategy (Balanced / Momentum / Value) or builds custom portfolio
           ↓
AI Agent analyzes portfolio (risk, diversification, recommendations)
           ↓
User buys via Swap (Fluxion DEX) or bridges assets (Relay.link)
           ↓
Dashboard shows positions and strategy performance
```

## App Architecture — Multi-Route (7 sidebar routes)

The app was rebuilt as a Next.js App Router project with a left sidebar. Every route is deep-linkable (`trailingSlash`) and directly shareable/reloadable.

| Route | Description |
|-------|-------------|
| **Dashboard** (`/`) | Portfolio overview, positions, strategy allocation |
| **Market** (`/market`) | 155 xStocks with AI info (company/risks) + BUY buttons |
| **Swap** (`/swap`) | Fluxion DEX — searchable selector, real quotes, wallet balances, native MNT, ERC-4626 wrapping |
| **Bridge** (`/bridge`) | Relay.link SwapWidget — cross-chain bridge to Mantle across 65+ networks (on-page, no redirect) |
| **Portfolio** (`/portfolio`) | Builder — allocation sliders, "Use AI Strategy", real-time pie-chart |
| **Strategies** (`/strategies`) | AI strategies (Balanced Growth, Momentum, Value Investing) |
| **Education** (`/education`) | How it works, partners, contracts, xStocks/Fluxion explainer |

A **real-time xStock price ticker** runs across the top, and a floating **Stocky** concierge (Nansen + ELFA + AltLLM, tool-calling chat) is available on every route. The UI is fully mobile responsive (hamburger menu + bottom nav).

## Autopilot — Autonomous RWA Yield Agent

StockPilot also ships an autonomous **Autopilot** agent engine (smart contract + FastAPI backend) that allocates capital across three layers and **records every decision on-chain** (the core hackathon criterion — a verifiable "Turing test" track record on Mantlescan).

**Three layers**

| Layer | Token | Role |
|-------|-------|------|
| Growth | xStocks (3–5 of AAPLx, NVDAx, SPYx…) | Upside; overweighted when the market is risk-on |
| Protection | USDY (Ondo tokenized US Treasuries) | Defensive ballast; overweighted when risk-off |
| Yield | mETH (Mantle staked-ETH) | Passive staking yield, held |

**Regime → target allocation** (dynamic, not static — `40/40/20` is the neutral baseline)

| Regime | Signals (Nansen flows + ELFA sentiment + volatility) | xStocks | USDY | mETH |
|--------|------------------------------------------------------|---------|------|------|
| Risk-on | low vol, positive sentiment, smart-money inflow | 55% | 20% | 25% |
| Neutral | mixed signals | 40% | 40% | 20% |
| Risk-off | rising vol, negative sentiment, outflows | 20% | 65% | 15% |

The **risk profile** (conservative / balanced / aggressive) shifts the thresholds that map signals to regimes.

**On-chain guardrails** (enforced inside `recordDecision`): weights must sum to `10000` bps; no single layer above `maxAssetWeight` (70%); in risk-off, USDY must be ≥ `minUSDYWeightRiskOff` (50%).

**Decision flow**

```
          ┌─────────── every 6h (or volatility trigger / "Run now") ───────────┐
          ▼                                                                    │
  ┌───────────────┐   ┌──────────────────┐   ┌──────────────────┐   ┌──────────┴────────┐
  │ Gather signals│ → │ Classify regime  │ → │ Target allocation│ → │ Guardrails check  │
  │ ELFA sentiment│   │ rules + AltLLM   │   │ 3 layers + intra │   │ (sum/max/USDY min)│
  │ Nansen flows  │   │ → risk-off /     │   │ xStocks split    │   └──────────┬────────┘
  │ realized vol  │   │   neutral /      │   └──────────────────┘              │
  │ USDY yield    │   │   risk-on        │                                     ▼
  └───────────────┘   └──────────────────┘                          ┌────────────────────┐
                                                                     │ Plan rebalance swaps│
                                                                     │ Fluxion QuoterV2 /  │
                                                                     │ XStockSwapHelper    │
                                                                     │ (simulated unless   │
                                                                     │ wallet funded +     │
                                                                     │ AUTOPILOT_LIVE_SWAPS)│
                                                                     └─────────┬──────────┘
                                                                               ▼
                                                                  ┌───────────────────────┐
                                                                  │ recordDecision on-chain│
                                                                  │ (regime, weights,      │
                                                                  │  reason) → Mantlescan   │
                                                                  └───────────────────────┘
```

> **Demo note:** the agent wallet holds gas (MNT) but no portfolio assets, so the swap leg runs in **simulation** while `recordDecision` is **real** and verifiable on Mantlescan. Fund the wallet and set `AUTOPILOT_LIVE_SWAPS=1` to enable live Fluxion trades.

**Contract surface (Autopilot)**

- `recordDecision(regime, wStocks, wUSDY, wMETH, reason) → index` — agent-only; validates guardrails, emits `DecisionRecorded`
- Views: `getDecisionCount()`, `getDecision(i)`, `getLatestDecision()`, `getRecentDecisions(limit)` (newest-first), `getTargetWeights()`
- Owner admin: `setAgent(address)`, `setGuardrails(maxAssetWeight, maxDrawdownBps, minUSDYWeightRiskOff)`
- Events: `DecisionRecorded`, `AgentUpdated`, `GuardrailsUpdated`
- Backward-compatible: the existing `YieldDecision` / `recordYieldDecision` and all manual positions/strategies remain intact.

**Backend API** (FastAPI, `backend/agent/autopilot.py`)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/autopilot/status` | regime, target weights, next rebalance, decision count |
| `GET /api/autopilot/activity` | recent decisions (this session) |
| `GET /api/autopilot/profiles` | available risk profiles |
| `POST /api/autopilot/config` | set xStocks selection + risk profile |
| `POST /api/autopilot/toggle` | switch Manual ↔ Autopilot |
| `POST /api/autopilot/run` | trigger one full cycle now |

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
| Landing | Three.js / WebGL (instanced 3D hero, `prefers-reduced-motion` fallback) |
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
│   │   ├── (app)/          # App routes: dashboard (/), market, swap, bridge, portfolio, strategies, education
│   │   ├── providers.tsx   # RainbowKit + Wagmi + Relay providers
│   │   └── layout.tsx      # HTML layout
│   ├── src/components/     # Sidebar, Topbar, xStock Ticker, Stocky concierge, dashboard widgets
│   └── public/
│       └── xstocks-data.json # 155 xStocks static data
└── landing/                # Landing page (stockpilotai.xyz) — Three.js / WebGL 3D hero
```

## Smart Contracts

| Contract | Network | Address |
|----------|---------|---------|
| StockPilotAgent (Autopilot) | Mantle Mainnet | [`0xbbE80ACe5c46b49930ff0229762a1A57BE4CA6F4`](https://mantlescan.xyz/address/0xbbE80ACe5c46b49930ff0229762a1A57BE4CA6F4) |
| XStockSwapHelper | Mantle Mainnet | [`0xe2c17E812f506e1A2723618e787eE61B9E30470f`](https://mantlescan.xyz/address/0xe2c17E812f506e1A2723618e787eE61B9E30470f) |
| USDY (Ondo, protection layer) | Mantle Mainnet | [`0x5bE26527e817998A7206475496fDE1E68957c5A6`](https://mantlescan.xyz/address/0x5bE26527e817998A7206475496fDE1E68957c5A6) |
| mETH (yield layer) | Mantle Mainnet | [`0xcDA86A272531e8640cD7F1a92c01839911B90bb0`](https://mantlescan.xyz/address/0xcDA86A272531e8640cD7F1a92c01839911B90bb0) |
| Fluxion V3 QuoterV2 | Mantle | [`0x3E4eE18Ac7280813236a1EB850679Da5322E14CE`](https://mantlescan.xyz/address/0x3E4eE18Ac7280813236a1EB850679Da5322E14CE) |
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
