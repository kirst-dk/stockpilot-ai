"use client";

import { useState, useRef, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance, useWalletClient, usePublicClient } from "wagmi";
import { formatEther, encodeFunctionData, createPublicClient, http as viemHttp } from "viem";
import { mantle as mantleChain } from "viem/chains";
import dynamic from "next/dynamic";
import { adaptViemWallet } from "@reservoir0x/relay-sdk";
import { SmartMoneyBadge } from "@/components/smart-money/SmartMoneyBadge";
import { useStocky } from "@/components/concierge/StockyContext";
import { setXStockCatalog } from "@/lib/intelligence/xstocks";
import { REFERENCE_QUOTES, useLiveQuotes } from "@/lib/marketPrices";
import { POOLS_ENABLED } from "@/lib/flags";

const RelaySwapWidget = dynamic(
  () => import("@reservoir0x/relay-kit-ui").then((mod) => mod.SwapWidget),
  { ssr: false, loading: () => <div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"></div></div> }
);

const BRIDGE_DEFAULT_FROM = {
  chainId: 5000,
  address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
  decimals: 6,
  name: "USDC",
  symbol: "USDC",
  logoURI: "https://ethereum-optimism.github.io/data/USDC/logo.png",
};
const BRIDGE_DEFAULT_TO = {
  chainId: 42161,
  address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  decimals: 6,
  name: "USDC",
  symbol: "USDC",
  logoURI: "https://ethereum-optimism.github.io/data/USDC/logo.png",
};

const CONTRACT = "0xbbE80ACe5c46b49930ff0229762a1A57BE4CA6F4";
// RWA / AI Yield Optimizer (USDY) — Mantle Mainnet addresses
const USDY_ORACLE = "0xA96abbe61AfEdEB0D14a20440Ae7100D9aB4882f";
const USDY_TOKEN = "0x5bE26527e817998A7206475496fDE1E68957c5A6";
const METH_TOKEN = "0xcDA86A272531e8640cD7F1a92c01839911B90bb0";
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const NANSEN_API_KEY = process.env.NEXT_PUBLIC_NANSEN_API_KEY || "";
const ELFA_API_KEY = process.env.NEXT_PUBLIC_ELFA_API_KEY || "";
const ALTLLM_API_KEY = process.env.NEXT_PUBLIC_ALTLLM_API_KEY || "";
const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

const FLUXION_TRADE_URL = "https://app.fluxion.network/trade";
const FLUXION_POOLS_URL = "https://fluxion.network/pool?poolType=rwa";
const RELAY_BRIDGE_URL = "https://www.relay.link/bridge";
const XSTOCKS_BRIDGE_URL = "https://defi.xstocks.fi/bridge";

const BRIDGE_PRODUCTS = new Set(["METAx", "MSTRx", "HDx", "NVDAx", "GOOGLx", "BTBTx", "QQQx", "TSLAx", "SPYx", "CRCLx", "AAPLx", "COINx"]);
const BRIDGE_DESTINATIONS = ["Ethereum", "BinanceSmartChain", "Arbitrum", "Ink"];

const NETWORK_COLORS: Record<string, string> = {
  Ethereum: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  Solana: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  Mantle: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  Ton: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  Ink: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  BinanceSmartChain: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  Arbitrum: "bg-blue-400/20 text-blue-200 border-blue-400/30",
  HyperEVM: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  Tron: "bg-red-500/20 text-red-300 border-red-500/30",
};
const NETWORK_SHORT: Record<string, string> = {
  Ethereum: "ETH", Solana: "SOL", Mantle: "MNT", Ton: "TON", Ink: "INK",
  BinanceSmartChain: "BSC", Arbitrum: "ARB", HyperEVM: "HYPER", Tron: "TRON",
};

const STRATEGIES = [
  {
    id: "balanced", name: "Balanced Growth", risk: "5/10",
    desc: "Diversified exposure across sectors with automatic stop-loss protection",
    returnPct: "+12.4%", sharpe: "1.82", aum: "$100,000",
    allocation: [
      { name: "SPYx", value: 30, price: 587.42, change: +1.2 },
      { name: "NVDAx", value: 25, price: 131.88, change: +3.4 },
      { name: "AAPLx", value: 15, price: 198.55, change: -0.3 },
      { name: "TSLAx", value: 10, price: 178.22, change: +2.1 },
      { name: "MSFTx", value: 10, price: 442.31, change: +0.8 },
      { name: "AMZNx", value: 10, price: 193.67, change: +1.5 },
    ],
    signals: [
      { symbol: "NVDAx", action: "STRONG BUY", confidence: 87, reason: "AI sector momentum. Earnings beat +15%." },
      { symbol: "TSLAx", action: "BUY", confidence: 65, reason: "Breakout above $175 resistance." },
      { symbol: "SPYx", action: "HOLD", confidence: 72, reason: "Fair value. Broad market exposure." },
    ],
  },
  {
    id: "momentum", name: "Momentum Trading", risk: "6/10",
    desc: "Follows price trends and sector rotations for maximum short-term gains",
    returnPct: "+18.7%", sharpe: "1.54", aum: "$75,000",
    allocation: [
      { name: "NVDAx", value: 35, price: 131.88, change: +3.4 },
      { name: "TSLAx", value: 25, price: 178.22, change: +2.1 },
      { name: "AMZNx", value: 20, price: 193.67, change: +1.5 },
      { name: "SPYx", value: 10, price: 587.42, change: +1.2 },
      { name: "AAPLx", value: 5, price: 198.55, change: -0.3 },
      { name: "MSFTx", value: 5, price: 442.31, change: +0.8 },
    ],
    signals: [
      { symbol: "NVDAx", action: "STRONG BUY", confidence: 92, reason: "Parabolic trend. Institutional inflows." },
      { symbol: "TSLAx", action: "BUY", confidence: 78, reason: "Volume breakout. Energy rotation." },
      { symbol: "AMZNx", action: "BUY", confidence: 71, reason: "AWS growth acceleration." },
    ],
  },
  {
    id: "value", name: "Value Investing", risk: "4/10",
    desc: "Mean reversion strategy targeting undervalued assets with high dividend yield",
    returnPct: "+8.2%", sharpe: "2.14", aum: "$150,000",
    allocation: [
      { name: "SPYx", value: 35, price: 587.42, change: +1.2 },
      { name: "MSFTx", value: 25, price: 442.31, change: +0.8 },
      { name: "AAPLx", value: 20, price: 198.55, change: -0.3 },
      { name: "AMZNx", value: 10, price: 193.67, change: +1.5 },
      { name: "NVDAx", value: 5, price: 131.88, change: +3.4 },
      { name: "TSLAx", value: 5, price: 178.22, change: +2.1 },
    ],
    signals: [
      { symbol: "MSFTx", action: "BUY", confidence: 74, reason: "Undervalued vs peers. Cloud growth." },
      { symbol: "SPYx", action: "HOLD", confidence: 82, reason: "Core holding. Dollar-cost avg." },
      { symbol: "AAPLx", action: "HOLD", confidence: 69, reason: "Services revenue growing." },
    ],
  },
];

const FLUXION_RWA_POOLS = [
  { name: "USDC / SPYx", tvl: "$2.4M", apr: "14.2%", volume24h: "$890K", fee: "0.3%", type: "V3" },
  { name: "USDC / NVDAx", tvl: "$1.8M", apr: "18.7%", volume24h: "$1.2M", fee: "0.3%", type: "V3" },
  { name: "USDC / AAPLx", tvl: "$1.1M", apr: "11.4%", volume24h: "$520K", fee: "0.3%", type: "V3" },
  { name: "USDC / TSLAx", tvl: "$980K", apr: "22.1%", volume24h: "$780K", fee: "0.3%", type: "V3" },
  { name: "USDC / MSFTx", tvl: "$870K", apr: "9.8%", volume24h: "$340K", fee: "0.3%", type: "V3" },
  { name: "USDC / AMZNx", tvl: "$760K", apr: "12.6%", volume24h: "$410K", fee: "0.3%", type: "V3" },
  { name: "USDC / GOOGLx", tvl: "$540K", apr: "10.3%", volume24h: "$280K", fee: "0.3%", type: "V2" },
  { name: "USDC / METAx", tvl: "$490K", apr: "15.8%", volume24h: "$350K", fee: "0.3%", type: "V2" },
];

interface XStockAsset {
  symbol: string;
  name: string;
  logo: string;
  mantleAddress: string;
  networks: string[];
}

// A live price for an xStock. `change` (24h %) is only present for assets that
// have a reference quote; on-chain pool prices provide `price` only.
export interface LivePrice {
  price: number;
  change?: number;
}

interface NansenToken {
  chain: string;
  token_symbol: string;
  price_usd: number;
  price_change: number;
  buy_volume: number;
  sell_volume: number;
  nof_traders: number;
  market_cap_usd: number;
  netflow: number;
}

interface ElfaTrending {
  token: string;
  current_count: number;
  change_percent: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const DEMO_NANSEN: NansenToken[] = [
  { chain: "mantle", token_symbol: "MNT", price_usd: 0.82, price_change: 0.045, buy_volume: 2456000, sell_volume: 1890000, nof_traders: 342, market_cap_usd: 2680000000, netflow: 566000 },
  { chain: "mantle", token_symbol: "WETH", price_usd: 3845.20, price_change: 0.021, buy_volume: 5120000, sell_volume: 4890000, nof_traders: 189, market_cap_usd: 462000000000, netflow: 230000 },
  { chain: "ethereum", token_symbol: "NVDA", price_usd: 131.88, price_change: 0.034, buy_volume: 8950000, sell_volume: 6200000, nof_traders: 87, market_cap_usd: 3240000000000, netflow: 2750000 },
];

const DEMO_ELFA: ElfaTrending[] = [
  { token: "BTC", current_count: 435, change_percent: -29.15 },
  { token: "ETH", current_count: 216, change_percent: -10.37 },
  { token: "SOL", current_count: 105, change_percent: 15.38 },
];

type TabId = "market" | "swap" | "pools" | "bridge" | "rwa" | "dashboard" | "agent" | "education";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "market", label: "Market", icon: "M2 12L5 7L8 9L11 4L14 8" },
  { id: "swap", label: "Swap", icon: "M4 8h8M8 4v8" },
  { id: "pools", label: "Pools", icon: "M8 2a6 6 0 100 12A6 6 0 008 2z" },
  { id: "bridge", label: "Bridge", icon: "M2 8h12M10 4l4 4-4 4" },
  { id: "rwa", label: "RWA Strategy", icon: "M2 13h12M4 13V7M7 13V4M10 13V8M13 13V5" },
  { id: "dashboard", label: "Dashboard", icon: "M3 3h4v8H3zM9 3h4v4H9zM9 9h4v4H9z" },
  { id: "agent", label: "Stocky Agent", icon: "M8 1.5l5.5 3v4c0 3.2-2.3 5.3-5.5 6-3.2-.7-5.5-2.8-5.5-6v-4L8 1.5z" },
  { id: "education", label: "Education", icon: "M8 1L1 5l7 4 7-4-7-4zM1 9l7 4 7-4" },
];

const ROUTE_FOR_TAB: Record<TabId, string> = {
  market: "/market", swap: "/swap", pools: "/swap", bridge: "/bridge",
  rwa: "/strategies", dashboard: "/portfolio", agent: "/", education: "/education",
};

const AppDataContext = createContext<ReturnType<typeof useAppDataState> | null>(null);

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const value = useAppDataState();
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

function useAppDataState() {
  const router = useRouter();
  const setActiveTab = useCallback((t: TabId) => { router.push(ROUTE_FOR_TAB[t]); }, [router]);
  const [activeStrategy, setActiveStrategy] = useState(0);
  const [nansenData, setNansenData] = useState<NansenToken[]>(DEMO_NANSEN);
  const [elfaData, setElfaData] = useState<ElfaTrending[]>(DEMO_ELFA);
  const [nansenLoading, setNansenLoading] = useState(true);
  const [elfaLoading, setElfaLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [allXStocks, setAllXStocks] = useState<XStockAsset[]>([]);
  const [xStocksLoading, setXStocksLoading] = useState(true);
  const [priceMap, setPriceMap] = useState<Record<string, LivePrice>>(() => {
    const seed: Record<string, LivePrice> = {};
    for (const q of REFERENCE_QUOTES) seed[q.symbol] = { price: q.price, change: q.change };
    return seed;
  });
  const [xStocksFilter, setXStocksFilter] = useState("");
  const [xStocksCategory, setXStocksCategory] = useState<"all" | "bridgeable" | "popular">("all");
  const [portfolioSelected, setPortfolioSelected] = useState<Record<string, number>>({});
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiStockInfo, setAiStockInfo] = useState<Record<string, string>>({});
  const [aiStockLoading, setAiStockLoading] = useState<Record<string, boolean>>({});
  const [strategyAiInfo, setStrategyAiInfo] = useState<string | null>(null);
  const [strategyAiLoading, setStrategyAiLoading] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { address, isConnected } = useAccount();
  const { data: balance } = useBalance({ address });
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const strategy = STRATEGIES[activeStrategy];

  const stocky = useStocky();

  const totalAllocation = Object.values(portfolioSelected).reduce((s, v) => s + v, 0);
  const selectedCount = Object.keys(portfolioSelected).length;

  const toggleXStock = (symbol: string) => {
    setPortfolioSelected(prev => {
      const next = { ...prev };
      if (next[symbol] !== undefined) {
        delete next[symbol];
      } else {
        const remaining = 100 - Object.values(next).reduce((s, v) => s + v, 0);
        const existing = Object.keys(next).length;
        next[symbol] = existing === 0 ? 100 : Math.max(0, Math.min(remaining, Math.floor(100 / (existing + 1))));
        const total = Object.values(next).reduce((s, v) => s + v, 0);
        if (total > 100) next[symbol] = Math.max(0, next[symbol] - (total - 100));
      }
      return next;
    });
    setAiAnalysis(null);
  };

  const updateAllocation = (symbol: string, value: number) => {
    setPortfolioSelected(prev => ({ ...prev, [symbol]: Math.max(0, Math.min(100, value)) }));
    setAiAnalysis(null);
  };

  const applyAiStrategy = () => {
    const s = STRATEGIES[activeStrategy];
    const newAlloc: Record<string, number> = {};
    s.allocation.forEach(a => { newAlloc[a.name] = a.value; });
    setPortfolioSelected(newAlloc);
    setSelectedStrategy(s.name);
    setAiAnalysis(null);
  };

  const analyzePortfolio = async () => {
    if (selectedCount === 0) return;
    setAiAnalyzing(true);
    const positions = Object.entries(portfolioSelected).map(([sym, pct]) => {
      const stock = allXStocks.find(x => x.symbol === sym);
      return `${sym} (${stock?.name || sym}): ${pct}%`;
    }).join("\n");
    const prompt = `Analyze this xStocks portfolio on Mantle Network. Give: 1) Risk Score (1-10), 2) Expected Monthly Return, 3) Diversification Rating, 4) Key Risks, 5) Specific Recommendations. Be concise.\n\nPortfolio:\n${positions}`;
    if (ALTLLM_API_KEY) {
      try {
        const res = await fetch("https://api.altllm.ai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${ALTLLM_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "altllm-standard",
            messages: [
              { role: "system", content: "You are a professional portfolio analyst for tokenized equities (xStocks) on Mantle blockchain. Analyze portfolios with data-driven insights. Be concise. Max 200 words." },
              { role: "user", content: prompt },
            ],
            max_tokens: 400,
          }),
        });
        const json = await res.json();
        setAiAnalysis(json.choices?.[0]?.message?.content || "Analysis unavailable.");
      } catch { setAiAnalysis("Analysis temporarily unavailable. Please try again."); }
    } else {
      await new Promise(r => setTimeout(r, 1500));
      const risk = selectedCount <= 2 ? "7/10" : selectedCount <= 4 ? "5/10" : "3/10";
      setAiAnalysis(`Risk Score: ${risk}\nEst. Return: +${(1.2 + selectedCount * 0.3).toFixed(1)}%/mo\nAssets: ${selectedCount}\n\nWell-constructed portfolio. Consider diversifying across sectors.`);
    }
    setAiAnalyzing(false);
  };

  const getStockAiInfo = async (symbol: string) => {
    if (aiStockInfo[symbol] || aiStockLoading[symbol]) return;
    setAiStockLoading(prev => ({ ...prev, [symbol]: true }));
    const stock = allXStocks.find(x => x.symbol === symbol);
    const prompt = `Give a brief overview of ${symbol} (${stock?.name || symbol}) tokenized equity on xStocks. Include: 1) What company/asset it represents, 2) Sector, 3) Key risks, 4) Recent performance outlook. Max 100 words.`;
    if (ALTLLM_API_KEY) {
      try {
        const res = await fetch("https://api.altllm.ai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${ALTLLM_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "altllm-standard",
            messages: [
              { role: "system", content: "You are a financial analyst specializing in tokenized equities. Be concise and data-driven." },
              { role: "user", content: prompt },
            ],
            max_tokens: 200,
          }),
        });
        const json = await res.json();
        setAiStockInfo(prev => ({ ...prev, [symbol]: json.choices?.[0]?.message?.content || "Info unavailable." }));
      } catch { setAiStockInfo(prev => ({ ...prev, [symbol]: "AI analysis temporarily unavailable." })); }
    } else {
      await new Promise(r => setTimeout(r, 800));
      setAiStockInfo(prev => ({ ...prev, [symbol]: `${symbol} is a tokenized equity on Mantle Network via xStocks. Backed 1:1 by real shares. Available on ${stock?.networks.length || 1} networks. Trade on Fluxion DEX or mint via xStocks RFQ.` }));
    }
    setAiStockLoading(prev => ({ ...prev, [symbol]: false }));
  };

  const getStrategyAiInfo = async () => {
    if (strategyAiLoading) return;
    setStrategyAiLoading(true);
    const s = STRATEGIES[activeStrategy];
    const prompt = `Analyze the "${s.name}" strategy (Risk: ${s.risk}, Return: ${s.returnPct}, Sharpe: ${s.sharpe}). Allocation: ${s.allocation.map(a => `${a.name} ${a.value}%`).join(", ")}. Include Nansen smart money insights and ELFA sentiment. Max 150 words.`;
    if (ALTLLM_API_KEY) {
      try {
        const res = await fetch("https://api.altllm.ai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${ALTLLM_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "altllm-standard",
            messages: [
              { role: "system", content: "You are StockPilot AI powered by Nansen, ELFA, and AltLLM. Provide strategy analysis with smart money flow data and sentiment signals. Be concise." },
              { role: "user", content: prompt },
            ],
            max_tokens: 300,
          }),
        });
        const json = await res.json();
        setStrategyAiInfo(json.choices?.[0]?.message?.content || "Analysis unavailable.");
      } catch { setStrategyAiInfo("Analysis temporarily unavailable."); }
    } else {
      await new Promise(r => setTimeout(r, 1000));
      setStrategyAiInfo(`${s.name} Strategy Analysis\n\nNansen: Institutional funds show net positive flow into ${s.allocation[0].name} and ${s.allocation[1].name}. Smart money confidence: ${s.signals[0].confidence}%.\n\nELFA Sentiment: Market sentiment is bullish on AI/tech sector (82% positive mentions).\n\nRecommendation: Strategy aligns with current market trends. Sharpe ratio of ${s.sharpe} indicates good risk-adjusted returns.`);
    }
    setStrategyAiLoading(false);
  };

  // Fetch xStocks — use static pre-built data (avoids CORS), fallback to API with pagination
  useEffect(() => {
    async function fetchXStocks() {
      try {
        // First try static pre-built data (no CORS issues)
        const staticRes = await fetch("/xstocks-data.json");
        if (staticRes.ok) {
          const staticData: XStockAsset[] = await staticRes.json();
          if (staticData.length > 0) {
            setAllXStocks(staticData);
            setXStocksLoading(false);
            return;
          }
        }
      } catch {}
      // Fallback: fetch from API with pagination
      try {
        const allAssets: XStockAsset[] = [];
        for (let page = 0; page < 5; page++) {
          const res = await fetch(`https://api.xstocks.fi/api/v2/public/assets?page=${page}`);
          const data = await res.json();
          const assets = data.nodes || data;
          for (const a of assets) {
            const mantle = (a.deployments || []).find((d: { network: string }) => d.network === "Mantle");
            if (mantle) {
              allAssets.push({
                symbol: a.symbol, name: a.name || a.description || a.symbol,
                logo: a.logo || "", mantleAddress: mantle.address,
                networks: (a.deployments || []).map((d: { network: string }) => d.network),
              });
            }
          }
          if (!data.page?.hasNextPage) break;
        }
        allAssets.sort((a, b) => a.symbol.localeCompare(b.symbol));
        setAllXStocks(allAssets);
      } catch { setAllXStocks([]); }
      setXStocksLoading(false);
    }
    fetchXStocks();
  }, []);

  // Live USD prices straight from the Fluxion V3 pools on Mantle (on-chain, no
  // backend). Reference quotes (with 24h %) seed the map; on-chain prices fill
  // in every additional xStock that has a live USDC pool.
  useEffect(() => {
    if (!allXStocks.length) return;
    let cancelled = false;
    fetchFluxionPrices(allXStocks)
      .then((onchain) => {
        if (cancelled || !Object.keys(onchain).length) return;
        setPriceMap((prev) => {
          const next = { ...prev };
          for (const [sym, price] of Object.entries(onchain)) {
            // Keep reference entries (they carry a real 24h %); only add prices
            // for symbols we don't already have, so price/24h never desync.
            if (!next[sym]) next[sym] = { price };
          }
          return next;
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [allXStocks.length]);

  const filteredXStocks = allXStocks.filter(s => {
    const matchSearch = !xStocksFilter || s.symbol.toLowerCase().includes(xStocksFilter.toLowerCase()) || s.name.toLowerCase().includes(xStocksFilter.toLowerCase());
    if (!matchSearch) return false;
    if (xStocksCategory === "bridgeable") return BRIDGE_PRODUCTS.has(s.symbol);
    if (xStocksCategory === "popular") return ["SPYx", "NVDAx", "AAPLx", "TSLAx", "MSFTx", "AMZNx", "GOOGLx", "METAx", "QQQx", "COINx", "MSTRx", "TSMx"].includes(s.symbol);
    return true;
  });

  // Fetch Nansen
  useEffect(() => {
    async function fetchNansen() {
      if (!NANSEN_API_KEY) { setNansenLoading(false); return; }
      try {
        const res = await fetch("https://api.nansen.ai/api/v1/token-screener", {
          method: "POST",
          headers: { "Content-Type": "application/json", apiKey: NANSEN_API_KEY },
          body: JSON.stringify({ chains: ["ethereum", "mantle"], timeframe: "24h", filters: { only_smart_money: true, token_age_days: { min: 30, max: 365 } }, order_by: [{ field: "buy_volume", direction: "DESC" }], pagination: { page: 1, per_page: 5 } }),
        });
        const json = await res.json();
        if (json.data && json.data.length > 0) setNansenData(json.data);
      } catch { /* use demo */ }
      setNansenLoading(false);
    }
    fetchNansen();
  }, []);

  // Fetch ELFA
  useEffect(() => {
    async function fetchElfa() {
      if (!ELFA_API_KEY) { setElfaLoading(false); return; }
      try {
        const res = await fetch("https://api.elfa.ai/v2/aggregations/trending-tokens?timeWindow=24h", { headers: { "x-elfa-api-key": ELFA_API_KEY } });
        const json = await res.json();
        if (json.success && json.data?.data) {
          setElfaData(json.data.data.slice(0, 5).map((t: Record<string, unknown>) => ({
            token: (t.token as string) || "—",
            current_count: Number(t.current_count) || 0,
            change_percent: Number(t.change_percent) || 0,
          })));
        }
      } catch { /* use demo */ }
      setElfaLoading(false);
    }
    fetchElfa();
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  useEffect(() => {
    if (allXStocks.length === 0) return;
    setXStockCatalog(allXStocks.map(a => ({
      symbol: a.symbol,
      name: a.name,
      address: a.mantleAddress,
      deployments: a.networks?.map(n => ({ network: n, address: n === "Mantle" ? a.mantleAddress : undefined })),
    })));
  }, [allXStocks]);

  useEffect(() => {
    stocky.setEnv({ xStockCount: allXStocks.length, hasWallet: !!isConnected });
  }, [allXStocks.length, isConnected, stocky]);

  const getFallbackResponse = useCallback((input: string): string => {
    const lower = input.toLowerCase();
    if (lower.includes("strat") || lower.includes("recommend")) return "Based on Nansen smart money flows, the Balanced Growth strategy shows the best risk-adjusted returns. ELFA sentiment is 82% bullish on AI sector.";
    if (lower.includes("risk")) return "Risk levels:\n- Balanced: 5/10 (Sharpe 1.82)\n- Momentum: 6/10 (Sharpe 1.54)\n- Value: 4/10 (Sharpe 2.14)";
    if (lower.includes("nvda")) return "NVDAx: Smart Money net inflow +$2.75M. Sentiment 89% bullish. STRONG BUY at 92% confidence.";
    return "I'm StockPilot AI. Ask about strategies, risks, or specific xStocks.";
  }, []);

  const handleChat = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setChatLoading(true);
    if (ALTLLM_API_KEY) {
      try {
        const res = await fetch("https://api.altllm.ai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${ALTLLM_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "altllm-standard",
            messages: [
              { role: "system", content: `You are StockPilot AI on Mantle. Available: ${allXStocks.length} xStocks. Strategies: Balanced, Momentum, Value. Powered by Nansen+ELFA+AltLLM. Be concise, max 100 words.` },
              ...chatMessages.slice(-6).map(m => ({ role: m.role, content: m.content })),
              { role: "user", content: userMsg },
            ],
            max_tokens: 200,
          }),
        });
        const json = await res.json();
        setChatMessages(prev => [...prev, { role: "assistant", content: json.choices?.[0]?.message?.content || getFallbackResponse(userMsg) }]);
      } catch { setChatMessages(prev => [...prev, { role: "assistant", content: getFallbackResponse(userMsg) }]); }
    } else {
      await new Promise(r => setTimeout(r, 800));
      setChatMessages(prev => [...prev, { role: "assistant", content: getFallbackResponse(userMsg) }]);
    }
    setChatLoading(false);
  }, [chatInput, chatLoading, chatMessages, getFallbackResponse, allXStocks.length]);

  return {
    setActiveTab,
    // strategy
    strategies: STRATEGIES, activeStrategy, setActiveStrategy, strategy,
    strategyAiInfo, strategyAiLoading, getStrategyAiInfo,
    selectedStrategy, applyAiStrategy,
    // xstocks
    allXStocks, xStocksLoading, filteredXStocks, priceMap,
    xStocksFilter, setXStocksFilter, xStocksCategory, setXStocksCategory,
    aiStockInfo, aiStockLoading, getStockAiInfo,
    // wallet
    address, isConnected, balance, walletClient, publicClient,
    // portfolio builder
    portfolioSelected, totalAllocation, selectedCount,
    toggleXStock, updateAllocation, analyzePortfolio, aiAnalysis, aiAnalyzing,
    // education / intelligence
    nansenData, nansenLoading, elfaData, elfaLoading,
    // legacy chat (kept for floating widget reuse)
    chatOpen, setChatOpen, chatMessages, chatInput, setChatInput, chatLoading, handleChat, chatEndRef,
  };
}


/* ========== MARKET TAB ========== */
export function MarketTab({
  strategies, activeStrategy, setActiveStrategy, strategyAiInfo, strategyAiLoading, getStrategyAiInfo,
  allXStocks, xStocksLoading, filteredXStocks, priceMap, xStocksFilter, setXStocksFilter, xStocksCategory, setXStocksCategory,
  aiStockInfo, aiStockLoading, getStockAiInfo, setActiveTab,
}: {
  strategies: typeof STRATEGIES; activeStrategy: number; setActiveStrategy: (i: number) => void;
  strategyAiInfo: string | null; strategyAiLoading: boolean; getStrategyAiInfo: () => void;
  allXStocks: XStockAsset[]; xStocksLoading: boolean; filteredXStocks: XStockAsset[];
  priceMap: Record<string, LivePrice>;
  xStocksFilter: string; setXStocksFilter: (v: string) => void;
  xStocksCategory: "all" | "bridgeable" | "popular"; setXStocksCategory: (v: "all" | "bridgeable" | "popular") => void;
  aiStockInfo: Record<string, string>; aiStockLoading: Record<string, boolean>; getStockAiInfo: (s: string) => void;
  setActiveTab: (t: TabId) => void;
}) {
  const stocky = useStocky();
  const { quotes: live } = useLiveQuotes(allXStocks.map((s) => s.symbol));

  return (
    <div className="space-y-6">

      {/* xStocks Assets section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">xStocks Assets</h2>
          <span className="text-xs text-white/40">{xStocksLoading ? "Loading..." : `${allXStocks.length} available`}</span>
        </div>

        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4">
          <div className="relative flex-1">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <input
              type="text" value={xStocksFilter} onChange={(e) => setXStocksFilter(e.target.value)}
              placeholder="Search symbol or name..."
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-white/90 placeholder:text-white/30 focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <div className="flex gap-1.5">
            {([["all", "All"], ["popular", "Popular"], ["bridgeable", "Bridgeable"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setXStocksCategory(key)}
                className={`px-3 py-2 rounded-lg text-[10px] font-medium transition-all ${
                  xStocksCategory === key ? "bg-blue-600/20 text-blue-400 border border-blue-500/30" : "bg-white/5 text-white/50 border border-white/5 hover:bg-white/10"
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-[10px] text-white/30 mb-3">
          Showing {filteredXStocks.length} of {allXStocks.length} · {BRIDGE_PRODUCTS.size} bridgeable via CCIP
        </div>

        {/* xStocks grid */}
        {xStocksLoading ? (
          <div className="flex items-center justify-center py-16">
            <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="ml-2 text-xs text-white/40">Loading xStocks...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredXStocks.map(stock => {
              const isBridgeable = BRIDGE_PRODUCTS.has(stock.symbol);
              const q = live[stock.symbol];
              const qUp = (q?.change ?? 0) >= 0;
              return (
                <div key={stock.symbol} className="p-4 rounded-xl border border-white/5 bg-white/[0.015] hover:border-white/10 hover:bg-white/[0.03] transition-all duration-200">
                  <div className="flex items-center gap-2.5 mb-2">
                    <TokenIcon token={{ symbol: stock.symbol, logo: stock.logo }} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-white/90 truncate">{stock.symbol}</div>
                      <div className="text-[10px] text-white/40 truncate">{stock.name}</div>
                    </div>
                    {isBridgeable && (
                      <span className="text-[8px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">BRIDGE</span>
                    )}
                  </div>

                  {/* Live price + 24h */}
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-[15px] font-bold text-white/90 tabular-nums">{q ? `$${q.price.toFixed(2)}` : "—"}</span>
                    <span className="text-[11px] font-semibold tabular-nums" style={{ color: q ? (qUp ? "#34e3b0" : "#ff6b81") : "rgba(255,255,255,0.3)" }}>
                      {q ? `${qUp ? "+" : ""}${q.change.toFixed(2)}% · 24h` : "— · 24h"}
                    </span>
                  </div>

                  {/* Smart Money badge */}
                  <div className="mb-2">
                    <SmartMoneyBadge symbol={stock.symbol} tokenAddress={stock.mantleAddress} compact={false} />
                  </div>

                  {/* Networks */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {stock.networks.slice(0, 5).map(net => (
                      <span key={net} className={`text-[8px] font-medium px-1 py-0.5 rounded border ${NETWORK_COLORS[net] || "bg-white/5 text-white/40 border-white/10"}`}>
                        {NETWORK_SHORT[net] || net}
                      </span>
                    ))}
                    {stock.networks.length > 5 && <span className="text-[8px] text-white/30">+{stock.networks.length - 5}</span>}
                  </div>

                  {/* Contract */}
                  <div className="flex items-center gap-1 mb-3">
                    <span className="text-[8px] text-white/20 font-mono truncate">{stock.mantleAddress}</span>
                    <a href={`https://mantlescan.xyz/address/${stock.mantleAddress}`} target="_blank" rel="noreferrer" className="text-white/20 hover:text-white/50 transition-colors flex-shrink-0">
                      <svg width="8" height="8" viewBox="0 0 16 16" fill="none"><path d="M4 12L12 4M12 4H6M12 4v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </a>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => { stocky.open("floating"); stocky.analyzeXStock(stock.symbol); }}
                      title={`Ask Stocky about ${stock.symbol}`}
                      className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-300 border border-emerald-500/30 hover:from-emerald-500/30 hover:to-teal-500/30 transition-all flex items-center gap-1"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                      Ask Stocky
                    </button>
                    <button
                      onClick={() => setActiveTab("swap")}
                      className="flex-1 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-[10px] text-center hover:shadow-lg hover:shadow-blue-500/20 transition-all"
                    >
                      BUY
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


/* ========== SWAP TAB ========== */
const FLUXION_QUOTE_API = "/api/fluxion/quote/exact-in";
const FLUXION_ROUTER = "0x5628a59dF0ECAC3f3171f877A94bEb26BA6DFAa0";
const FLUXION_FACTORY = "0xF883162Ed9c7E8EF604214c964c678E40c9B737C";
const XSTOCK_SWAP_HELPER = "0xe2c17E812f506e1A2723618e787eE61B9E30470f";
const USDC_MANTLE = "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9";
const WMNT_ADDRESS = "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8";

// Dedicated read-only client pinned to Mantle. The ambient wagmi publicClient
// follows the connected/default chain (which is not necessarily Mantle), so we
// use this for all on-chain reads (pool discovery, balances, receipts).
const MANTLE_RPC_URL = process.env.NEXT_PUBLIC_MANTLE_RPC_URL || "https://rpc.mantle.xyz";
const mantleClient = createPublicClient({ chain: mantleChain, transport: viemHttp(MANTLE_RPC_URL) });

interface SwapToken { symbol: string; address: string; decimals: number; logo?: string; name?: string; }

const NATIVE_MNT_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

const BASE_TOKENS: SwapToken[] = [
  { symbol: "MNT", address: NATIVE_MNT_ADDRESS, decimals: 18, logo: "/tokens/mnt.png", name: "Mantle" },
  { symbol: "USDC", address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9", decimals: 6, logo: "/tokens/usdc.png", name: "USD Coin" },
  { symbol: "WMNT", address: "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8", decimals: 18, logo: "/tokens/mnt.png", name: "Wrapped Mantle" },
  { symbol: "USDT", address: "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE", decimals: 6, logo: "/tokens/usdt.png", name: "Tether USD" },
  { symbol: "WETH", address: "0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111", decimals: 18, logo: "/tokens/weth.png", name: "Wrapped Ether" },
  { symbol: "mETH", address: "0xcDA86A272531e8640cD7F1a92c01839911B90bb0", decimals: 18, name: "Mantle Staked Ether" },
  // xStocks — original contract addresses from xStocks API (GET /public/assets, network: Mantle)
  { symbol: "SPYx", address: "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48", decimals: 18 },
  { symbol: "NVDAx", address: "0xc845b2894dbddd03858fd2d643b4ef725fe0849d", decimals: 18 },
  { symbol: "AAPLx", address: "0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a", decimals: 18 },
  { symbol: "TSLAx", address: "0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0", decimals: 18 },
  { symbol: "MSFTx", address: "0x5621737f42dae558b81269fcb9e9e70c19aa6b35", decimals: 18 },
  { symbol: "AMZNx", address: "0x3557ba345b01efa20a1bddc61f573bfd87195081", decimals: 18 },
  { symbol: "GOOGLx", address: "0xe92f673ca36c5e2efd2de7628f815f84807e803f", decimals: 18 },
  { symbol: "METAx", address: "0x96702be57cd9777f835117a809c7124fe4ec989a", decimals: 18 },
  { symbol: "QQQx", address: "0xa753a7395cae905cd615da0b82a53e0560f250af", decimals: 18 },
  { symbol: "MSTRx", address: "0xae2f842ef90c0d5213259ab82639d5bbf649b08e", decimals: 18 },
  { symbol: "CRCLx", address: "0xfebded1b0986a8ee107f5ab1a1c5a813491deceb", decimals: 18 },
  { symbol: "HOODx", address: "0xe1385fdd5ffb10081cd52c56584f25efa9084015", decimals: 18 },
];

// Map ALL unwrapped xStock addresses → wrapped (pool) addresses (sourced from Fluxion)
const UNWRAPPED_TO_WRAPPED: Record<string, string> = {
  "0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a": "0x5aa7649fdbda47de64a07ac81d64b682af9c0724", // AAPLx
  "0xfbf2398df672cee4afcc2a4a733222331c742a6a": "0x5cc079963fb70c0f987f65f539e3b61a6ebdf6db", // ABBVx
  "0x89233399708c18ac6887f90a2b4cd8ba5fedd06e": "0xd812b37181ae89801e4bb3f49e4c1faf11fc0b57", // ABTx
  "0x3557ba345b01efa20a1bddc61f573bfd87195081": "0xac85d37acbadca37545e21ab0fb991bce8c1187c", // AMZNx
  "0x50a1291f69d9d3853def8209cfb1af0b46927be1": "0xd17e483364d849e3b3a52464bb2ca56626edfc31", // APPx
  "0x38bac69cbbd28156796e4163b2b6dcb81e336565": "0x8deb752aaa807e0258afd5ccffe2b5a804026f28", // AVGOx
  "0x5d642505fe1a28897eb3baba665f454755d8daa2": "0xb908feaeab7e671db697d77c3acfd8859e92a4e2", // AZNx
  "0x314938c596f5ce31c3f75307d2979338c346d7f2": "0xa2b1335256cd663da89f650180508dd1f0dc3baa", // BACx
  "0xbc7170a1280be28513b4e940c681537eb25e39f4": "0xd1a01e3f9c7565e88b1cf2413ba0a0e671e57b33", // CMCSAx
  "0x364f210f430ec2448fc68a49203040f6124096f0": "0x3a98e79cdc7d8b2716a8696e25af028e429f11da", // COINx
  "0xfebded1b0986a8ee107f5ab1a1c5a813491deceb": "0xa90872aca656ebe47bdebf3b19ec9dd9c5adc7f8", // CRCLx
  "0x4a4073f2eaf299a1be22254dcd2c41727f6f54a2": "0xc6b6b8d50a6673c04c495e30b411da5a7adf39f5", // CRMx
  "0x214151022c2a5e380ab80cdac31f23ae554a7345": "0xd71a6adbc40c2674591cdb11b8c7ae03a880b06e", // CRWDx
  "0x053c784cd87b74f42e0c089f98643e79c1a3ff16": "0xcfa485bc42c2492917351f89f5cf5c7b2c5a66aa", // CSCOx
  "0xad5cdc3340904285b8159089974a99a1a09eb4c0": "0x7f88888b7a81546a036554aa67a289ea428b20d4", // CVXx
  "0xdba228936f4079daf9aa906fd48a87f2300405f4": "0x6c7ad1886a6da37766fed060d5f08ff43285dcdd", // DHRx
  "0x2380f2673c640fb67e2d6b55b44c62f0e0e69da9": "0x61532ce3f1df7fbf5ffb7b891d184226e85b37c6", // GLDx
  "0xe5f6d3b2405abdfe6f660e63202b25d23763160d": "0xb2f6ed0ed3eeb22bef7a648794ffc19b8af3761c", // GMEx
  "0xe92f673ca36c5e2efd2de7628f815f84807e803f": "0x1630f08370917e79df0b7572395a5e907508bbbc", // GOOGLx
  "0x3ee7e9b3a992fd23cd1c363b0e296856b04ab149": "0x6eed78e2780d82be4e37d9937c27bcf32c8da072", // GSx
  "0x62a48560861b0b451654bfffdb5be6e47aa8ff1b": "0xbd1b73b2e89967e83507b500d798998200a53380", // HONx
  "0xe1385fdd5ffb10081cd52c56584f25efa9084015": "0x953707d7a1cb30cc5c636bda8eaebe410341eb14", // HOODx
  "0xd9913208647671fe0f48f7f260076b2c6f310aac": "0xa8f31436ffe4e71f51b2d65b7d5a5c457ae2000f", // IBMx
  "0xf8a80d1cb9cfd70d03d655d9df42339846f3b3c8": "0x6a2a68ca7fc793d8cea36326a6ec1ef7ac3d9742", // INTCx
  "0xdb0482cfad4789798623e64b15eeba01b16e917c": "0xcdb53a7cba9ec6d55dfe8f58bd6772826722d7bd", // JNJx
  "0xd9fc3e075d45254a1d834fea18af8041207dea0a": "0xab635f839f81a12dc8db8ab31006af14e26292fe", // JPMx
  "0xdcc1a2699441079da889b1f49e12b69cc791129b": "0x9a2486fbe7bc17c9100be65c31abe7c9bf84c23c", // KOx
  "0x15059c599c16fd8f70b633ade165502d6402cd49": "0x316ffea434348c2cb72024e62ae845770315351e", // LINx
  "0x19c41ea77b34bbdee61c3a87a75d1abda2ed0be4": "0x3644971a7e971f60e707f7e8716ccac5a0461290", // LLYx
  "0xb365cd2588065f522d379ad19e903304f6b622c6": "0x5b32624f352d2fc6cc70889967a143ba1814f82b", // MAx
  "0x80a77a372c1e12accda84299492f404902e2da67": "0x1717d8be2bcb27f4e8f36c817088fa6a2c0b3b30", // MCDx
  "0x96702be57cd9777f835117a809c7124fe4ec989a": "0x4e41a262caa93c6575d336e0a4eb79f3c67caa06", // METAx
  "0x17d8186ed8f68059124190d147174d0f6697dc40": "0x4728e48c2c201e32fe210aab68a71e419feac74a", // MRKx
  "0xeaad46f4146ded5a47b55aa7f6c48c191deaec88": "0x0d6fce45796d5c00689c0916b976645a0ff1f0ce", // MRVLx
  "0x5621737f42dae558b81269fcb9e9e70c19aa6b35": "0x63ad27614231767c8c489745b9145272de50d09b", // MSFTx
  "0xae2f842ef90c0d5213259ab82639d5bbf649b08e": "0x266e5923f6118f8b340ca5a23ae7f71897361476", // MSTRx
  "0xa6a65ac27e76cd53cb790473e4345c46e5ebf961": "0xfe0d2545f9e7f3678cb35ed3cdf70488c5570d11", // NFLXx
  "0xc845b2894dbddd03858fd2d643b4ef725fe0849d": "0x93e62845c1dd5822ebc807ab71a5fb750decd15a", // NVDAx
  "0xf9523e369c5f55ad72dbaa75b0a9b92b3d8b147e": "0x16e443aebc83e2089aa90431a1c0d311854eec69", // NVOx
  "0x548308e91ec9f285c7bff05295badbd56a6e4971": "0x54f34ceb15313caaee838f77c1c3c2fe2e94526a", // ORCLx
  "0x36c424a6ec0e264b1616102ad63ed2ad7857413e": "0xa00a5538708b5aca7045f2ca15104707965bac94", // PEPx
  "0x1ac765b5bea23184802c7d2d497f7c33f1444a9e": "0x4e6894c3481b3a45393ce8ac9552945ad50a3758", // PFEx
  "0xa90424d5d3e770e8644103ab503ed775dd1318fd": "0x0afc19943fa98e9e9e90fc4ab4d4d3c13e162232", // PGx
  "0x6d482cec5f9dd1f05ccee9fd3ff79b246170f8e2": "0xa3b6fe1a923585bb828fcfaa460b78eefd5ae2ec", // PLTRx
  "0x02a6c1789c3b4fdb1a7a3dfa39f90e5d3c94f4f9": "0x7c2e00e6b0d519a8c492d20c2524342a4398ff34", // PMx
  "0xa753a7395cae905cd615da0b82a53e0560f250af": "0xdbd9232fee15351068fe02f0683146e16d9f2cea", // QQQx
  "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48": "0xc88fcd8b874fdb3256e8b55b3decb8c24eab4c02", // SPYx
  "0x4cbf89ed7bb30b8a860fa86d3c96e9c72931299b": "0xcd932bf1c895b7143ec34df5ae7889d3853904d8", // TBLLx
  "0xfdddb57878ef9d6f681ec4381dcb626b9e69ac86": "0x3d843414e617cbb9d2328c7ecf155d7c18139d6a", // TQQQx
  "0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0": "0x43680abf18cf54898be84c6ef78237cfbd441883", // TSLAx
  "0x167a6375da1efc4a5be0f470e73ecefd66245048": "0xa0412ce46fe877b7f174b82acd95e70063bbaf2a", // UNHx
  "0xbd730e618bcd88c82ddee52e10275cf2f88a4777": "0xe9161f111c55bdd67525c1d4f9bbca07750aaab7", // VTIx
  "0x2363fd1235c1b6d3a5088ddf8df3a0b3a30c5293": "0x3cf193acf378ec224a0209be888b4b0b963e1896", // Vx
  "0x7aefc9965699fbea943e03264d96e50cd4a97b21": "0xa24d9c43d64c76acd962003647fd43a85eb44db8", // WMTx
  "0xeedb0273c5af792745180e9ff568cd01550ffa13": "0x448bc811f60eac772775dd53421380e8d4dc4338", // XOMx
};
// Auto-discovered xStocks (e.g. SPCXx) are added at runtime from the live Fluxion
// token list (/api/strategy/tokens) so new listings resolve their wrapper + count
// as xStocks without any code change.
const DYNAMIC_WRAPPED: Record<string, string> = {};
const resolveWrapped = (addr: string) =>
  UNWRAPPED_TO_WRAPPED[addr.toLowerCase()] || DYNAMIC_WRAPPED[addr.toLowerCase()] || addr;
const isXStock = (addr: string) =>
  !!(UNWRAPPED_TO_WRAPPED[addr.toLowerCase()] || DYNAMIC_WRAPPED[addr.toLowerCase()]);

const ERC20_APPROVE_ABI = [{ inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], name: "approve", outputs: [{ type: "bool" }], stateMutability: "nonpayable", type: "function" }] as const;
const ERC20_ALLOWANCE_ABI = [{ inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], name: "allowance", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" }] as const;
const ERC20_BALANCE_ABI = [{ inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" }] as const;
// SwapHelper ABI — single-tx wrap+swap or swap+unwrap for xStocks
const SWAP_HELPER_WRAP_AND_SWAP_ABI = [{ inputs: [{ name: "xstock", type: "address" }, { name: "wrapper", type: "address" }, { name: "tokenOut", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "fee", type: "uint24" }, { name: "amountOutMin", type: "uint256" }, { name: "deadline", type: "uint256" }], name: "wrapAndSwap", outputs: [{ name: "amountOut", type: "uint256" }], stateMutability: "nonpayable", type: "function" }] as const;
const SWAP_HELPER_SWAP_AND_UNWRAP_ABI = [{ inputs: [{ name: "tokenIn", type: "address" }, { name: "wrapper", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "fee", type: "uint24" }, { name: "amountOutMin", type: "uint256" }, { name: "deadline", type: "uint256" }], name: "swapAndUnwrap", outputs: [{ name: "assets", type: "uint256" }], stateMutability: "nonpayable", type: "function" }] as const;
const MAX_UINT256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

// Agni Finance SwapRouter (Uniswap V3 fork) — the real USDC/USDY pool lives here.
const AGNI_SWAP_ROUTER = "0x319B69888b0d11cEC22caA5034e25FfFBDc88421";

const FACTORY_GET_POOL_ABI = [{ inputs: [{ name: "tokenA", type: "address" }, { name: "tokenB", type: "address" }, { name: "fee", type: "uint24" }], name: "getPool", outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" }] as const;
const POOL_SLOT0_ABI = [{ inputs: [], name: "slot0", outputs: [{ name: "sqrtPriceX96", type: "uint160" }, { name: "tick", type: "int24" }, { name: "observationIndex", type: "uint16" }, { name: "observationCardinality", type: "uint16" }, { name: "observationCardinalityNext", type: "uint16" }, { name: "feeProtocol", type: "uint8" }, { name: "unlocked", type: "bool" }], stateMutability: "view", type: "function" }] as const;
const SWAP_ROUTER_ABI = [{ inputs: [{ components: [{ name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "fee", type: "uint24" }, { name: "recipient", type: "address" }, { name: "deadline", type: "uint256" }, { name: "amountIn", type: "uint256" }, { name: "amountOutMinimum", type: "uint256" }, { name: "sqrtPriceLimitX96", type: "uint160" }], name: "params", type: "tuple" }], name: "exactInputSingle", outputs: [{ name: "amountOut", type: "uint256" }], stateMutability: "payable", type: "function" }] as const;
// Agni multi-hop USDC→USDT→USDY swap — exactInput over an encoded V3 path.
const SWAP_ROUTER_EXACT_INPUT_ABI = [{ inputs: [{ components: [{ name: "path", type: "bytes" }, { name: "recipient", type: "address" }, { name: "deadline", type: "uint256" }, { name: "amountIn", type: "uint256" }, { name: "amountOutMinimum", type: "uint256" }], name: "params", type: "tuple" }], name: "exactInput", outputs: [{ name: "amountOut", type: "uint256" }], stateMutability: "payable", type: "function" }] as const;

// Deterministic gradient per symbol so fallback monograms look intentional, not random.
const ICON_GRADIENTS = [
  "from-blue-500 to-indigo-600", "from-emerald-500 to-teal-600", "from-fuchsia-500 to-purple-600",
  "from-amber-500 to-orange-600", "from-rose-500 to-pink-600", "from-cyan-500 to-sky-600",
  "from-violet-500 to-blue-600", "from-lime-500 to-emerald-600",
];
function gradientFor(symbol: string): string {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  return ICON_GRADIENTS[h % ICON_GRADIENTS.length];
}

export function TokenIcon({ token, size = 28 }: { token: { symbol: string; logo?: string }; size?: number }) {
  const [failed, setFailed] = useState(false);
  const dim = { width: size, height: size };
  if (token.logo && !failed) {
    return (
      <img
        src={token.logo}
        alt={token.symbol}
        style={dim}
        className="rounded-full bg-white/10 object-cover shrink-0"
        onError={() => setFailed(true)}
        loading="lazy"
      />
    );
  }
  const label = token.symbol.replace(/x$/, "").slice(0, 3).toUpperCase();
  return (
    <div
      style={dim}
      className={`shrink-0 rounded-full bg-gradient-to-br ${gradientFor(token.symbol)} flex items-center justify-center font-bold text-white shadow-inner`}
    >
      <span style={{ fontSize: Math.max(8, Math.round(size * 0.34)) }}>{label}</span>
    </div>
  );
}

// Stable, module-scope token picker rendered through a portal so parent re-renders
// (e.g. the 5s LiveBrief tick) never remount it — keeping search focus & scroll intact.
export function TokenSelectorModal({
  open, onClose, tokens, onSelect, search, setSearch, customAddress, setCustomAddress, onAddCustom, excludeAddress, selectedAddress,
}: {
  open: boolean;
  onClose: () => void;
  tokens: SwapToken[];
  onSelect: (t: SwapToken) => void;
  search: string;
  setSearch: (v: string) => void;
  customAddress: string;
  setCustomAddress: (v: string) => void;
  onAddCustom: () => void;
  excludeAddress?: string;
  selectedAddress?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = window.setTimeout(() => searchRef.current?.focus(), 30);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; window.clearTimeout(id); };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const list = tokens.filter(t => t.address.toLowerCase() !== (excludeAddress || "").toLowerCase());
  const validCustom = customAddress.length === 42 && customAddress.startsWith("0x");

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:w-[420px] sm:max-w-[calc(100vw-2rem)] max-h-[85vh] sm:max-h-[600px] flex flex-col bg-[#0d1220] border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-[slideUp_.18s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/5">
          <h3 className="text-sm font-semibold text-white/90">Select a token</h3>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>
        {/* Search */}
        <div className="px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 focus-within:border-blue-500/40 transition-colors">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="text-white/30 shrink-0"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6"/><path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
            <input ref={searchRef} type="text" placeholder="Search name or paste address…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/30 focus:outline-none" />
            {search && <button onClick={() => setSearch("")} aria-label="Clear" className="text-white/30 hover:text-white/70"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></button>}
          </div>
        </div>
        {/* List */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {list.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-white/40">No tokens found{validCustom ? "" : ". Paste a contract address below."}</div>
          ) : list.map((t, i) => {
            const selected = t.address.toLowerCase() === (selectedAddress || "").toLowerCase();
            return (
              <button key={t.address + i} onClick={() => onSelect(t)}
                className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors ${selected ? "bg-blue-500/10" : "hover:bg-white/5"}`}>
                <TokenIcon token={t} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white/90 flex items-center gap-2">
                    {t.symbol}
                    {selected && <span className="text-[9px] font-medium text-blue-300 bg-blue-500/15 px-1.5 py-0.5 rounded-full">Selected</span>}
                  </div>
                  <div className="text-[11px] text-white/40 truncate">{t.name || `${t.address.slice(0, 10)}…${t.address.slice(-6)}`}</div>
                </div>
              </button>
            );
          })}
        </div>
        {/* Custom token */}
        <div className="px-4 py-3 border-t border-white/5 bg-white/[0.02]">
          <div className="text-[10px] uppercase tracking-wide text-white/40 mb-1.5">Import by address</div>
          <div className="flex gap-2">
            <input type="text" placeholder="0x…" value={customAddress} onChange={e => setCustomAddress(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white/80 placeholder:text-white/25 focus:outline-none focus:border-blue-500/40" />
            <button onClick={onAddCustom} disabled={!validCustom}
              className="px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors">Import</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function SwapTab({ walletClient, isConnected, address, allXStocks, publicClient }: { walletClient: any; isConnected: boolean; address: string | undefined; allXStocks: XStockAsset[]; publicClient: any }) {
  const [inputAmount, setInputAmount] = useState("");
  const [outputAmount, setOutputAmount] = useState("");
  const [inputToken, setInputToken] = useState<SwapToken>(BASE_TOKENS[1]);
  const [outputToken, setOutputToken] = useState<SwapToken>(BASE_TOKENS[2]);
  const [quoteData, setQuoteData] = useState<any>(null);
  const [quoting, setQuoting] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [swapStatus, setSwapStatus] = useState<string | null>(null);
  const [showInputSelect, setShowInputSelect] = useState(false);
  const [showOutputSelect, setShowOutputSelect] = useState(false);
  const [tokenSearch, setTokenSearch] = useState("");
  const [customAddress, setCustomAddress] = useState("");
  const [inputBalance, setInputBalance] = useState<string | null>(null);
  const [outputBalance, setOutputBalance] = useState<string | null>(null);
  const [inputBalanceRaw, setInputBalanceRaw] = useState<bigint | null>(null);
  // Live Fluxion-tradable xStocks (SPCXx & future listings auto-appear; dead pools hidden).
  const [fluxTokens, setFluxTokens] = useState<SwapToken[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/strategy/tokens`);
        if (!res.ok) return;
        const data = await res.json();
        const toks: SwapToken[] = [];
        for (const t of (data.tokens || [])) {
          if (!t.symbol || !t.address) continue;
          if (t.wrapper) DYNAMIC_WRAPPED[t.address.toLowerCase()] = t.wrapper.toLowerCase();
          toks.push({ symbol: t.symbol, address: t.address, decimals: t.decimals || 18 });
        }
        if (!cancelled) setFluxTokens(toks);
      } catch { /* keep catalog-only list on failure */ }
    };
    load();
    const id = setInterval(load, 60_000);   // periodic resync
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Build full token list: base tokens + remaining xStocks from JSON (skip those already in BASE_TOKENS)
  const allTokens: SwapToken[] = useMemo(() => {
    // Lookup logos from the xStocks catalog by address + symbol so base tokens
    // that duplicate an xStock (SPYx, NVDAx, AAPLx, ...) still show a real logo.
    const logoByAddr = new Map<string, string>();
    const logoBySymbol = new Map<string, string>();
    const nameByAddr = new Map<string, string>();
    const nameBySymbol = new Map<string, string>();
    for (const s of allXStocks) {
      if (s.logo) { logoByAddr.set(s.mantleAddress.toLowerCase(), s.logo); logoBySymbol.set(s.symbol.toLowerCase(), s.logo); }
      if (s.name) { nameByAddr.set(s.mantleAddress.toLowerCase(), s.name); nameBySymbol.set(s.symbol.toLowerCase(), s.name); }
    }
    const baseAddrs = new Set(BASE_TOKENS.map(t => t.address.toLowerCase()));
    const baseTokens: SwapToken[] = BASE_TOKENS.map(t => ({
      ...t,
      logo: t.logo || logoByAddr.get(t.address.toLowerCase()) || logoBySymbol.get(t.symbol.toLowerCase()) || CORE_TOKEN_META[t.symbol]?.logo,
      name: t.name || nameByAddr.get(t.address.toLowerCase()) || nameBySymbol.get(t.symbol.toLowerCase()) || CORE_TOKEN_META[t.symbol]?.name,
    }));
    const xstockTokens: SwapToken[] = allXStocks
      .filter(s => !baseAddrs.has(s.mantleAddress.toLowerCase()))
      .map(s => ({
        symbol: s.symbol, address: s.mantleAddress, decimals: 18, logo: s.logo, name: s.name,
      }));
    // Live Fluxion tokens not already present (by address or symbol) — e.g. SPCXx.
    const seenAddr = new Set<string>(Array.from(baseAddrs).concat(xstockTokens.map(t => t.address.toLowerCase())));
    const seenSym = new Set<string>(baseTokens.concat(xstockTokens).map(t => t.symbol.toLowerCase()));
    const fluxOnly: SwapToken[] = fluxTokens
      .filter(t => !seenAddr.has(t.address.toLowerCase()) && !seenSym.has(t.symbol.toLowerCase()))
      .map(t => ({
        ...t,
        logo: logoByAddr.get(t.address.toLowerCase()) || logoBySymbol.get(t.symbol.toLowerCase()) || CORE_TOKEN_META[t.symbol]?.logo,
        name: nameByAddr.get(t.address.toLowerCase()) || nameBySymbol.get(t.symbol.toLowerCase()) || CORE_TOKEN_META[t.symbol]?.name,
      }));
    return [...baseTokens, ...xstockTokens, ...fluxOnly];
  }, [allXStocks, fluxTokens]);

  const filteredTokens = useMemo(() => {
    if (!tokenSearch) return allTokens;
    const q = tokenSearch.toLowerCase();
    return allTokens.filter(t =>
      t.symbol.toLowerCase().includes(q) ||
      t.address.toLowerCase().includes(q) ||
      (t.name || "").toLowerCase().includes(q)
    );
  }, [allTokens, tokenSearch]);

  // Fetch token balances
  useEffect(() => {
    if (!address || !publicClient) { setInputBalance(null); setOutputBalance(null); setInputBalanceRaw(null); return; }
    const fetchBal = async (token: SwapToken, setter: (v: string | null) => void, rawSetter?: (v: bigint | null) => void) => {
      try {
        if (token.address === NATIVE_MNT_ADDRESS) {
          const bal = await publicClient.getBalance({ address: address as `0x${string}` });
          setter((Number(bal) / (10 ** 18)).toFixed(4));
          rawSetter?.(bal as bigint);
        } else {
          const bal = await publicClient.readContract({ address: token.address as `0x${string}`, abi: ERC20_BALANCE_ABI, functionName: "balanceOf", args: [address as `0x${string}`] });
          const numBal = Number(bal) / (10 ** token.decimals);
          setter(numBal.toFixed(Math.min(token.decimals, 6)));
          rawSetter?.(bal as bigint);
        }
      } catch { setter(null); rawSetter?.(null); }
    };
    fetchBal(inputToken, setInputBalance, setInputBalanceRaw);
    fetchBal(outputToken, setOutputBalance);
  }, [address, inputToken, outputToken, publicClient]);

  // Direct on-chain quote fallback for pools not indexed by Fluxion Quote API
  const getDirectOnChainQuote = useCallback(async (
    inToken: SwapToken, outToken: SwapToken, rawAmountBigInt: bigint, userAddr: string
  ) => {
    if (!publicClient) return null;
    const inputAddr = inToken.address === NATIVE_MNT_ADDRESS ? WMNT_ADDRESS : resolveWrapped(inToken.address);
    const outputAddr = outToken.address === NATIVE_MNT_ADDRESS ? WMNT_ADDRESS : resolveWrapped(outToken.address);
    const feeTiers = [3000, 500, 10000];
    for (const fee of feeTiers) {
      try {
        const poolAddress = await publicClient.readContract({
          address: FLUXION_FACTORY as `0x${string}`, abi: FACTORY_GET_POOL_ABI, functionName: "getPool",
          args: [inputAddr as `0x${string}`, outputAddr as `0x${string}`, fee],
        });
        if (!poolAddress || poolAddress === "0x0000000000000000000000000000000000000000") continue;
        const slot0 = await publicClient.readContract({
          address: poolAddress as `0x${string}`, abi: POOL_SLOT0_ABI, functionName: "slot0",
        });
        const sqrtPriceX96 = slot0[0] as bigint;
        if (sqrtPriceX96 === BigInt(0)) continue;
        const token0Addr = inputAddr.toLowerCase() < outputAddr.toLowerCase() ? inputAddr.toLowerCase() : outputAddr.toLowerCase();
        const isToken0Input = inputAddr.toLowerCase() === token0Addr;
        const Q192 = BigInt("6277101735386680763835789423207666416102355444464034512896");
        let outAmount: bigint;
        if (isToken0Input) {
          outAmount = rawAmountBigInt * sqrtPriceX96 * sqrtPriceX96 / Q192;
        } else {
          outAmount = rawAmountBigInt * Q192 / (sqrtPriceX96 * sqrtPriceX96);
        }
        if (outAmount <= BigInt(0)) continue;
        const minOutAmount = outAmount * BigInt(99) / BigInt(100);
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
        const swapCalldata = encodeFunctionData({
          abi: SWAP_ROUTER_ABI, functionName: "exactInputSingle",
          args: [{ tokenIn: inputAddr as `0x${string}`, tokenOut: outputAddr as `0x${string}`, fee, recipient: userAddr as `0x${string}`, deadline, amountIn: rawAmountBigInt, amountOutMinimum: minOutAmount, sqrtPriceLimitX96: BigInt(0) }],
        });
        const txValue = inToken.address === NATIVE_MNT_ADDRESS ? rawAmountBigInt.toString() : "0";
        return {
          outAmount: outAmount.toString(), minOutAmount: minOutAmount.toString(),
          priceImpact: "< 0.5", route: `Direct V3 Pool (${(fee / 10000).toFixed(2)}%)`,
          directSwap: true,
          tx: { to: FLUXION_ROUTER, data: swapCalldata, value: txValue },
        };
      } catch { continue; }
    }
    return null;
  }, [publicClient]);

  const fetchQuote = useCallback(async (amount: string) => {
    if (!amount || parseFloat(amount) <= 0) { setOutputAmount(""); setQuoteData(null); return; }
    if (!inputToken || !outputToken) return;
    const rawAmountBigInt = BigInt(Math.floor(parseFloat(amount) * (10 ** inputToken.decimals)));
    const rawAmount = rawAmountBigInt.toString();
    // For native MNT swaps, use WMNT address in the quote (router wraps automatically)
    const inputMint = inputToken.address === NATIVE_MNT_ADDRESS ? WMNT_ADDRESS : resolveWrapped(inputToken.address);
    const outputMint = outputToken.address === NATIVE_MNT_ADDRESS ? WMNT_ADDRESS : resolveWrapped(outputToken.address);
    setQuoting(true);
    try {
      const res = await fetch(FLUXION_QUOTE_API, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputMint, outputMint, amount: rawAmount, userPublicKey: address || "0x0000000000000000000000000000000000000001", dynamicSlippage: false, slippageBps: "100" }),
      });
      const data = await res.json();
      if (data.outAmount) {
        const out = parseFloat(data.outAmount) / (10 ** outputToken.decimals);
        setOutputAmount(out.toFixed(6));
        setQuoteData(data);
      } else {
        // API doesn't know this pool — try direct on-chain quote
        const direct = await getDirectOnChainQuote(inputToken, outputToken, rawAmountBigInt, address || "0x0000000000000000000000000000000000000001");
        if (direct) {
          const out = parseFloat(direct.outAmount) / (10 ** outputToken.decimals);
          setOutputAmount(out.toFixed(6));
          setQuoteData(direct);
        } else {
          setOutputAmount(""); setQuoteData(data.error ? { error: data.error } : null);
        }
      }
    } catch {
      // Network error — try direct on-chain quote
      const direct = await getDirectOnChainQuote(inputToken, outputToken, rawAmountBigInt, address || "0x0000000000000000000000000000000000000001");
      if (direct) {
        const out = parseFloat(direct.outAmount) / (10 ** outputToken.decimals);
        setOutputAmount(out.toFixed(6));
        setQuoteData(direct);
      } else {
        setOutputAmount(""); setQuoteData(null);
      }
    }
    setQuoting(false);
  }, [inputToken, outputToken, address, getDirectOnChainQuote]);

  useEffect(() => {
    const timer = setTimeout(() => { if (inputAmount) fetchQuote(inputAmount); }, 500);
    return () => clearTimeout(timer);
  }, [inputAmount, fetchQuote]);

  // Find which fee tier a Fluxion pool uses for a given pair (wrapped addresses)
  const findPoolFee = useCallback(async (tokenA: string, tokenB: string): Promise<number> => {
    if (!publicClient) return 3000;
    for (const fee of [3000, 500, 10000]) {
      try {
        const pool = await publicClient.readContract({
          address: FLUXION_FACTORY as `0x${string}`, abi: FACTORY_GET_POOL_ABI, functionName: "getPool",
          args: [tokenA as `0x${string}`, tokenB as `0x${string}`, fee],
        }) as string;
        if (pool && pool !== "0x0000000000000000000000000000000000000000") return fee;
      } catch { continue; }
    }
    return 3000;
  }, [publicClient]);

  const executeSwap = async () => {
    if (!walletClient || !quoteData?.tx || !address || !publicClient) return;
    setSwapping(true); setSwapStatus(null);
    try {
      const parsedAmount = parseFloat(inputAmount);
      const calcRaw = BigInt(Math.floor(parsedAmount * (10 ** inputToken.decimals)));
      const rawAmount = (inputBalanceRaw !== null && calcRaw >= inputBalanceRaw) ? inputBalanceRaw : calcRaw;
      const inputIsXStock = isXStock(inputToken.address);
      const outputIsXStock = isXStock(outputToken.address);
      const helperAddr = XSTOCK_SWAP_HELPER as `0x${string}`;
      const useHelper = helperAddr !== "0x0000000000000000000000000000000000000000" && (inputIsXStock || outputIsXStock);

      if (useHelper && inputIsXStock) {
        // SELLING xStock → token: single-tx via SwapHelper.wrapAndSwap()
        const wrappedAddr = resolveWrapped(inputToken.address) as `0x${string}`;
        const outputAddr = outputToken.address === NATIVE_MNT_ADDRESS ? WMNT_ADDRESS as `0x${string}` : resolveWrapped(outputToken.address) as `0x${string}`;
        // Approve original xStock for the helper (one-time)
        const allowance = await publicClient.readContract({
          address: inputToken.address as `0x${string}`, abi: ERC20_ALLOWANCE_ABI,
          functionName: "allowance", args: [address as `0x${string}`, helperAddr],
        }) as bigint;
        if (allowance < rawAmount) {
          setSwapStatus("Approving token...");
          const ah = await walletClient.writeContract({
            address: inputToken.address as `0x${string}`, abi: ERC20_APPROVE_ABI,
            functionName: "approve", args: [helperAddr, MAX_UINT256],
          });
          await publicClient.waitForTransactionReceipt({ hash: ah, confirmations: 1 });
        }
        const fee = await findPoolFee(wrappedAddr, outputAddr);
        const minOut = quoteData.outAmount ? BigInt(quoteData.outAmount) * BigInt(99) / BigInt(100) : BigInt(0);
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
        setSwapStatus("Wrapping & swapping...");
        const tx = await walletClient.writeContract({
          address: helperAddr, abi: SWAP_HELPER_WRAP_AND_SWAP_ABI,
          functionName: "wrapAndSwap",
          args: [inputToken.address as `0x${string}`, wrappedAddr, outputAddr, rawAmount, fee, minOut, deadline],
        });
        setSwapStatus("Waiting for confirmation...");
        await publicClient.waitForTransactionReceipt({ hash: tx, confirmations: 1 });
        setSwapStatus(`Swap successful! Tx: ${tx.slice(0, 10)}...`);
      } else if (useHelper && outputIsXStock) {
        // BUYING xStock: single-tx via SwapHelper.swapAndUnwrap()
        const wrappedAddr = resolveWrapped(outputToken.address) as `0x${string}`;
        const inputAddr = inputToken.address === NATIVE_MNT_ADDRESS ? WMNT_ADDRESS as `0x${string}` : inputToken.address as `0x${string}`;
        // Approve input token for the helper
        if (inputToken.address !== NATIVE_MNT_ADDRESS) {
          const allowance = await publicClient.readContract({
            address: inputAddr, abi: ERC20_ALLOWANCE_ABI,
            functionName: "allowance", args: [address as `0x${string}`, helperAddr],
          }) as bigint;
          if (allowance < rawAmount) {
            setSwapStatus("Approving token...");
            const ah = await walletClient.writeContract({
              address: inputAddr, abi: ERC20_APPROVE_ABI,
              functionName: "approve", args: [helperAddr, MAX_UINT256],
            });
            await publicClient.waitForTransactionReceipt({ hash: ah, confirmations: 1 });
          }
        }
        const fee = await findPoolFee(inputAddr, wrappedAddr);
        const minOut = quoteData.outAmount ? BigInt(quoteData.outAmount) * BigInt(99) / BigInt(100) : BigInt(0);
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
        setSwapStatus("Swapping & unwrapping...");
        const tx = await walletClient.writeContract({
          address: helperAddr, abi: SWAP_HELPER_SWAP_AND_UNWRAP_ABI,
          functionName: "swapAndUnwrap",
          args: [inputAddr, wrappedAddr, rawAmount, fee, minOut, deadline],
        });
        setSwapStatus("Waiting for confirmation...");
        await publicClient.waitForTransactionReceipt({ hash: tx, confirmations: 1 });
        setSwapStatus(`Swap successful! Tx: ${tx.slice(0, 10)}...`);
      } else {
        // Non-xStock swap: use Fluxion Quote API tx directly
        if (inputToken.address !== NATIVE_MNT_ADDRESS) {
          const currentAllowance = await publicClient.readContract({
            address: inputToken.address as `0x${string}`, abi: ERC20_ALLOWANCE_ABI,
            functionName: "allowance", args: [address as `0x${string}`, FLUXION_ROUTER as `0x${string}`],
          }) as bigint;
          if (currentAllowance < rawAmount) {
            setSwapStatus("Approving token...");
            const approveHash = await walletClient.writeContract({
              address: inputToken.address as `0x${string}`, abi: ERC20_APPROVE_ABI,
              functionName: "approve", args: [FLUXION_ROUTER as `0x${string}`, MAX_UINT256],
            });
            await publicClient.waitForTransactionReceipt({ hash: approveHash, confirmations: 1 });
          }
        }
        const inputMint = inputToken.address === NATIVE_MNT_ADDRESS ? WMNT_ADDRESS : resolveWrapped(inputToken.address);
        const outputMint = outputToken.address === NATIVE_MNT_ADDRESS ? WMNT_ADDRESS : resolveWrapped(outputToken.address);
        let freshTx = quoteData.tx;
        try {
          const res = await fetch(FLUXION_QUOTE_API, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inputMint, outputMint, amount: rawAmount.toString(), userPublicKey: address, dynamicSlippage: false, slippageBps: "100" }),
          });
          const freshData = await res.json();
          if (freshData.tx) { freshTx = freshData.tx; }
        } catch { /* use cached quote tx data */ }
        setSwapStatus("Executing swap...");
        const value = inputToken.address === NATIVE_MNT_ADDRESS ? rawAmount.toString() : (freshTx.value || "0");
        const tx = await walletClient.sendTransaction({ to: freshTx.to as `0x${string}`, data: freshTx.data as `0x${string}`, value: BigInt(value) });
        setSwapStatus("Waiting for confirmation...");
        await publicClient.waitForTransactionReceipt({ hash: tx, confirmations: 1 });
        setSwapStatus(`Swap successful! Tx: ${tx.slice(0, 10)}...`);
      }
      setInputAmount(""); setOutputAmount(""); setQuoteData(null);
    } catch (err: any) { setSwapStatus(`Error: ${err.shortMessage || err.message || "Transaction failed"}`); }
    setSwapping(false);
  };

  const swapTokens = () => { const tmp = inputToken; setInputToken(outputToken); setOutputToken(tmp); setInputAmount(""); setOutputAmount(""); setQuoteData(null); };

  const selectToken = (token: SwapToken, side: "input" | "output") => {
    if (side === "input") { setInputToken(token); setInputAmount(""); setOutputAmount(""); }
    else { setOutputToken(token); setOutputAmount(""); }
    setShowInputSelect(false); setShowOutputSelect(false); setTokenSearch(""); setQuoteData(null);
  };

  const addCustomToken = (side: "input" | "output") => {
    if (customAddress.length === 42 && customAddress.startsWith("0x")) {
      const token: SwapToken = { symbol: customAddress.slice(0, 6) + "...", address: customAddress, decimals: 18 };
      selectToken(token, side);
      setCustomAddress("");
    }
  };

  const selectorSide: "input" | "output" | null = showInputSelect ? "input" : showOutputSelect ? "output" : null;
  const closeSelector = useCallback(() => { setShowInputSelect(false); setShowOutputSelect(false); setTokenSearch(""); }, []);
  const openSelector = (side: "input" | "output") => {
    setTokenSearch(""); setCustomAddress("");
    if (side === "input") { setShowInputSelect(true); setShowOutputSelect(false); }
    else { setShowOutputSelect(true); setShowInputSelect(false); }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold mb-1">Swap</h2>
        <p className="text-xs text-white/40">Trade any token on Fluxion DEX — {allTokens.length} tokens available</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-white/50">Powered by</span>
            <a href="https://fluxion.network" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors">
              Fluxion Network
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M4 12L12 4M12 4H6M12 4v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </a>
          </div>

          <div className="space-y-3">
            {/* Input token */}
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-white/40">You pay</span>
                <span className="text-[10px] text-white/30 flex items-center gap-1">
                  {inputBalance !== null ? `Balance: ${inputBalance}` : "Balance: —"}
                  {inputBalance && <button onClick={() => { if (inputBalanceRaw !== null) { setInputAmount((Number(inputBalanceRaw) / (10 ** inputToken.decimals)).toString()); } else { setInputAmount(inputBalance); } }} className="text-blue-400 hover:text-blue-300 font-semibold">MAX</button>}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input type="text" inputMode="decimal" placeholder="0.0" value={inputAmount} onChange={(e) => setInputAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="flex-1 min-w-0 bg-transparent text-2xl font-bold text-white/90 placeholder:text-white/20 focus:outline-none" />
                <button onClick={() => openSelector("input")}
                  className="shrink-0 pl-1.5 pr-2.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm font-semibold text-white/90 flex items-center gap-1.5 hover:bg-white/10 transition-all">
                  <TokenIcon token={inputToken} size={24} />
                  {inputToken.symbol.length > 8 ? inputToken.symbol.slice(0, 8) + ".." : inputToken.symbol}
                  <svg width="9" height="9" viewBox="0 0 16 16" fill="none" className="text-white/50"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                </button>
              </div>
            </div>

            {/* Swap direction */}
            <div className="flex justify-center -my-1.5 relative z-10">
              <button onClick={swapTokens} className="w-8 h-8 rounded-lg bg-[#0d1220] border border-white/10 flex items-center justify-center text-white/50 hover:text-white/80 hover:border-white/20 transition-all">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M5 10l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>

            {/* Output token */}
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-white/40">You receive</span>
                <span className="text-[10px] text-white/30">{outputBalance !== null ? `Balance: ${outputBalance}` : "Balance: —"}</span>
              </div>
              <div className="flex items-center gap-3">
                <input type="text" placeholder="0.0" value={quoting ? "..." : outputAmount} readOnly
                  className="flex-1 min-w-0 bg-transparent text-2xl font-bold text-white/90 placeholder:text-white/20 focus:outline-none" />
                <button onClick={() => openSelector("output")}
                  className="shrink-0 pl-1.5 pr-2.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm font-semibold text-white/90 flex items-center gap-1.5 hover:bg-white/10 transition-all">
                  <TokenIcon token={outputToken} size={24} />
                  {outputToken.symbol.length > 8 ? outputToken.symbol.slice(0, 8) + ".." : outputToken.symbol}
                  <svg width="9" height="9" viewBox="0 0 16 16" fill="none" className="text-white/50"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                </button>
              </div>
            </div>
          </div>

          {/* Quote details */}
          {quoteData && !quoteData.error && (
            <div className="mt-4 p-3 rounded-lg bg-white/[0.02] border border-white/5 space-y-1.5">
              <div className="flex justify-between text-[10px]">
                <span className="text-white/40">Price Impact</span>
                <span className="text-white/60">{quoteData.priceImpact || "< 0.01"}%</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-white/40">Slippage Tolerance</span>
                <span className="text-white/60">0.5%</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-white/40">Route</span>
                <span className="text-white/60">{quoteData.route || "Fluxion V3"}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-white/40">Min. received</span>
                <span className="text-white/60">{quoteData.minOutAmount ? (parseFloat(quoteData.minOutAmount) / (10 ** outputToken.decimals)).toFixed(6) : "—"} {outputToken.symbol}</span>
              </div>
            </div>
          )}

          {/* No liquidity warning */}
          {quoteData?.error && (
            <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400">
              <div className="font-semibold mb-1">No liquidity pool found for this pair</div>
              <div className="text-amber-400/70">Try swapping through WMNT or USDC as intermediary. Not all xStocks have direct trading pools yet — check <a href="https://fluxion.network/trade" target="_blank" rel="noreferrer" className="underline">fluxion.network/trade</a> for available pairs.</div>
            </div>
          )}

          {/* Swap button */}
          {!isConnected ? (
            <div className="mt-4 w-full py-3 rounded-xl bg-white/5 text-white/40 font-semibold text-sm text-center border border-white/10">
              Connect Wallet to Swap
            </div>
          ) : (
            <button
              onClick={executeSwap}
              disabled={!quoteData?.tx || swapping || !inputAmount}
              className={`mt-4 w-full py-3 rounded-xl font-semibold text-sm text-center transition-all ${
                quoteData?.tx && !swapping && inputAmount
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-lg hover:shadow-blue-500/20"
                  : "bg-white/5 text-white/30 border border-white/10 cursor-not-allowed"
              }`}
            >
              {swapping ? "Processing..." : !inputAmount ? "Enter amount" : quoting ? "Getting quote..." : !quoteData?.tx ? "No route available" : "Swap"}
            </button>
          )}

          {swapStatus && (
            <div className={`mt-3 p-2.5 rounded-lg text-[10px] text-center ${swapStatus.includes("Error") ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-blue-500/10 text-blue-400 border border-blue-500/20"}`}>
              {swapStatus}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-white/5 bg-white/[0.01]">
          <div className="flex items-center justify-between text-[10px] text-white/30">
            <span>Mantle Network · ChainID 5000</span>
            <span>Router: {FLUXION_ROUTER.slice(0, 6)}...{FLUXION_ROUTER.slice(-4)}</span>
          </div>
        </div>
      </div>

      <TokenSelectorModal
        open={selectorSide !== null}
        onClose={closeSelector}
        tokens={filteredTokens}
        onSelect={(t) => selectorSide && selectToken(t, selectorSide)}
        search={tokenSearch}
        setSearch={setTokenSearch}
        customAddress={customAddress}
        setCustomAddress={setCustomAddress}
        onAddCustom={() => selectorSide && addCustomToken(selectorSide)}
        excludeAddress={selectorSide === "input" ? outputToken.address : selectorSide === "output" ? inputToken.address : undefined}
        selectedAddress={selectorSide === "input" ? inputToken.address : selectorSide === "output" ? outputToken.address : undefined}
      />
    </div>
  );
}


/* ========== POOLS TAB ========== */
// Fluxion AMM V3 (Uniswap V3 fork) on Mantle — verified against the Fluxion docs:
// https://fluxion-network.gitbook.io/fluxion-network/developer-resources/technical-overview-and-api
const POSITION_MANAGER = "0x2b70C4e7cA8E920435A5dB191e066E9E3AFd8DB3"; // NonfungiblePositionManager
const MANTLE_EXPLORER = "https://explorer.mantle.xyz";

// Reverse of UNWRAPPED_TO_WRAPPED: wrapped pool token (ERC-4626 vault) -> original xStock.
const WRAPPED_TO_UNWRAPPED: Record<string, string> = Object.fromEntries(
  Object.entries(UNWRAPPED_TO_WRAPPED).map(([unwrapped, wrapped]) => [wrapped.toLowerCase(), unwrapped.toLowerCase()])
);

// Tokens used as the quote side when discovering pools.
const QUOTE_TOKENS: { symbol: string; address: string; decimals: number; logo?: string }[] = [
  { symbol: "USDC", address: USDC_MANTLE, decimals: 6, logo: "/tokens/usdc.png" },
  { symbol: "WMNT", address: WMNT_ADDRESS, decimals: 18, logo: "/tokens/mnt.png" },
  { symbol: "WETH", address: "0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111", decimals: 18, logo: "/tokens/weth.png" },
];
const FEE_TIERS = [3000, 500, 10000] as const;
const FEE_TICK_SPACING: Record<number, number> = { 100: 1, 500: 10, 3000: 60, 10000: 200 };
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Read live USD prices for every xStock that has a Fluxion V3 USDC pool on
// Mantle, directly on-chain (factory.getPool + pool.slot0). Returns a map of
// xStock symbol -> price in USDC. Never throws.
async function fetchFluxionPrices(stocks: { symbol: string; mantleAddress: string }[]): Promise<Record<string, number>> {
  try {
    type Cand = { symbol: string; wrapped: string; fee: number };
    const cands: Cand[] = [];
    for (const s of stocks) {
      const wrapped = UNWRAPPED_TO_WRAPPED[s.mantleAddress.toLowerCase()];
      if (!wrapped) continue;
      for (const fee of FEE_TIERS) cands.push({ symbol: s.symbol, wrapped, fee });
    }
    if (!cands.length) return {};

    const poolAddrs: string[] = await mantleClient.multicall({
      allowFailure: true,
      contracts: cands.map((c) => ({
        address: FLUXION_FACTORY as `0x${string}`, abi: FACTORY_GET_POOL_ABI, functionName: "getPool",
        args: [c.wrapped as `0x${string}`, USDC_MANTLE as `0x${string}`, c.fee],
      })),
    }).then((rows: any[]) => rows.map((r) => (r.status === "success" ? (r.result as string) : ZERO_ADDRESS)));

    const live = cands.map((c, i) => ({ c, pool: poolAddrs[i] })).filter((x) => x.pool && x.pool !== ZERO_ADDRESS);
    if (!live.length) return {};

    const slots: any[] = await mantleClient.multicall({
      allowFailure: true,
      contracts: live.map((l) => ({ address: l.pool as `0x${string}`, abi: POOL_SLOT0_ABI, functionName: "slot0" })),
    });

    const usdc = USDC_MANTLE.toLowerCase();
    const out: Record<string, number> = {};
    for (let i = 0; i < live.length; i++) {
      const { c, pool } = live[i];
      void pool;
      const slot0 = slots[i];
      if (slot0.status !== "success" || !slot0.result) continue;
      const sqrtP = Number(slot0.result[0] as bigint);
      if (!sqrtP) continue;
      const tokenAddr = c.wrapped.toLowerCase();
      const aDecimals = 18; // wrapped vault tokens are 18 decimals
      const bDecimals = 6;  // USDC
      const token0 = tokenAddr < usdc ? tokenAddr : usdc;
      const token1 = tokenAddr < usdc ? usdc : tokenAddr;
      const dec0 = token0 === usdc ? bDecimals : aDecimals;
      const dec1 = token1 === usdc ? bDecimals : aDecimals;
      const price1per0 = (sqrtP / 2 ** 96) ** 2 * (10 ** dec0) / (10 ** dec1);
      const aIsToken0 = token0 === tokenAddr;
      const priceUsd = aIsToken0 ? price1per0 : (price1per0 ? 1 / price1per0 : 0);
      if (priceUsd > 0 && Number.isFinite(priceUsd) && !out[c.symbol]) out[c.symbol] = priceUsd;
    }
    return out;
  } catch {
    return {};
  }
}

const POOL_LIQUIDITY_ABI = [{ inputs: [], name: "liquidity", outputs: [{ name: "", type: "uint128" }], stateMutability: "view", type: "function" }] as const;
const ERC4626_ABI = [
  { inputs: [{ name: "assets", type: "uint256" }, { name: "receiver", type: "address" }], name: "deposit", outputs: [{ name: "shares", type: "uint256" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "assets", type: "uint256" }], name: "previewDeposit", outputs: [{ name: "shares", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "asset", outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" },
] as const;
const POSITION_MANAGER_MINT_ABI = [{
  inputs: [{ components: [
    { name: "token0", type: "address" }, { name: "token1", type: "address" }, { name: "fee", type: "uint24" },
    { name: "tickLower", type: "int24" }, { name: "tickUpper", type: "int24" },
    { name: "amount0Desired", type: "uint256" }, { name: "amount1Desired", type: "uint256" },
    { name: "amount0Min", type: "uint256" }, { name: "amount1Min", type: "uint256" },
    { name: "recipient", type: "address" }, { name: "deadline", type: "uint256" },
  ], name: "params", type: "tuple" }],
  name: "mint",
  outputs: [{ name: "tokenId", type: "uint256" }, { name: "liquidity", type: "uint128" }, { name: "amount0", type: "uint256" }, { name: "amount1", type: "uint256" }],
  stateMutability: "payable", type: "function",
}] as const;

interface PoolInfo {
  key: string;
  pool: string;
  fee: number;
  tickSpacing: number;
  token0: string; token1: string;
  // Display sides (A = the "stock"/volatile side, B = the quote side, usually USDC)
  aSymbol: string; aLogo?: string; aDecimals: number; aAddress: string; aWrapped?: string; aIsXStock: boolean;
  bSymbol: string; bLogo?: string; bDecimals: number; bAddress: string;
  priceUsd: number;        // USD value of 1 unit of token A (quoted in token B, assumed USD-pegged when USDC)
  tvlUsd: number;
  reserveA: number; reserveB: number;
  quoteIsUsd: boolean;
}

const fmtUsd = (n: number): string => {
  if (!isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
};
const fmtPrice = (n: number): string => {
  if (!isFinite(n) || n <= 0) return "—";
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  return n.toPrecision(4);
};
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function CopyAddress({ address, label }: { address: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
      className="inline-flex items-center gap-1 font-mono text-[10px] text-white/40 hover:text-white/70 transition-colors"
      title={`Copy ${address}`}
    >
      {label ? <span className="text-white/30">{label}</span> : null}
      <span>{shortAddr(address)}</span>
      {copied
        ? <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3 3 7-7" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        : <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M3.5 10.5h-1A1.5 1.5 0 011 9V2.5A1.5 1.5 0 012.5 1H9a1.5 1.5 0 011.5 1.5v1" stroke="currentColor" strokeWidth="1.3"/></svg>}
    </button>
  );
}

export function PoolsTab({ walletClient, isConnected, address, allXStocks }: { walletClient: any; isConnected: boolean; address: string | undefined; allXStocks: XStockAsset[] }) {
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [poolFilter, setPoolFilter] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Add-liquidity form state
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [lastEdited, setLastEdited] = useState<"a" | "b">("a");
  const [balA, setBalA] = useState<number | null>(null);
  const [balB, setBalB] = useState<number | null>(null);
  const [depositing, setDepositing] = useState(false);
  const [depositStatus, setDepositStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Catalog lookups: original xStock address -> { logo, symbol, name }
  const catalogByAddr = useMemo(() => {
    const m = new Map<string, { logo?: string; symbol: string; name?: string }>();
    for (const s of allXStocks) m.set(s.mantleAddress.toLowerCase(), { logo: s.logo, symbol: s.symbol, name: s.name });
    return m;
  }, [allXStocks]);

  const baseByAddr = useMemo(() => {
    const m = new Map<string, { logo?: string; symbol: string; decimals: number }>();
    for (const t of BASE_TOKENS) m.set(t.address.toLowerCase(), { logo: t.logo, symbol: t.symbol, decimals: t.decimals });
    return m;
  }, []);

  // ---- On-chain pool discovery -------------------------------------------------
  const discover = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      // 1) Candidate (tokenA, tokenB, fee) triples.
      type Cand = { aAddr: string; aWrapped?: string; bAddr: string; fee: number };
      const cands: Cand[] = [];
      // xStock pools: wrapped vault vs USDC (the live RWA pools on Fluxion).
      for (const [unwrapped, wrapped] of Object.entries(UNWRAPPED_TO_WRAPPED)) {
        for (const fee of FEE_TIERS) cands.push({ aAddr: unwrapped, aWrapped: wrapped, bAddr: USDC_MANTLE, fee });
      }
      // Base pairs (no xStock wrapper): WMNT/USDC, WETH/USDC.
      for (const fee of FEE_TIERS) {
        cands.push({ aAddr: WMNT_ADDRESS, bAddr: USDC_MANTLE, fee });
        cands.push({ aAddr: "0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111", bAddr: USDC_MANTLE, fee });
      }

      const poolAddrs: (string)[] = await mantleClient.multicall({
        allowFailure: true,
        contracts: cands.map(c => ({
          address: FLUXION_FACTORY as `0x${string}`, abi: FACTORY_GET_POOL_ABI, functionName: "getPool",
          args: [(c.aWrapped || c.aAddr) as `0x${string}`, c.bAddr as `0x${string}`, c.fee],
        })),
      }).then((rows: any[]) => rows.map(r => (r.status === "success" ? (r.result as string) : ZERO_ADDRESS)));

      const live = cands
        .map((c, i) => ({ c, pool: poolAddrs[i] }))
        .filter(x => x.pool && x.pool !== ZERO_ADDRESS);

      if (live.length === 0) { setPools([]); setLoading(false); return; }

      // 2) Read price (slot0), liquidity and reserves for each live pool.
      const detailCalls: any[] = [];
      for (const { c, pool } of live) {
        const tokenAddr = (c.aWrapped || c.aAddr) as `0x${string}`;
        detailCalls.push({ address: pool as `0x${string}`, abi: POOL_SLOT0_ABI, functionName: "slot0" });
        detailCalls.push({ address: pool as `0x${string}`, abi: POOL_LIQUIDITY_ABI, functionName: "liquidity" });
        detailCalls.push({ address: c.bAddr as `0x${string}`, abi: ERC20_BALANCE_ABI, functionName: "balanceOf", args: [pool as `0x${string}`] });
        detailCalls.push({ address: tokenAddr, abi: ERC20_BALANCE_ABI, functionName: "balanceOf", args: [pool as `0x${string}`] });
      }
      const details: any[] = await mantleClient.multicall({ allowFailure: true, contracts: detailCalls });

      // WMNT price in USD, derived from the WMNT/USDC pool (used to value WMNT-side reserves).
      let wmntUsd = 0;

      const out: PoolInfo[] = [];
      for (let i = 0; i < live.length; i++) {
        const { c, pool } = live[i];
        const slot0 = details[i * 4];
        const liqRow = details[i * 4 + 1];
        const bBalRow = details[i * 4 + 2];
        const aBalRow = details[i * 4 + 3];
        if (slot0.status !== "success" || !slot0.result) continue;
        const sqrtP = Number(slot0.result[0] as bigint);
        if (!sqrtP) continue;

        const tokenAddr = (c.aWrapped || c.aAddr);
        const aDecimals = 18; // wrapped vaults + WMNT/WETH are all 18
        const bDecimals = c.bAddr.toLowerCase() === USDC_MANTLE.toLowerCase() ? 6 : 18;

        // token0 is the lower address (Uniswap sort order)
        const token0 = tokenAddr.toLowerCase() < c.bAddr.toLowerCase() ? tokenAddr : c.bAddr;
        const token1 = tokenAddr.toLowerCase() < c.bAddr.toLowerCase() ? c.bAddr : tokenAddr;
        const dec0 = token0.toLowerCase() === c.bAddr.toLowerCase() ? bDecimals : aDecimals;
        const dec1 = token1.toLowerCase() === c.bAddr.toLowerCase() ? bDecimals : aDecimals;
        // price of token0 expressed in token1 units
        const price1per0 = (sqrtP / 2 ** 96) ** 2 * (10 ** dec0) / (10 ** dec1);
        const aIsToken0 = token0.toLowerCase() === tokenAddr.toLowerCase();
        // price of token A in token B units
        const priceAinB = aIsToken0 ? price1per0 : (price1per0 ? 1 / price1per0 : 0);

        const reserveB = bBalRow.status === "success" ? Number(bBalRow.result as bigint) / 10 ** bDecimals : 0;
        const reserveA = aBalRow.status === "success" ? Number(aBalRow.result as bigint) / 10 ** aDecimals : 0;

        const quoteIsUsd = c.bAddr.toLowerCase() === USDC_MANTLE.toLowerCase();
        if (c.aAddr.toLowerCase() === WMNT_ADDRESS.toLowerCase() && quoteIsUsd && priceAinB > 0) wmntUsd = priceAinB;

        // resolve display metadata for token A
        let aSymbol = "?", aLogo: string | undefined, aIsXStock = false;
        const unwrappedLc = c.aWrapped ? WRAPPED_TO_UNWRAPPED[c.aWrapped.toLowerCase()] : c.aAddr.toLowerCase();
        const cat = unwrappedLc ? catalogByAddr.get(unwrappedLc) : undefined;
        if (c.aWrapped && cat) { aSymbol = cat.symbol; aLogo = cat.logo; aIsXStock = true; }
        else {
          const base = baseByAddr.get(c.aAddr.toLowerCase());
          if (base) { aSymbol = base.symbol; aLogo = base.logo; }
        }
        const bMeta = baseByAddr.get(c.bAddr.toLowerCase());
        const bSymbol = bMeta?.symbol || "USDC";
        const bLogo = bMeta?.logo;

        const priceUsd = quoteIsUsd ? priceAinB : priceAinB * wmntUsd;
        const tvlUsd = quoteIsUsd
          ? reserveB + reserveA * priceAinB
          : (reserveB * wmntUsd) + (reserveA * priceUsd);

        out.push({
          key: `${pool}-${c.fee}`, pool, fee: c.fee, tickSpacing: FEE_TICK_SPACING[c.fee] || 60,
          token0, token1,
          aSymbol, aLogo, aDecimals, aAddress: c.aAddr, aWrapped: c.aWrapped, aIsXStock,
          bSymbol, bLogo, bDecimals, bAddress: c.bAddr,
          priceUsd, tvlUsd, reserveA, reserveB, quoteIsUsd,
        });
      }
      // Hide empty/dust pools (no real liquidity) for a cleaner list.
      const visible = out.filter(p => p.tvlUsd >= 1);
      visible.sort((a, b) => b.tvlUsd - a.tvlUsd);
      setPools(visible);
    } catch (err: any) {
      setLoadError(err?.shortMessage || err?.message || "Failed to load pools");
    }
    setLoading(false);
  }, [catalogByAddr, baseByAddr]);

  useEffect(() => { discover(); }, [discover]);

  const totals = useMemo(() => {
    const tvl = pools.reduce((s, p) => s + (isFinite(p.tvlUsd) ? p.tvlUsd : 0), 0);
    return { tvl, count: pools.length };
  }, [pools]);

  const filteredPools = useMemo(() => {
    if (!poolFilter) return pools;
    const q = poolFilter.toLowerCase();
    return pools.filter(p =>
      p.aSymbol.toLowerCase().includes(q) || p.bSymbol.toLowerCase().includes(q) ||
      p.aAddress.toLowerCase().includes(q) || p.pool.toLowerCase().includes(q)
    );
  }, [pools, poolFilter]);

  const selected = useMemo(() => pools.find(p => p.key === selectedKey) || null, [pools, selectedKey]);

  // Load wallet balances for the selected pool's two tokens.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!selected || !address) { setBalA(null); setBalB(null); return; }
      try {
        const [a, b] = await Promise.all([
          mantleClient.readContract({ address: selected.aAddress as `0x${string}`, abi: ERC20_BALANCE_ABI, functionName: "balanceOf", args: [address as `0x${string}`] }),
          mantleClient.readContract({ address: selected.bAddress as `0x${string}`, abi: ERC20_BALANCE_ABI, functionName: "balanceOf", args: [address as `0x${string}`] }),
        ]);
        if (!cancelled) {
          setBalA(Number(a as bigint) / 10 ** selected.aDecimals);
          setBalB(Number(b as bigint) / 10 ** selected.bDecimals);
        }
      } catch { if (!cancelled) { setBalA(null); setBalB(null); } }
    };
    run();
    return () => { cancelled = true; };
  }, [selected, address]);

  const openPool = (key: string) => {
    setSelectedKey(prev => (prev === key ? null : key));
    setAmountA(""); setAmountB(""); setDepositStatus(null); setTxHash(null);
  };

  // Keep the two amount inputs in sync using the live pool price.
  const onAmountA = (v: string) => {
    const clean = v.replace(/[^0-9.]/g, "");
    setAmountA(clean); setLastEdited("a");
    if (selected && selected.priceUsd > 0 && clean) {
      const other = parseFloat(clean) * selected.priceUsd;
      if (isFinite(other)) setAmountB(other > 0 ? other.toFixed(selected.bDecimals === 6 ? 2 : 6) : "");
    } else if (!clean) setAmountB("");
  };
  const onAmountB = (v: string) => {
    const clean = v.replace(/[^0-9.]/g, "");
    setAmountB(clean); setLastEdited("b");
    if (selected && selected.priceUsd > 0 && clean) {
      const other = parseFloat(clean) / selected.priceUsd;
      if (isFinite(other)) setAmountA(other > 0 ? other.toFixed(6) : "");
    } else if (!clean) setAmountA("");
  };

  const fullRangeTicks = (tickSpacing: number) => {
    const MIN_TICK = -887272, MAX_TICK = 887272;
    return {
      tickLower: Math.ceil(MIN_TICK / tickSpacing) * tickSpacing,
      tickUpper: Math.floor(MAX_TICK / tickSpacing) * tickSpacing,
    };
  };

  const ensureAllowance = async (token: string, owner: string, spender: string, needed: bigint) => {
    const current = await mantleClient.readContract({
      address: token as `0x${string}`, abi: ERC20_ALLOWANCE_ABI, functionName: "allowance",
      args: [owner as `0x${string}`, spender as `0x${string}`],
    }) as bigint;
    if (current >= needed) return;
    const hash = await walletClient.writeContract({
      address: token as `0x${string}`, abi: ERC20_APPROVE_ABI, functionName: "approve",
      args: [spender as `0x${string}`, MAX_UINT256],
    });
    await mantleClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  };

  const handleAddLiquidity = async () => {
    if (!selected || !walletClient || !isConnected || !address) return;
    if (!amountA || !amountB || parseFloat(amountA) <= 0 || parseFloat(amountB) <= 0) return;
    setDepositing(true); setDepositStatus(null); setTxHash(null);
    try {
      const SLIPPAGE_BPS = BigInt(100); // 1%
      const amountARaw = BigInt(Math.floor(parseFloat(amountA) * 10 ** selected.aDecimals));
      const amountBRaw = BigInt(Math.floor(parseFloat(amountB) * 10 ** selected.bDecimals));

      // The pool token for side A is the wrapped vault for xStocks, else the token itself.
      const poolTokenA = (selected.aWrapped || selected.aAddress) as `0x${string}`;
      let poolAmountARaw = amountARaw;

      // 1) Wrap xStock -> ERC-4626 vault shares.
      if (selected.aIsXStock && selected.aWrapped) {
        setDepositStatus(`Approving ${selected.aSymbol} for wrapping…`);
        await ensureAllowance(selected.aAddress, address, selected.aWrapped, amountARaw);
        const shares = await mantleClient.readContract({
          address: selected.aWrapped as `0x${string}`, abi: ERC4626_ABI, functionName: "previewDeposit", args: [amountARaw],
        }) as bigint;
        setDepositStatus(`Wrapping ${selected.aSymbol}…`);
        const wrapHash = await walletClient.writeContract({
          address: selected.aWrapped as `0x${string}`, abi: ERC4626_ABI, functionName: "deposit",
          args: [amountARaw, address as `0x${string}`],
        });
        await mantleClient.waitForTransactionReceipt({ hash: wrapHash, confirmations: 1 });
        poolAmountARaw = shares > BigInt(0) ? shares : amountARaw;
      }

      // 2) Approve both pool tokens for the Position Manager.
      setDepositStatus(`Approving ${selected.bSymbol}…`);
      await ensureAllowance(selected.bAddress, address, POSITION_MANAGER, amountBRaw);
      setDepositStatus(`Approving ${selected.aIsXStock ? "w" + selected.aSymbol : selected.aSymbol}…`);
      await ensureAllowance(poolTokenA, address, POSITION_MANAGER, poolAmountARaw);

      // 3) Build mint params (token0/token1 sorted, full-range).
      const aIsToken0 = poolTokenA.toLowerCase() === selected.token0.toLowerCase();
      const amount0Desired = aIsToken0 ? poolAmountARaw : amountBRaw;
      const amount1Desired = aIsToken0 ? amountBRaw : poolAmountARaw;
      const amount0Min = amount0Desired * (BigInt(10000) - SLIPPAGE_BPS) / BigInt(10000);
      const amount1Min = amount1Desired * (BigInt(10000) - SLIPPAGE_BPS) / BigInt(10000);
      const { tickLower, tickUpper } = fullRangeTicks(selected.tickSpacing);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);

      setDepositStatus("Minting liquidity position…");
      const hash = await walletClient.writeContract({
        address: POSITION_MANAGER as `0x${string}`, abi: POSITION_MANAGER_MINT_ABI, functionName: "mint",
        args: [{
          token0: selected.token0 as `0x${string}`, token1: selected.token1 as `0x${string}`, fee: selected.fee,
          tickLower, tickUpper, amount0Desired, amount1Desired, amount0Min, amount1Min,
          recipient: address as `0x${string}`, deadline,
        }],
      });
      setDepositStatus("Waiting for confirmation…");
      await mantleClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      setTxHash(hash);
      setDepositStatus("Liquidity added — position NFT minted to your wallet.");
      setAmountA(""); setAmountB("");
      discover();
    } catch (err: any) {
      setDepositStatus(`Error: ${err?.shortMessage || err?.message || "Transaction failed"}`);
    }
    setDepositing(false);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold mb-1">Liquidity Pools</h2>
          <p className="text-xs text-white/40">Provide liquidity on Fluxion V3 (Uniswap V3 fork on Mantle) — earn trading fees on tokenized stocks</p>
        </div>
        <a href={`${MANTLE_EXPLORER}/address/${POSITION_MANAGER}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[10px] text-white/30 hover:text-white/60 transition-colors">
          <span>PositionManager</span><span className="font-mono">{shortAddr(POSITION_MANAGER)}</span>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M6 3h7v7M13 3L6.5 9.5M11 9v4H3V5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total TVL", value: loading ? "…" : fmtUsd(totals.tvl) },
          { label: "Active Pools", value: loading ? "…" : `${totals.count}` },
          { label: "Protocol", value: "Fluxion V3" },
          { label: "Network", value: "Mantle" },
        ].map((s, i) => (
          <div key={i} className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <div className="text-[10px] text-white/40 tracking-wider">{s.label}</div>
            <div className="text-xl font-bold text-white/90 mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input type="text" value={poolFilter} onChange={e => setPoolFilter(e.target.value)} placeholder="Search by token symbol or address…"
          className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-white/80 placeholder:text-white/30 focus:outline-none focus:border-blue-500/30" />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-white/40 text-xs gap-3">
          <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
          Discovering live pools on Mantle…
        </div>
      )}

      {!loading && loadError && (
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-xs text-red-300">
          Could not load pools: {loadError}
          <button onClick={discover} className="ml-3 underline hover:text-red-200">Retry</button>
        </div>
      )}

      {!loading && !loadError && filteredPools.length === 0 && (
        <div className="p-8 text-center text-white/40 text-xs rounded-xl border border-white/5 bg-white/[0.01]">No pools match your search.</div>
      )}

      {/* Pool cards */}
      {!loading && !loadError && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filteredPools.map((pool) => {
            const open = selectedKey === pool.key;
            return (
              <div key={pool.key} className={`rounded-xl border bg-white/[0.01] transition-colors ${open ? "border-blue-500/30" : "border-white/5 hover:border-white/10"}`}>
                {/* Header */}
                <div className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex -space-x-2 shrink-0">
                        <TokenIcon token={{ symbol: pool.aSymbol, logo: pool.aLogo }} size={32} />
                        <TokenIcon token={{ symbol: pool.bSymbol, logo: pool.bLogo }} size={32} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white/90 truncate">{pool.aSymbol} / {pool.bSymbol}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/50">V3</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/50">{(pool.fee / 10000).toFixed(2)}% fee</span>
                          {pool.aIsXStock && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300/80">RWA / xStock</span>}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => openPool(pool.key)}
                      className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                        open ? "bg-white/5 text-white/50 border border-white/10" : "bg-blue-600/20 text-blue-300 border border-blue-500/20 hover:bg-blue-600/30"
                      }`}>
                      {open ? "Close" : "Add Liquidity"}
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div>
                      <div className="text-[9px] text-white/30 tracking-wider">TVL</div>
                      <div className="text-xs font-mono text-white/80 mt-0.5">{fmtUsd(pool.tvlUsd)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-white/30 tracking-wider">{pool.aSymbol} PRICE</div>
                      <div className="text-xs font-mono text-emerald-400/90 mt-0.5">{pool.quoteIsUsd || pool.priceUsd > 0 ? `$${fmtPrice(pool.priceUsd)}` : "—"}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-white/30 tracking-wider">RESERVES</div>
                      <div className="text-xs font-mono text-white/60 mt-0.5">{pool.reserveA >= 1 ? pool.reserveA.toFixed(1) : pool.reserveA.toPrecision(2)} {pool.aSymbol}</div>
                    </div>
                  </div>

                  {/* Addresses */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 pt-3 border-t border-white/5">
                    <a href={`${MANTLE_EXPLORER}/address/${pool.pool}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] text-white/40 hover:text-blue-300 transition-colors">
                      <span className="text-white/30">Pool</span><span className="font-mono">{shortAddr(pool.pool)}</span>
                      <svg width="9" height="9" viewBox="0 0 16 16" fill="none"><path d="M6 3h7v7M13 3L6.5 9.5M11 9v4H3V5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </a>
                    <CopyAddress address={pool.aAddress} label={pool.aSymbol} />
                    <CopyAddress address={pool.bAddress} label={pool.bSymbol} />
                  </div>
                </div>

                {/* Add-liquidity form */}
                {open && (
                  <div className="px-4 pb-4 pt-1 border-t border-white/5">
                    <div className="text-[11px] font-semibold text-white/70 mb-3">Add liquidity to {pool.aSymbol} / {pool.bSymbol}</div>
                    {pool.aIsXStock && (
                      <div className="mb-3 p-2 rounded-lg bg-blue-500/5 text-[10px] text-blue-200/70 leading-relaxed">
                        {pool.aSymbol} is auto-wrapped into its Fluxion vault token before the position is minted. Two tokens are deposited at the current price into a full-range V3 position.
                      </div>
                    )}
                    <div className="space-y-2.5">
                      {/* Token A input */}
                      <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5"><TokenIcon token={{ symbol: pool.aSymbol, logo: pool.aLogo }} size={18} /><span className="text-[11px] font-medium text-white/70">{pool.aSymbol}</span></div>
                          <button onClick={() => balA != null && onAmountA(String(balA))} className="text-[9px] text-white/30 hover:text-white/60">
                            Balance: {balA == null ? "—" : balA.toFixed(4)}{balA != null && balA > 0 ? " · Max" : ""}
                          </button>
                        </div>
                        <input type="text" inputMode="decimal" placeholder="0.0" value={amountA} onChange={e => onAmountA(e.target.value)}
                          className="w-full bg-transparent text-lg text-white/90 placeholder:text-white/20 focus:outline-none" />
                      </div>
                      {/* Token B input */}
                      <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5"><TokenIcon token={{ symbol: pool.bSymbol, logo: pool.bLogo }} size={18} /><span className="text-[11px] font-medium text-white/70">{pool.bSymbol}</span></div>
                          <button onClick={() => balB != null && onAmountB(String(balB))} className="text-[9px] text-white/30 hover:text-white/60">
                            Balance: {balB == null ? "—" : balB.toFixed(4)}{balB != null && balB > 0 ? " · Max" : ""}
                          </button>
                        </div>
                        <input type="text" inputMode="decimal" placeholder="0.0" value={amountB} onChange={e => onAmountB(e.target.value)}
                          className="w-full bg-transparent text-lg text-white/90 placeholder:text-white/20 focus:outline-none" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-white/30 mt-2.5">
                      <span>Range: Full · Fee {(pool.fee / 10000).toFixed(2)}% · Slippage 1%</span>
                      <span>1 {pool.aSymbol} ≈ ${fmtPrice(pool.priceUsd)}</span>
                    </div>

                    <button onClick={handleAddLiquidity}
                      disabled={!isConnected || depositing || !amountA || !amountB || parseFloat(amountA || "0") <= 0}
                      className={`w-full mt-3 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                        isConnected && amountA && amountB && !depositing && parseFloat(amountA || "0") > 0
                          ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-lg hover:shadow-blue-500/20"
                          : "bg-white/5 text-white/30 border border-white/10 cursor-not-allowed"
                      }`}>
                      {depositing ? "Processing…" : !isConnected ? "Connect Wallet" : "Add Liquidity"}
                    </button>

                    {depositStatus && (
                      <div className={`mt-2 p-2 rounded-lg text-[10px] ${depositStatus.startsWith("Error") ? "bg-red-500/10 text-red-400" : "bg-blue-500/10 text-blue-300"}`}>
                        {depositStatus}
                        {txHash && (
                          <a href={`${MANTLE_EXPLORER}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="ml-1 underline hover:text-blue-200">View tx</a>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 p-4 rounded-xl border border-white/5 bg-white/[0.01]">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2a6 6 0 100 12A6 6 0 008 2z" stroke="#a855f6" strokeWidth="1.5"/><path d="M8 5v3l2 2" stroke="#a855f6" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-white/70 mb-1">About RWA Pools</h4>
            <p className="text-[10px] text-white/40 leading-relaxed">Pools and prices are read live from the Fluxion V3 factory on Mantle. Providing liquidity deposits a token pair (tokenized stock + USDC) into a concentrated-liquidity position represented by an NFT held in your wallet, earning a share of swap fees. xStocks are wrapped into their Fluxion vault token automatically before minting. All transactions execute directly through your connected wallet.</p>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ========== RWA STRATEGY TAB ========== */
// --- RWA / AI Yield Optimizer ABIs ---
const ORACLE_GET_PRICE_ABI = [{ inputs: [], name: "getPrice", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" }] as const;
const YIELD_DECISION_TUPLE = { name: "", type: "tuple", components: [{ name: "usdyPct", type: "uint8" }, { name: "stocksPct", type: "uint8" }, { name: "reason", type: "string" }, { name: "usdyYieldBps", type: "uint256" }, { name: "timestamp", type: "uint256" }] } as const;
const RWA_CONTRACT_ABI = [
  { inputs: [], name: "getYieldDecisionCount", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "limit", type: "uint256" }], name: "getRecentYieldDecisions", outputs: [{ ...YIELD_DECISION_TUPLE, type: "tuple[]" }], stateMutability: "view", type: "function" },
] as const;

type YieldDecisionRow = { usdyPct: number; stocksPct: number; reason: string; usdyYieldBps: bigint; timestamp: bigint };
type RwaDecision = { usdy_pct: number; stocks_pct: number; reason: string; usdy_yield_pct: number; sentiment_score: number; tx_hash: string | null };

export function RwaStrategyTab() {
  // Use the shared module-level Mantle client (read-only, independent of the
  // connected wallet's active chain — usePublicClient() defaults to ETH mainnet).
  const publicClient = mantleClient;
  const [usdyYield, setUsdyYield] = useState<number | null>(null);
  const [yieldLoading, setYieldLoading] = useState(true);
  const [history, setHistory] = useState<YieldDecisionRow[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RwaDecision | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadYield = async (pc: any) => {
    if (!pc) return;
    setYieldLoading(true);
    try {
      const price = await pc.readContract({ address: USDY_ORACLE as `0x${string}`, abi: ORACLE_GET_PRICE_ABI, functionName: "getPrice" }) as bigint;
      setUsdyYield((Number(price) / 1e18 - 1.0) * 100);
    } catch (e) {
      console.error("USDY oracle read failed:", e);
      setUsdyYield(null);
    } finally {
      setYieldLoading(false);
    }
  };

  const loadHistory = async (pc: any) => {
    if (!pc) return;
    try {
      const rows = await pc.readContract({ address: CONTRACT as `0x${string}`, abi: RWA_CONTRACT_ABI, functionName: "getRecentYieldDecisions", args: [BigInt(10)] }) as readonly YieldDecisionRow[];
      setHistory(rows.map((r) => ({ usdyPct: Number(r.usdyPct), stocksPct: Number(r.stocksPct), reason: r.reason, usdyYieldBps: r.usdyYieldBps, timestamp: r.timestamp })));
    } catch (e) {
      // Old contract without yield functions, or empty history — non-fatal.
      console.warn("Yield history unavailable:", e);
      setHistory([]);
    }
  };

  // Depend on a stable boolean: usePublicClient returns a fresh client object
  // every render, so depending on its identity would loop infinitely.
  const clientReady = Boolean(publicClient);
  useEffect(() => {
    if (!publicClient) return;
    loadYield(publicClient);
    loadHistory(publicClient);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientReady]);

  const runAgent = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/strategy/rwa_balanced`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Backend HTTP ${res.status}`);
      const data = (await res.json()) as RwaDecision;
      setResult(data);
      loadHistory(publicClient);
    } catch (e: any) {
      setError(e?.message || "Failed to reach the AI agent backend");
    } finally {
      setRunning(false);
    }
  };

  const latest = result
    ? { usdyPct: result.usdy_pct, stocksPct: result.stocks_pct }
    : history.length > 0
    ? { usdyPct: history[0].usdyPct, stocksPct: history[0].stocksPct }
    : null;
  const sentiment = result?.sentiment_score ?? null;
  const pieData = latest ? [{ name: "USDY", value: latest.usdyPct }, { name: "xStocks", value: latest.stocksPct }] : [];

  return (
    <div className="max-w-5xl mx-auto px-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold mb-1">AI Yield Optimizer</h2>
        <p className="text-xs text-white/40">Dynamic allocation between USDY (tokenized US Treasuries) and xStocks, driven by on-chain yield + market sentiment</p>
      </div>

      {/* Block 1 — Current Status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {/* USDY yield card */}
        <div className="p-4 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04]">
          <div className="text-[10px] uppercase tracking-wide text-emerald-400/70 mb-1">USDY Yield</div>
          <div className="text-2xl font-bold text-emerald-400">
            {yieldLoading ? <span className="text-white/30 text-base">Loading…</span> : usdyYield !== null ? `${usdyYield.toFixed(2)}%` : <span className="text-white/40 text-base">Unavailable</span>}
          </div>
          <a href={`https://mantlescan.xyz/address/${USDY_ORACLE}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[9px] font-mono text-emerald-400/60 hover:text-emerald-400 break-all">Oracle: {USDY_ORACLE.slice(0, 10)}…</a>
        </div>
        {/* Allocation card */}
        <div className="p-4 rounded-xl border border-blue-500/15 bg-blue-500/[0.04]">
          <div className="text-[10px] uppercase tracking-wide text-blue-400/70 mb-1">Current Allocation</div>
          {latest ? (
            <>
              <div className="text-2xl font-bold text-white/90">{latest.usdyPct}<span className="text-sm text-white/40"> / </span>{latest.stocksPct}<span className="text-sm text-white/40">%</span></div>
              <div className="text-[9px] text-white/40 mt-1">USDY / xStocks</div>
            </>
          ) : (
            <div className="text-base text-white/40 pt-1">No decision yet</div>
          )}
        </div>
        {/* Sentiment card */}
        <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02]">
          <div className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Market Sentiment</div>
          {sentiment !== null ? (
            <div className={`text-2xl font-bold ${sentiment > 0 ? "text-emerald-400" : sentiment < 0 ? "text-red-400" : "text-white/70"}`}>{sentiment > 0 ? "+" : ""}{sentiment.toFixed(2)}</div>
          ) : (
            <div className="text-base text-white/40 pt-1">Run agent →</div>
          )}
          <div className="text-[9px] text-white/40 mt-1">ELFA score (-1 … +1)</div>
        </div>
      </div>

      {/* Allocation chart */}
      {latest && (
        <div className="mb-5 p-4 rounded-xl border border-white/5 bg-white/[0.015] flex items-center gap-4">
          <div className="w-24 h-24 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" innerRadius={26} outerRadius={44} paddingAngle={2} stroke="none">
                  <Cell fill="#10b981" />
                  <Cell fill="#3b82f6" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2 text-xs"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /><span className="text-white/70">USDY (stable yield)</span><span className="ml-auto font-bold text-white/90">{latest.usdyPct}%</span></div>
            <div className="flex items-center gap-2 text-xs"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /><span className="text-white/70">xStocks (growth)</span><span className="ml-auto font-bold text-white/90">{latest.stocksPct}%</span></div>
          </div>
        </div>
      )}

      {/* Block 2 — Run Agent */}
      <div className="mb-5 p-4 rounded-xl border border-white/5 bg-white/[0.015]">
        <button onClick={runAgent} disabled={running} className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold transition-all">
          {running ? "Agent is analyzing…" : "Analyze & Decide"}
        </button>
        {error && (
          <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-300">
            {error}. The AI backend must be running and reachable at <span className="font-mono">{BACKEND_URL}</span>.
          </div>
        )}
        {result && (
          <div className="mt-3 p-3 rounded-lg bg-white/[0.03] border border-white/5">
            <div className="text-xs text-white/80 leading-relaxed mb-2">{result.reason}</div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-white/50">
              <span>USDY yield: <span className="text-emerald-400 font-semibold">{result.usdy_yield_pct.toFixed(2)}%</span></span>
              <span>Split: <span className="text-white/80 font-semibold">{result.usdy_pct}% / {result.stocks_pct}%</span></span>
              {result.tx_hash ? (
                <a href={`https://mantlescan.xyz/tx/${result.tx_hash}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300">View on-chain tx ↗</a>
              ) : (
                <span className="text-amber-400/70">Not recorded on-chain (no signer)</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Block 3 — Decision History */}
      <div className="p-4 rounded-xl border border-white/5 bg-white/[0.015]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white/80">Decision History</h3>
          <a href={`https://mantlescan.xyz/address/${CONTRACT}`} target="_blank" rel="noreferrer" className="text-[9px] font-mono text-blue-400/70 hover:text-blue-400">{CONTRACT.slice(0, 10)}…</a>
        </div>
        {history.length === 0 ? (
          <div className="text-xs text-white/30 py-6 text-center">No on-chain decisions recorded yet. Run the agent to create the first one.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[520px]">
              <thead>
                <tr className="text-[9px] uppercase tracking-wide text-white/30 border-b border-white/5">
                  <th className="py-2 pr-3 font-medium">Time</th>
                  <th className="py-2 pr-3 font-medium">USDY</th>
                  <th className="py-2 pr-3 font-medium">xStocks</th>
                  <th className="py-2 pr-3 font-medium">Yield</th>
                  <th className="py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row, i) => (
                  <tr key={i} className="border-b border-white/[0.03] text-[11px]">
                    <td className="py-2 pr-3 text-white/50 whitespace-nowrap">{new Date(Number(row.timestamp) * 1000).toLocaleDateString()} {new Date(Number(row.timestamp) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="py-2 pr-3 text-emerald-400 font-semibold">{row.usdyPct}%</td>
                    <td className="py-2 pr-3 text-blue-400 font-semibold">{row.stocksPct}%</td>
                    <td className="py-2 pr-3 text-white/60">{(Number(row.usdyYieldBps) / 100).toFixed(2)}%</td>
                    <td className="py-2 text-white/60 max-w-[260px] truncate" title={row.reason}>{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-center gap-3 text-[10px] text-white/30">
        <span>USDY by Ondo Finance · on Mantle</span>
        <span>·</span>
        <a href="https://ondo.finance/usdy" target="_blank" rel="noreferrer" className="text-emerald-400/60 hover:text-emerald-400 transition-colors">About USDY</a>
      </div>
    </div>
  );
}

/* ========== BRIDGE TAB ========== */
export function BridgeTab({ walletClient, onConnectWallet }: { walletClient: any; onConnectWallet?: () => void }) {
  const [fromToken, setFromToken] = useState<any>(BRIDGE_DEFAULT_FROM);
  const [toToken, setToToken] = useState<any>(BRIDGE_DEFAULT_TO);

  const adaptedWallet = useMemo(() => {
    if (!walletClient) return undefined;
    try {
      return adaptViemWallet(walletClient);
    } catch { return undefined; }
  }, [walletClient]);

  return (
    <div className="w-full max-w-md mx-auto px-4 sm:px-0">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold mb-1">Bridge</h2>
        <p className="text-xs text-white/40">Cross-chain transfers powered by Relay</p>
      </div>

      {/* Relay SwapWidget - direct on-page bridge */}
      <div className="rounded-2xl overflow-hidden relay-widget-container" data-theme="dark">
        <RelaySwapWidget
          supportedWalletVMs={["evm"]}
          wallet={adaptedWallet}
          fromToken={fromToken}
          setFromToken={setFromToken}
          toToken={toToken}
          setToToken={setToToken}
          popularChainIds={[5000, 42161, 8453, 1, 10]}
          onConnectWallet={onConnectWallet}
          multiWalletSupportEnabled={false}
          onSwapError={(error: string) => {
            console.error("Bridge error:", error);
          }}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mt-5">
        <div className="text-center p-2 rounded-lg bg-white/[0.02] border border-white/5">
          <div className="text-sm font-bold text-white/90">&lt;5s</div>
          <div className="text-[9px] text-white/40">Speed</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-white/[0.02] border border-white/5">
          <div className="text-sm font-bold text-white/90">85+</div>
          <div className="text-[9px] text-white/40">Networks</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-white/[0.02] border border-white/5">
          <div className="text-sm font-bold text-white/90">$5B+</div>
          <div className="text-[9px] text-white/40">Volume</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-3 text-[10px] text-white/30">
        <span>Powered by Relay.link</span>
        <span>·</span>
        <a href="https://docs.relay.link/what-is-relay" target="_blank" rel="noreferrer" className="text-blue-400/60 hover:text-blue-400 transition-colors">Docs</a>
      </div>

      {/* xStocks CCIP Bridge */}
      <div className="mt-6 p-4 rounded-xl border border-white/5 bg-white/[0.015]">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 8h12M10 4l4 4-4 4" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div>
            <span className="text-xs font-semibold text-white/70">xStocks Bridge (CCIP)</span>
            <span className="text-[9px] text-white/30 ml-2">Chainlink Cross-Chain</span>
          </div>
        </div>
        <p className="text-[10px] text-white/40 leading-relaxed mb-3">Bridge xStock tokens between networks via Chainlink CCIP. {BRIDGE_PRODUCTS.size} bridgeable assets across {BRIDGE_DESTINATIONS.length} networks.</p>
        <div className="flex flex-wrap gap-1 mb-3">
          {BRIDGE_DESTINATIONS.map(net => (
            <span key={net} className={`text-[8px] font-medium px-1.5 py-0.5 rounded border ${NETWORK_COLORS[net] || "bg-white/5 text-white/40 border-white/10"}`}>
              {NETWORK_SHORT[net] || net}
            </span>
          ))}
        </div>
        <a href={XSTOCKS_BRIDGE_URL} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold hover:bg-emerald-600/30 transition-all">
          Open xStocks Bridge
          <svg width="8" height="8" viewBox="0 0 16 16" fill="none"><path d="M4 12L12 4M12 4H6M12 4v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </a>
      </div>
    </div>
  );
}


/* ========== DASHBOARD TAB ========== */
type PortfolioHolding = { symbol: string; amount: number; usd: number; layer: string; kind: string };
type PortfolioData = { holdings: PortfolioHolding[]; layers: Record<string, number>; total_usd: number; invested_usd: number; ok: boolean };

const LAYER_DOT: Record<string, string> = {
  cash: "bg-white/40", usdy: "bg-emerald-500", meth: "bg-amber-500", xstocks: "bg-blue-500",
};
// Asset-class label per layer (group by class, NOT by issuer — "xStocks" not "Backed").
const LAYER_CATEGORY: Record<string, string> = {
  cash: "Cash", usdy: "USDY", meth: "mETH", xstocks: "xStocks",
};
const LAYER_BADGE: Record<string, string> = {
  cash: "bg-white/5 text-white/40 border-white/10",
  usdy: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  meth: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  xstocks: "bg-blue-500/10 text-blue-300 border-blue-500/20",
};
// Logos + display names for the non-xStock core tokens (xStock logos/names come
// from the live Fluxion/backed.fi metadata via `allXStocks`, resolved by symbol).
const CORE_TOKEN_META: Record<string, { logo: string; name: string; issuer?: string }> = {
  USDC: { logo: "/tokens/usdc.png", name: "USD Coin", issuer: "Circle" },
  USDY: { logo: "/tokens/usdy.png", name: "US Dollar Yield", issuer: "Ondo Finance" },
  mETH: { logo: "/tokens/meth.png", name: "Mantle Staked ETH", issuer: "Mantle" },
  MNT: { logo: "/tokens/mnt.png", name: "Mantle" },
  WMNT: { logo: "/tokens/mnt.png", name: "Wrapped Mantle" },
};

export function DashboardTab({
  isConnected, address, balance, portfolioSelected, selectedStrategy, strategy,
  totalAllocation, selectedCount, toggleXStock, updateAllocation, applyAiStrategy,
  analyzePortfolio, aiAnalysis, aiAnalyzing, allXStocks, setActiveTab,
}: {
  isConnected: boolean; address: string | undefined; balance: { value: bigint; decimals: number; formatted: string; symbol: string } | undefined;
  portfolioSelected: Record<string, number>; selectedStrategy: string | null;
  strategy: typeof STRATEGIES[0]; totalAllocation: number; selectedCount: number;
  toggleXStock: (s: string) => void; updateAllocation: (s: string, v: number) => void;
  applyAiStrategy: () => void; analyzePortfolio: () => void;
  aiAnalysis: string | null; aiAnalyzing: boolean; allXStocks: XStockAsset[];
  setActiveTab: (t: TabId) => void;
}) {
  // Real on-chain portfolio — USDC + USDY + mETH + every live xStock, valued in USD.
  const [pf, setPf] = useState<PortfolioData | null>(null);
  const [pfLoading, setPfLoading] = useState(false);
  useEffect(() => {
    if (!isConnected || !address) { setPf(null); return; }
    let cancelled = false;
    setPfLoading(true);
    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/strategy/portfolio?wallet=${address}`);
        const data = await res.json();
        if (!cancelled && data?.ok) setPf(data);
      } catch { /* leave portfolio empty on failure */ }
      finally { if (!cancelled) setPfLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [isConnected, address]);

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 16 16" fill="none"><path d="M3 3h4v8H3zM9 3h4v4H9zM9 9h4v4H9z" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.3"/></svg>
        </div>
        <h2 className="text-lg font-bold mb-2">Connect Your Wallet</h2>
        <p className="text-xs text-white/40 mb-6 max-w-sm mx-auto">Connect your Mantle wallet to view your portfolio, manage positions, and track performance.</p>
        <ConnectButton.Custom>
          {({ openConnectModal, mounted }) => mounted && (
            <button onClick={openConnectModal} className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-sm hover:shadow-lg hover:shadow-blue-500/20 transition-all">
              Connect Wallet
            </button>
          )}
        </ConnectButton.Custom>
      </div>
    );
  }

  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";

  return (
    <div className="space-y-6">
      {/* Wallet info */}
      <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/[0.03] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-sm font-bold">
            {shortAddress.slice(0, 2)}
          </div>
          <div>
            <div className="text-sm font-semibold">{shortAddress}</div>
            <div className="text-[10px] text-white/40">Mantle Mainnet · {balance ? `${Number(formatEther(balance.value)).toFixed(4)} MNT` : "..."}</div>
          </div>
        </div>
        {selectedStrategy && (
          <div className="text-[10px] text-blue-400 bg-blue-500/10 px-2 py-1 rounded-full border border-blue-500/20">
            Strategy: {selectedStrategy}
          </div>
        )}
      </div>

      {/* Portfolio overview — real on-chain balances */}
      {(() => {
        const assetCount = pf?.holdings.length ?? 0;
        const totalUsd = pf?.total_usd ?? 0;
        return (
          <div className="grid lg:grid-cols-3 gap-4">
            {[
              { label: "Portfolio Value", value: pfLoading && !pf ? "…" : `$${totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, sub: `${assetCount} asset${assetCount === 1 ? "" : "s"} on-chain` },
              { label: "Selected Assets", value: `${selectedCount}`, sub: `${totalAllocation}% allocated` },
              { label: "Strategy", value: selectedStrategy || "None", sub: selectedStrategy ? `Risk ${strategy.risk}` : "Select from Market tab" },
            ].map((s, i) => (
              <div key={i} className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                <div className="text-[10px] text-white/40 tracking-wider">{s.label}</div>
                <div className="text-xl font-bold text-white/90 mt-1">{s.value}</div>
                <div className="text-[10px] text-white/30 mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Holdings — real wallet balances + % allocation across the 3 layers + cash */}
      <div className="p-5 rounded-xl border border-white/5 bg-white/[0.02]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-white/50 tracking-wider uppercase">Holdings</h3>
          <span className="text-[9px] text-white/30">{pfLoading ? "syncing…" : "on-chain · Mantle"}</span>
        </div>
        {pf && pf.holdings.length > 0 ? (
          <div className="divide-y divide-white/5">
            {[...pf.holdings].sort((a, b) => b.usd - a.usd).map((h) => {
              const pct = pf.total_usd > 0 ? (h.usd / pf.total_usd) * 100 : 0;
              const core = CORE_TOKEN_META[h.symbol];
              const x = h.layer === "xstocks" ? allXStocks.find((s) => s.symbol === h.symbol) : undefined;
              const logo = core?.logo || x?.logo || "";
              const name = core?.name || x?.name || "";
              // xStocks are grouped by asset class ("xStocks"); the issuer (Backed Finance) is a subtitle.
              const issuer = h.layer === "xstocks" ? "Backed Finance" : core?.issuer;
              const category = LAYER_CATEGORY[h.layer] || h.layer;
              return (
                <div key={`${h.symbol}-${h.layer}`} className="flex items-center justify-between py-2.5 text-[12px]">
                  <span className="flex items-center gap-2.5 min-w-0">
                    <TokenIcon token={{ symbol: h.symbol, logo }} size={26} />
                    <span className="flex flex-col min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="font-semibold text-white/80">{h.symbol}</span>
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full border ${LAYER_BADGE[h.layer] || "bg-white/5 text-white/40 border-white/10"}`}>{category}</span>
                      </span>
                      {(name || issuer) && (
                        <span className="text-[9px] text-white/30 truncate">{[name, issuer].filter(Boolean).join(" · ")}</span>
                      )}
                    </span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-white/40 text-[11px]">{h.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                    <span className="font-mono text-white/75">${h.usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="font-mono text-white/40 w-12 text-right">{pct.toFixed(1)}%</span>
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6 text-xs text-white/30">{pfLoading ? "Reading balances…" : "No assets in this wallet yet. Run a strategy cycle to buy the 3 layers."}</div>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <button onClick={applyAiStrategy} className="px-4 py-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/20 text-xs font-medium hover:bg-blue-600/30 transition-all">
          Use AI Strategy
        </button>
        <button onClick={() => setActiveTab("market")} className="px-4 py-2 rounded-lg bg-white/5 text-white/50 border border-white/5 text-xs font-medium hover:bg-white/10 transition-all">
          Browse Market
        </button>
        <button onClick={() => setActiveTab("bridge")} className="px-4 py-2 rounded-lg bg-white/5 text-white/50 border border-white/5 text-xs font-medium hover:bg-white/10 transition-all">
          Bridge Assets
        </button>
      </div>

      {/* Portfolio builder */}
      {selectedCount > 0 ? (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Allocation */}
          <div className="p-5 rounded-xl border border-white/5 bg-white/[0.02]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-white/50 tracking-wider uppercase">Portfolio Allocation</h3>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${totalAllocation === 100 ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                {totalAllocation}% / 100%
              </span>
            </div>
            <div className="flex items-center gap-5 mb-4">
              <div className="w-[120px] h-[120px] flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={Object.entries(portfolioSelected).map(([name, value]) => ({ name, value }))} cx="50%" cy="50%" innerRadius={35} outerRadius={52} paddingAngle={2} dataKey="value" animationDuration={500}>
                      {Object.keys(portfolioSelected).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1.5">
                {Object.entries(portfolioSelected).map(([sym, pct], i) => (
                  <div key={sym} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-[10px] text-white/70">{sym}</span>
                    </div>
                    <span className="text-[10px] font-mono text-white/50">{pct}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sliders */}
            <div className="space-y-3">
              {Object.entries(portfolioSelected).map(([sym, alloc]) => {
                const stock = allXStocks.find(s => s.symbol === sym);
                return (
                  <div key={sym} className="p-3 rounded-lg border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white/80">{sym}</span>
                        <span className="text-[9px] text-white/30">{stock?.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-blue-400">{alloc}%</span>
                        <button onClick={() => toggleXStock(sym)} className="w-5 h-5 rounded bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-all">
                          <svg width="8" height="8" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                        </button>
                      </div>
                    </div>
                    <input type="range" min={0} max={100} value={alloc} onChange={(e) => updateAllocation(sym, parseInt(e.target.value))}
                      className="w-full h-1 rounded-full appearance-none bg-white/10 accent-blue-500 cursor-pointer" />
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI Analysis */}
          <div className="p-5 rounded-xl border border-white/5 bg-white/[0.02]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-white/50 tracking-wider uppercase">AI Analysis</h3>
              <div className="flex items-center gap-1 text-[8px] text-white/30">
                <span className="text-cyan-400/50">Nansen</span>+<span className="text-amber-400/50">ELFA</span>+<span className="text-violet-400/50">AltLLM</span>
              </div>
            </div>

            {aiAnalysis ? (
              <div className="text-xs text-white/60 whitespace-pre-wrap leading-relaxed mb-4">{aiAnalysis}</div>
            ) : (
              <div className="text-center py-8">
                <p className="text-xs text-white/30 mb-2">Click below to get AI analysis of your portfolio</p>
              </div>
            )}

            <button onClick={analyzePortfolio} disabled={selectedCount === 0 || aiAnalyzing}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-600/20 to-violet-600/20 text-cyan-400 border border-cyan-500/20 font-semibold text-xs hover:from-cyan-600/30 hover:to-violet-600/30 disabled:opacity-30 transition-all flex items-center justify-center gap-2">
              {aiAnalyzing ? (
                <><span className="w-3 h-3 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /> Analyzing...</>
              ) : (
                <>{aiAnalysis ? "Re-analyze" : "Analyze"} with AI</>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 border border-dashed border-white/10 rounded-xl">
          <p className="text-xs text-white/30 mb-3">No assets in portfolio yet.</p>
          <button onClick={() => setActiveTab("market")} className="px-4 py-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/20 text-xs font-medium hover:bg-blue-600/30 transition-all">
            Browse xStocks Market
          </button>
        </div>
      )}

      {/* Open liquidity pools — hidden behind POOLS_ENABLED (Builder cleanup). */}
      {POOLS_ENABLED && (
        <div className="p-5 rounded-xl border border-white/5 bg-white/[0.02]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-white/50 tracking-wider uppercase">Liquidity Positions</h3>
            <button onClick={() => setActiveTab("pools")} className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors">View Pools</button>
          </div>
          <div className="text-center py-6">
            <p className="text-xs text-white/30">No open liquidity positions</p>
            <button onClick={() => setActiveTab("pools")} className="mt-2 text-[10px] text-blue-400 hover:text-blue-300 transition-colors">Explore RWA Pools</button>
          </div>
        </div>
      )}
    </div>
  );
}


/* ========== EDUCATION TAB ========== */
export function EducationTab({ nansenData, nansenLoading, elfaData, elfaLoading }: {
  nansenData: NansenToken[]; nansenLoading: boolean; elfaData: ElfaTrending[]; elfaLoading: boolean;
}) {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center py-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-medium text-white/50 mb-4 uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          AI × RWA · Mantle Turing Test 2026
        </div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-3">
          <span className="text-white/90">StockPilot </span>
          <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">AI</span>
        </h1>
        <p className="text-sm text-white/50 max-w-xl mx-auto leading-relaxed">
          Autonomous AI agent managing tokenized equity portfolios on Mantle Network. Choose a strategy, the AI handles everything — every trade transparent and on-chain.
        </p>
      </div>

      {/* How it works */}
      <div>
        <h2 className="text-base font-bold mb-4">How It Works</h2>
        <div className="grid md:grid-cols-4 gap-3">
          {[
            { step: "01", title: "Bridge", desc: "Transfer assets from any EVM chain to Mantle via Relay bridge. Fast, cheap, 85+ networks." },
            { step: "02", title: "Build Portfolio", desc: "Select xStocks (tokenized equities) and set allocation. Use AI strategy or customize your own." },
            { step: "03", title: "AI Analyzes", desc: "Nansen smart money data + ELFA sentiment + AltLLM analysis provide risk assessment and recommendations." },
            { step: "04", title: "Trade", desc: "Swap USDC for xStocks on Fluxion DEX. Provide liquidity in RWA pools to earn yield." },
          ].map((item, i) => (
            <div key={i} className="p-4 rounded-xl border border-white/5 bg-white/[0.015] hover:border-white/10 transition-all">
              <div className="text-[10px] font-mono text-white/20 mb-2">{item.step}</div>
              <h3 className="text-sm font-semibold mb-1">{item.title}</h3>
              <p className="text-[10px] text-white/40 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* What are xStocks */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="p-5 rounded-xl border border-blue-500/20 bg-blue-500/[0.02]">
          <div className="text-[9px] font-bold text-blue-400 tracking-[0.2em] mb-2">PRIMARY MARKET</div>
          <h3 className="text-base font-bold mb-2">xStocks</h3>
          <p className="text-xs text-white/50 leading-relaxed mb-3">
            Tokenized equities backed 1:1 by real stocks. When you buy SPYx, there&apos;s a real S&amp;P 500 ETF share held in custody. Proof of Reserves verifiable on-chain.
          </p>
          <div className="space-y-2 mb-3">
            {[
              ["Mint", "Deposit USDC, receive xStock token instantly"],
              ["Redeem", "Return xStock, get USDC at market price"],
              ["Dividends", "Auto-rebase reflects stock splits & dividends"],
            ].map(([title, desc]) => (
              <div key={title} className="flex items-center gap-2 text-[10px]">
                <span className="w-4 h-4 rounded bg-blue-500/10 text-blue-400 flex items-center justify-center text-[8px]">→</span>
                <span className="text-white/60"><span className="text-white/80 font-medium">{title}</span> — {desc}</span>
              </div>
            ))}
          </div>
          <a href="https://xstocks.fi" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-400 hover:text-blue-300 transition-colors">
            xstocks.fi <svg width="8" height="8" viewBox="0 0 16 16" fill="none"><path d="M4 12L12 4M12 4H6M12 4v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </a>
        </div>

        <div className="p-5 rounded-xl border border-purple-500/20 bg-purple-500/[0.02]">
          <div className="text-[9px] font-bold text-purple-400 tracking-[0.2em] mb-2">SECONDARY MARKET</div>
          <h3 className="text-base font-bold mb-2">Fluxion Network</h3>
          <p className="text-xs text-white/50 leading-relaxed mb-3">
            DEX on Mantle with V2/V3 AMM pools. StockPilot AI routes trades here when pool prices are better than xStocks RFQ — saving you on every swap.
          </p>
          <div className="space-y-2 mb-3">
            {[
              ["Smart Routing", "AI compares RFQ vs pool price in real-time"],
              ["Multi-Pool", "V2 and V3 pools with multiple fee tiers"],
              ["RWA Pools", "Earn yield by providing liquidity"],
            ].map(([title, desc]) => (
              <div key={title} className="flex items-center gap-2 text-[10px]">
                <span className="w-4 h-4 rounded bg-purple-500/10 text-purple-400 flex items-center justify-center text-[8px]">⚡</span>
                <span className="text-white/60"><span className="text-white/80 font-medium">{title}</span> — {desc}</span>
              </div>
            ))}
          </div>
          <a href="https://fluxion.network" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-400 hover:text-purple-300 transition-colors">
            fluxion.network <svg width="8" height="8" viewBox="0 0 16 16" fill="none"><path d="M4 12L12 4M12 4H6M12 4v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </a>
        </div>
      </div>

      {/* Intelligence Layer */}
      <div>
        <h2 className="text-base font-bold mb-4">Intelligence Layer</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {/* Nansen */}
          <div className="p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.02]">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-xs">N</div>
              <div>
                <h3 className="text-sm font-bold">Nansen</h3>
                <span className="text-[9px] text-cyan-400/80">On-Chain Analytics</span>
              </div>
            </div>
            <p className="text-[10px] text-white/40 leading-relaxed mb-3">Smart money tracking across 20+ chains. Real-time institutional fund movements.</p>
            <div className="space-y-1.5">
              {(nansenLoading ? [] : nansenData.slice(0, 3)).map((t, i) => (
                <div key={i} className="flex items-center justify-between p-1.5 rounded-lg bg-white/[0.02] border border-white/5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-white/70">{t.token_symbol}</span>
                    <span className="text-[8px] text-white/30">{t.chain}</span>
                  </div>
                  <span className={`text-[9px] font-mono ${t.netflow > 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {t.netflow > 0 ? "+" : ""}{(t.netflow / 1000).toFixed(0)}K
                  </span>
                </div>
              ))}
              {nansenLoading && <div className="flex items-center gap-2 py-2 justify-center"><span className="w-3 h-3 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /><span className="text-[9px] text-white/40">Loading...</span></div>}
            </div>
          </div>

          {/* ELFA */}
          <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.02]">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-xs">E</div>
              <div>
                <h3 className="text-sm font-bold">ELFA AI</h3>
                <span className="text-[9px] text-amber-400/80">Market Intelligence</span>
              </div>
            </div>
            <p className="text-[10px] text-white/40 leading-relaxed mb-3">Real-time sentiment analysis, trending tokens, and AI-powered market insights.</p>
            <div className="space-y-1.5">
              {(elfaLoading ? [] : elfaData.slice(0, 3)).map((t, i) => (
                <div key={i} className="flex items-center justify-between p-1.5 rounded-lg bg-white/[0.02] border border-white/5">
                  <span className="text-[10px] font-bold text-white/70 uppercase">{t.token}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-mono ${t.change_percent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {t.change_percent >= 0 ? "+" : ""}{t.change_percent.toFixed(1)}%
                    </span>
                    <span className="text-[8px] text-white/30">{t.current_count}</span>
                  </div>
                </div>
              ))}
              {elfaLoading && <div className="flex items-center gap-2 py-2 justify-center"><span className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /><span className="text-[9px] text-white/40">Loading...</span></div>}
            </div>
          </div>

          {/* AltLLM */}
          <div className="p-4 rounded-xl border border-violet-500/20 bg-violet-500/[0.02]">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs">A</div>
              <div>
                <h3 className="text-sm font-bold">AltLLM</h3>
                <span className="text-[9px] text-violet-400/80">AI Chat & Analysis</span>
              </div>
            </div>
            <p className="text-[10px] text-white/40 leading-relaxed mb-3">Frontier AI models powering chat assistant, portfolio analysis, and strategy recommendations.</p>
            <div className="space-y-1.5">
              {["Strategy Recommendations", "Portfolio Risk Analysis", "Market Q&A Chat"].map((cap, i) => (
                <div key={i} className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white/[0.02] border border-white/5">
                  <span className="w-4 h-4 rounded bg-violet-500/10 text-violet-400 flex items-center justify-center text-[8px]">{'\u2713'}</span>
                  <span className="text-[10px] text-white/60">{cap}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Partners */}
      <div>
        <h2 className="text-base font-bold mb-4">Partners & Integrations</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { name: "Mantle", desc: "L2 Network", color: "cyan" },
            { name: "xStocks", desc: "Tokenized Equities", color: "blue" },
            { name: "Fluxion", desc: "DEX & Pools", color: "purple" },
            { name: "Relay", desc: "Cross-chain Bridge", color: "blue" },
            { name: "Nansen", desc: "On-Chain Analytics", color: "cyan" },
            { name: "ELFA AI", desc: "Market Intelligence", color: "amber" },
            { name: "AltLLM", desc: "AI Inference", color: "violet" },
            { name: "RainbowKit", desc: "Wallet Connect", color: "blue" },
          ].map((p, i) => (
            <div key={i} className="p-3 rounded-xl border border-white/5 bg-white/[0.015] hover:border-white/10 transition-all text-center">
              <div className={`w-8 h-8 mx-auto mb-2 rounded-lg bg-${p.color}-500/10 flex items-center justify-center text-${p.color}-400 text-xs font-bold`}>
                {p.name[0]}
              </div>
              <div className="text-xs font-semibold text-white/80">{p.name}</div>
              <div className="text-[9px] text-white/30">{p.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Data pipeline */}
      <div className="p-4 rounded-xl border border-white/5 bg-white/[0.01]">
        <div className="text-[10px] text-white/30 tracking-wider text-center mb-3">DATA PIPELINE</div>
        <div className="flex items-center justify-center gap-2 flex-wrap text-xs">
          <span className="px-2 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[10px] font-medium">Nansen</span>
          <span className="text-white/20">+</span>
          <span className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-medium">ELFA</span>
          <span className="text-white/20">{"\u2192"}</span>
          <span className="px-2 py-1 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 text-[10px] font-medium">AltLLM</span>
          <span className="text-white/20">{"\u2192"}</span>
          <span className="px-2 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-medium">StockPilot AI</span>
          <span className="text-white/20">{"\u2192"}</span>
          <span className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-medium">Trade</span>
        </div>
      </div>

      {/* Contract */}
      <div className="p-4 rounded-xl border border-white/5 bg-white/[0.01] text-center">
        <div className="text-[10px] text-white/30 mb-2">Verified Smart Contract</div>
        <a href={`https://mantlescan.xyz/address/${CONTRACT}`} target="_blank" rel="noreferrer" className="text-xs font-mono text-blue-400 hover:text-blue-300 transition-colors break-all">
          {CONTRACT}
        </a>
        <div className="text-[9px] text-white/20 mt-1">Mantle Mainnet · ChainID 5000</div>
      </div>
    </div>
  );
}

/* ========== STOCKY AGENT (AUTOPILOT) TAB ========== */
// On-chain Decision struct: { uint256 ts; uint8 regime; uint16 wStocks; uint16 wUSDY; uint16 wMETH; string reason }
const AGENT_DECISION_TUPLE = {
  name: "", type: "tuple", components: [
    { name: "ts", type: "uint256" },
    { name: "regime", type: "uint8" },
    { name: "wStocks", type: "uint16" },
    { name: "wUSDY", type: "uint16" },
    { name: "wMETH", type: "uint16" },
    { name: "reason", type: "string" },
  ],
} as const;
const AUTOPILOT_ABI = [
  { inputs: [], name: "getDecisionCount", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "limit", type: "uint256" }], name: "getRecentDecisions", outputs: [{ ...AGENT_DECISION_TUPLE, type: "tuple[]" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "getTargetWeights", outputs: [{ name: "", type: "uint16" }, { name: "", type: "uint16" }, { name: "", type: "uint16" }], stateMutability: "view", type: "function" },
] as const;

const XSTOCK_CHOICES = ["AAPLx", "NVDAx", "SPYx", "TSLAx", "MSFTx", "GOOGLx", "AMZNx", "METAx"];
const RISK_PROFILE_CHOICES = ["conservative", "balanced", "aggressive"];

type AgentDecisionRow = { ts: bigint; regime: number; wStocks: number; wUSDY: number; wMETH: number; reason: string };
type AutopilotStatus = {
  enabled: boolean;
  risk_profile: string;
  symbols: string[];
  interval_sec: number;
  notional_usd: number;
  last_run_ts: number | null;
  next_run_ts: number | null;
  live_swaps: boolean;
  contract: string;
  agent_funded: boolean;
  last_decision: any | null;
  decision_count: number;
};

// Canonical 3-layer target weights per regime (basis points): xStocks / USDY / mETH.
// Mirrors the autonomous agent's policy and the on-chain guardrails.
const REGIME_TARGETS: Record<number, [number, number, number]> = {
  2: [5500, 2000, 2500], // risk-on
  1: [4000, 4000, 2000], // neutral
  0: [2000, 6500, 1500], // risk-off
};
const GUARDRAIL_MAX_ASSET_BPS = 7500;     // no single layer above 75%
const GUARDRAIL_MIN_USDY_RISKOFF_BPS = 5000; // risk-off keeps USDY >= 50%

type CyclePreview = {
  regime: number;
  weights: [number, number, number];
  notional: number;
  legs: { layer: string; pct: number; usd: number }[];
  guardrailsOk: boolean;
};

function buildCyclePreview(regime: number, notional: number): CyclePreview {
  const weights = REGIME_TARGETS[regime] ?? REGIME_TARGETS[1];
  const layers = ["xStocks", "USDY", "mETH"];
  const legs = weights.map((bps, i) => ({ layer: layers[i], pct: bps / 100, usd: (notional * bps) / 10000 }));
  const sum = weights[0] + weights[1] + weights[2];
  const withinMax = weights.every((w) => w <= GUARDRAIL_MAX_ASSET_BPS);
  const riskOffOk = regime !== 0 || weights[1] >= GUARDRAIL_MIN_USDY_RISKOFF_BPS;
  return { regime, weights, notional, legs, guardrailsOk: sum === 10000 && withinMax && riskOffOk };
}

type StrategyLeg = {
  symbol: string;
  layer: string;
  token_out: string;
  unwrap: boolean;
  fee: number;
  amount_usdc: string;
  min_out: string;
  est_usd: number;
  price_impact_bps?: number;
  slippage_bps?: number;
  tradable?: boolean;
  note?: string;
};
type RelayStep = { id: string; to: string; data: string; value: string; chainId: number };
type UsdyFees = { relay_usd?: number; app_usd?: number; swap_usd?: number; execution_usd?: number; gas_usd?: number };
type UsdyRouteSummary = { ok: boolean; exec_usdc: number; quote_usdy: number; price_impact_bps: number; note?: string };
type UsdyLeg = {
  symbol: string;
  layer: string;
  route_kind?: "relay" | "agni";
  router: string;
  token_in: string;
  token_out: string;
  path?: string;
  multihop?: boolean;
  route?: string;
  route_label?: string;
  amount_usdc: string;
  min_out: string;
  est_usd: number;
  quote_usdy: number;
  price_impact_bps: number;
  slippage_bps?: number;
  max_impact_bps?: number;
  capped: boolean;
  // Relay execution payload (present when route_kind === "relay")
  steps?: RelayStep[];
  request_id?: string;
  check_endpoint?: string;
  fees?: UsdyFees;
  routes?: { relay?: UsdyRouteSummary; agni?: UsdyRouteSummary };
  chosen_reason?: string;
  note: string;
};
// Shape returned by /api/strategy/usdy_quote (routing.best_usdy_buy) — fetched
// fresh right before signing. Uses backend key names (exec_usdc/amount_in_wei).
type UsdyQuoteResp = {
  ok: boolean;
  route_kind?: "relay" | "agni";
  route_label?: string;
  exec_usdc: number;
  amount_in_wei: string;
  min_out: string;
  quote_usdy: number;
  price_impact_bps: number;
  slippage_bps?: number;
  path?: string;
  steps?: RelayStep[];
  request_id?: string;
  check_endpoint?: string;
  fees?: UsdyFees;
};
type StrategyPlan = {
  regime: number;
  regime_label: string;
  risk_profile: string;
  symbols: string[];
  weights_percent: { xstocks: number; usdy: number; meth: number };
  weights_bps: { xstocks: number; usdy: number; meth: number };
  signals: { sentiment: number; smart_money: number; volatility: number; usdy_yield_pct: number; sources: Record<string, string> };
  reason: string;
  invest_usdc: number;
  executor: string;
  usdc: string;
  legs: StrategyLeg[];
  usdy_leg: UsdyLeg | null;
  usdy_quote: (UsdyLeg & { ok: boolean }) | null;
  usdy_usdc_held: number;
  current_usd: { xstocks: number; meth: number };
  total_target_usd: number;
  deadline: number;
};

type DcaCycle = { idx: number; ts: number; regime: number; regime_label: string; weights_bps: number[]; slice_usdc: number; reason: string; tx_hash: string | null };
type DcaStatus = {
  active: boolean;
  amount_usdc: number;
  per_cycle_usdc: number;
  risk_profile: string;
  interval_sec: number;
  duration_sec: number;
  cycles_total: number;
  cycles_done: number;
  spent_usdc: number;
  remaining_usdc: number;
  next_run_ts: number | null;
  end_ts: number | null;
  live_swaps: boolean;
  agent_wallet: string | null;
  cycles: DcaCycle[];
};

function regimeMeta(regime: number): { label: string; text: string; bg: string; ring: string; dot: string } {
  switch (regime) {
    case 2: return { label: "Risk-on", text: "text-emerald-300", bg: "bg-emerald-500/10", ring: "border-emerald-500/30", dot: "#10b981" };
    case 0: return { label: "Risk-off", text: "text-red-300", bg: "bg-red-500/10", ring: "border-red-500/30", dot: "#ef4444" };
    default: return { label: "Neutral", text: "text-amber-300", bg: "bg-amber-500/10", ring: "border-amber-500/30", dot: "#f59e0b" };
  }
}

export function AutopilotTabContent() {
  const pc = mantleClient; // read-only Mantle client (independent of connected wallet chain)
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  // USDC funding (Task 2): connected wallet balance + chosen amount for the cycle.
  const [usdcBalRaw, setUsdcBalRaw] = useState<bigint | null>(null);
  const [amountInput, setAmountInput] = useState<string>("");
  const [decisions, setDecisions] = useState<AgentDecisionRow[]>([]);
  const [target, setTarget] = useState<[number, number, number] | null>(null);
  const [status, setStatus] = useState<AutopilotStatus | null>(null);
  const [backendOk, setBackendOk] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selSymbols, setSelSymbols] = useState<string[]>(["AAPLx", "NVDAx", "SPYx"]);
  const [riskProfile, setRiskProfile] = useState<string>("balanced");
  // Tradable xStock universe, synced live with Fluxion pools (falls back to a
  // static list if the agent is unreachable).
  const [tradable, setTradable] = useState<string[]>(XSTOCK_CHOICES);
  // Token logos (Task 3): xStock logos from the shared metadata, core tokens local —
  // same source the SWAP tab & portfolio use, so icons are consistent everywhere.
  const [xLogos, setXLogos] = useState<Record<string, string>>({});
  const legLogo = (sym: string) => CORE_TOKEN_META[sym]?.logo || xLogos[sym] || "";
  const [now, setNow] = useState<number>(Math.floor(Date.now() / 1000));
  const [preview, setPreview] = useState<CyclePreview | null>(null);
  // Manual cycle (Task 3): analyse -> preview plan -> user signs ONE tx from own wallet.
  const [plan, setPlan] = useState<StrategyPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [execStep, setExecStep] = useState<string>("");
  // Autopilot DCA (Task 5): time-sliced accumulation. Amount is reused from the box above.
  const [dca, setDca] = useState<DcaStatus | null>(null);
  const [dcaDuration, setDcaDuration] = useState<number>(24 * 3600);
  const [dcaInterval, setDcaInterval] = useState<number>(6 * 3600);
  const [dcaBusy, setDcaBusy] = useState(false);
  const dcaActive = Boolean(dca?.active);

  // Tick for the live countdown.
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const loadOnChain = async () => {
    try {
      const rows = await pc.readContract({ address: CONTRACT as `0x${string}`, abi: AUTOPILOT_ABI, functionName: "getRecentDecisions", args: [BigInt(20)] }) as readonly AgentDecisionRow[];
      setDecisions(rows.map((r) => ({ ts: r.ts, regime: Number(r.regime), wStocks: Number(r.wStocks), wUSDY: Number(r.wUSDY), wMETH: Number(r.wMETH), reason: r.reason })));
      const tw = await pc.readContract({ address: CONTRACT as `0x${string}`, abi: AUTOPILOT_ABI, functionName: "getTargetWeights" }) as readonly [number, number, number];
      setTarget([Number(tw[0]), Number(tw[1]), Number(tw[2])]);
    } catch (e) {
      console.warn("Autopilot on-chain read failed:", e);
    }
  };

  const loadStatus = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/autopilot/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AutopilotStatus;
      setStatus(data);
      setBackendOk(true);
      if (data.symbols?.length) setSelSymbols(data.symbols);
      if (data.risk_profile) setRiskProfile(data.risk_profile);
    } catch {
      setBackendOk(false);
    }
  };

  const loadTradable = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/strategy/tokens`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const syms = (data.tokens || []).map((t: { symbol: string }) => t.symbol);
      if (syms.length) setTradable(syms);
    } catch {
      /* keep static fallback */
    }
  };

  useEffect(() => {
    fetch("/xstocks-data.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: { symbol: string; logo?: string }[]) => {
        const m: Record<string, string> = {};
        for (const a of d) if (a.symbol && a.logo) m[a.symbol] = a.logo;
        setXLogos(m);
      })
      .catch(() => {});
  }, []);

  const loadUsdcBalance = async () => {
    if (!address) { setUsdcBalRaw(null); return; }
    try {
      const bal = await pc.readContract({
        address: USDC_MANTLE as `0x${string}`, abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf", args: [address as `0x${string}`],
      }) as bigint;
      setUsdcBalRaw(bal);
    } catch {
      setUsdcBalRaw(null);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadOnChain(), loadStatus(), loadTradable(), loadDca()]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll DCA progress (and refresh the on-chain feed) while a plan is running.
  useEffect(() => {
    if (!dcaActive) return;
    const t = setInterval(() => { loadDca(); loadOnChain(); }, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dcaActive]);

  useEffect(() => { loadUsdcBalance(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [address]);

  const usdcBal = usdcBalRaw === null ? null : Number(usdcBalRaw) / 1e6;
  const amountNum = parseFloat(amountInput) || 0;
  const amountTooHigh = usdcBal !== null && amountNum > usdcBal + 1e-9;
  const amountValid = amountNum > 0 && !amountTooHigh;
  const setPct = (p: number) => {
    if (usdcBal === null) return;
    const v = Math.floor(usdcBal * p * 1e6) / 1e6;
    setAmountInput(v > 0 ? String(v) : "");
  };

  const toggleSymbol = (sym: string) => {
    setSelSymbols((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym],
    );
  };

  const saveConfig = async () => {
    setError(null); setNotice(null);
    if (selSymbols.length < 1) { setError("Pick at least 1 xStock for the growth layer."); return; }
    try {
      const res = await fetch(`${BACKEND_URL}/api/autopilot/config`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: selSymbols, risk_profile: riskProfile }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(await res.json()); setBackendOk(true);
      setNotice("Strategy saved.");
    } catch (e: any) {
      setError("Backend unreachable — config needs the AI agent running at " + BACKEND_URL);
    }
  };

  const runNow = async () => {
    setRunning(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/autopilot/run`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setBackendOk(true);
      setPreview(null);
      setNotice(d?.tx_hash ? "Cycle complete — decision recorded on-chain." : "Cycle complete (on-chain record skipped — no signer).");
      await Promise.all([loadOnChain(), loadStatus()]);
    } catch {
      // No live agent backend in this deployment — compute a transparent local
      // preview of the cycle from the latest on-chain regime so the flow is
      // still demonstrable. The actual multi-signal classification and the
      // on-chain recordDecision are performed by the autonomous agent wallet
      // (its real history is shown below).
      const regime = decisions[0]?.regime ?? 1;
      setPreview(buildCyclePreview(regime, 1000));
      setBackendOk(false);
      setNotice("Computed a cycle preview from the latest on-chain regime. Live multi-signal cycles and on-chain recordDecision run in the autonomous agent — its real decisions are listed below.");
    } finally {
      setRunning(false);
    }
  };

  // Manual cycle (Task 3): the agent analyses the market for the entered amount and
  // returns a target-weight plan; the user reviews it, then signs ONE tx that buys all
  // three layers from their own USDC (rebalancing the portfolio toward the targets).
  const runManual = async () => {
    if (selSymbols.length < 1) { setError("Pick at least 1 xStock in Strategy configuration first."); return; }
    setPlanning(true); setError(null); setNotice(null); setPlan(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/strategy/plan`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_usdc: amountNum,
          wallet_address: address ?? null,
          risk_profile: riskProfile,
          symbols: selSymbols,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as StrategyPlan;
      setBackendOk(true);
      if (!data.legs?.length && !data.usdy_leg && data.usdy_usdc_held <= 0) {
        setError("Nothing to buy — the portfolio already matches the target weights for this amount.");
        return;
      }
      setPlan(data);
    } catch {
      setError("Backend unreachable — analysis needs the AI agent at " + BACKEND_URL);
    } finally {
      setPlanning(false);
    }
  };

  // Poll Relay intent fulfilment (success/failure/refund). The same-chain swap
  // tx already delivers the USDY, so a timeout is non-fatal — the on-chain
  // receipt is the source of truth — but we wait to surface a clean status.
  const pollRelayStatus = async (requestId: string) => {
    for (let i = 0; i < 20; i++) {
      try {
        const r = await fetch(`${BACKEND_URL}/api/strategy/relay_status?request_id=${requestId}`);
        if (r.ok) {
          const s = (await r.json())?.status as string | undefined;
          if (s === "success") return "success";
          if (s === "failure" || s === "refund") return s;
        }
      } catch { /* keep polling */ }
      await new Promise((res) => setTimeout(res, 3000));
    }
    return "timeout";
  };

  const executePlan = async () => {
    if (!plan || !walletClient || !address) return;
    setExecuting(true); setError(null); setNotice(null);
    const deadline = BigInt(plan.deadline);
    const done: string[] = [];      // executed legs (for the summary)
    const skipped: string[] = [];   // limited / failed legs — never abort the rest
    let repHash: `0x${string}` | null = null;   // a representative tx for the on-chain record

    // Ensure the user's USDC allowance for ``spender`` covers ``needed`` (one approval).
    const ensureAllowance = async (spender: string, needed: bigint) => {
      const allowance = await pc.readContract({
        address: USDC_MANTLE as `0x${string}`, abi: ERC20_ALLOWANCE_ABI,
        functionName: "allowance", args: [address as `0x${string}`, spender as `0x${string}`],
      }) as bigint;
      if (allowance < needed) {
        const aH = await walletClient.writeContract({
          address: USDC_MANTLE as `0x${string}`, abi: ERC20_APPROVE_ABI,
          functionName: "approve", args: [spender as `0x${string}`, MAX_UINT256],
          chain: mantleChain, account: address as `0x${string}`,
        });
        await pc.waitForTransactionReceipt({ hash: aH, confirmations: 1 });
      }
    };
    const isReject = (e: any) => {
      const m = (e?.shortMessage || e?.message || "").toString();
      return m.includes("User rejected") || m.includes("denied");
    };

    try {
      const tradable = (l: StrategyLeg) => l.tradable !== false && BigInt(l.amount_usdc) > BigInt(0);
      const xLegs = plan.legs.filter((l) => l.layer === "xstocks" && tradable(l));
      const methLegs = plan.legs.filter((l) => l.layer === "meth" && tradable(l));
      // Legs the agent couldn't quote (no pool / impact over cap) — surfaced, kept as USDC.
      plan.legs.filter((l) => l.tradable === false)
        .forEach((l) => skipped.push(`${l.symbol}${l.note ? ` (${l.note})` : ""}`));

      // --- xStocks legs via Fluxion XStockSwapHelper.swapAndUnwrap (USDC -> wrapped -> xStock) ---
      if (xLegs.length) {
        const sum = xLegs.reduce((a, l) => a + BigInt(l.amount_usdc), BigInt(0));
        setExecStep("Approve USDC for Fluxion (xStocks)…");
        await ensureAllowance(XSTOCK_SWAP_HELPER, sum);
        for (const l of xLegs) {
          try {
            setExecStep(`Awaiting signature — buying ${l.symbol} on Fluxion…`);
            const tx = await walletClient.writeContract({
              address: XSTOCK_SWAP_HELPER as `0x${string}`, abi: SWAP_HELPER_SWAP_AND_UNWRAP_ABI,
              functionName: "swapAndUnwrap",
              args: [USDC_MANTLE as `0x${string}`, l.token_out as `0x${string}`, BigInt(l.amount_usdc), l.fee, BigInt(l.min_out), deadline],
              chain: mantleChain, account: address as `0x${string}`,
            });
            await pc.waitForTransactionReceipt({ hash: tx, confirmations: 1 });
            done.push(l.symbol); repHash = repHash ?? tx;
          } catch (e: any) {
            if (isReject(e)) throw e;
            skipped.push(`${l.symbol} (swap failed)`);
          }
        }
      }

      // --- mETH leg via Fluxion SwapRouter.exactInputSingle (USDC -> mETH) ---
      for (const l of methLegs) {
        try {
          setExecStep("Approve USDC for Fluxion (mETH)…");
          await ensureAllowance(FLUXION_ROUTER, BigInt(l.amount_usdc));
          setExecStep("Awaiting signature — buying mETH on Fluxion…");
          const tx = await walletClient.writeContract({
            address: FLUXION_ROUTER as `0x${string}`, abi: SWAP_ROUTER_ABI,
            functionName: "exactInputSingle",
            args: [{
              tokenIn: USDC_MANTLE as `0x${string}`, tokenOut: l.token_out as `0x${string}`,
              fee: l.fee, recipient: address as `0x${string}`, deadline,
              amountIn: BigInt(l.amount_usdc), amountOutMinimum: BigInt(l.min_out), sqrtPriceLimitX96: BigInt(0),
            }],
            chain: mantleChain, account: address as `0x${string}`,
          });
          await pc.waitForTransactionReceipt({ hash: tx, confirmations: 1 });
          done.push("mETH"); repHash = repHash ?? tx;
        } catch (e: any) {
          if (isReject(e)) throw e;
          skipped.push("mETH (swap failed)");
        }
      }

      // --- USDY leg — best route: Relay (primary) or Agni multi-hop (fallback) ---
      // Re-quote fresh right before signing so the calldata/route is current.
      let usdyHash: `0x${string}` | null = null;
      let usdyRouteUsed: string | null = null;
      const planLeg = plan.usdy_leg;
      if (planLeg && BigInt(planLeg.amount_usdc) > BigInt(0)) {
        let ul: UsdyLeg = planLeg;
        try {
          const fr = await fetch(`${BACKEND_URL}/api/strategy/usdy_quote?side=buy&amount_usdc=${planLeg.est_usd}&wallet=${address}`);
          if (fr.ok) {
            const f = (await fr.json()) as UsdyQuoteResp;
            if (f?.ok && Number(f.exec_usdc ?? 0) > 0) {
              // Map the backend quote keys onto the leg shape the executor reads.
              ul = {
                ...planLeg,
                route_kind: f.route_kind,
                route_label: f.route_label ?? planLeg.route_label,
                amount_usdc: f.amount_in_wei,
                min_out: f.min_out,
                est_usd: f.exec_usdc,
                quote_usdy: f.quote_usdy,
                price_impact_bps: f.price_impact_bps,
                slippage_bps: f.slippage_bps ?? planLeg.slippage_bps,
                path: f.path,
                steps: f.steps,
                request_id: f.request_id,
                check_endpoint: f.check_endpoint,
                fees: f.fees,
              };
            }
          }
        } catch { /* fall back to the plan's quote */ }

        try {
          if (ul.route_kind === "relay" && ul.steps && ul.steps.length) {
            // Relay: sign each step (approve -> swap) verbatim, then poll fulfilment.
            for (const st of ul.steps) {
              setExecStep(st.id === "swap"
                ? `Awaiting signature — buying USDY (${ul.route_label ?? "via Relay"}, ${(ul.price_impact_bps / 100).toFixed(2)}% impact)…`
                : "Approve USDC for Relay (USDY)…");
              const h = await walletClient.sendTransaction({
                to: st.to as `0x${string}`,
                data: st.data as `0x${string}`,
                value: BigInt(st.value || "0"),
                chain: mantleChain, account: address as `0x${string}`,
              });
              await pc.waitForTransactionReceipt({ hash: h, confirmations: 1 });
              if (st.id === "swap") usdyHash = h;
            }
            if (ul.request_id) {
              setExecStep("Confirming USDY fill on Relay…");
              await pollRelayStatus(ul.request_id);
            }
            usdyRouteUsed = "Relay";
            done.push("USDY (Relay)"); repHash = repHash ?? usdyHash;
          } else if (ul.path) {
            // Agni multi-hop fallback: USDC→USDT→USDY exactInput(path).
            setExecStep("Approve USDC for Agni (USDY)…");
            await ensureAllowance(AGNI_SWAP_ROUTER, BigInt(ul.amount_usdc));
            setExecStep(`Awaiting signature — buying USDY (${ul.route_label ?? "USDC→USDT→USDY via Agni"}, ${(ul.price_impact_bps / 100).toFixed(2)}% impact)…`);
            usdyHash = await walletClient.writeContract({
              address: AGNI_SWAP_ROUTER as `0x${string}`, abi: SWAP_ROUTER_EXACT_INPUT_ABI,
              functionName: "exactInput",
              args: [{
                path: ul.path as `0x${string}`, recipient: address as `0x${string}`, deadline,
                amountIn: BigInt(ul.amount_usdc), amountOutMinimum: BigInt(ul.min_out),
              }],
              chain: mantleChain, account: address as `0x${string}`,
            });
            await pc.waitForTransactionReceipt({ hash: usdyHash, confirmations: 1 });
            usdyRouteUsed = "Agni"; done.push("USDY (Agni)"); repHash = repHash ?? usdyHash;
          }
        } catch (e: any) {
          if (isReject(e)) throw e;
          skipped.push(`USDY (${ul.route_kind === "relay" ? "Relay" : "Agni"} swap failed)`);
        }
      }

      if (!done.length) {
        setError(`No legs executed.${skipped.length ? " Limited: " + skipped.join(", ") : ""}`);
        return;
      }

      // Record the confirmed decision on-chain (best-effort) with a representative tx.
      setExecStep("Recording decision on-chain…");
      let recTx: string | null = null;
      try {
        const recRes = await fetch(`${BACKEND_URL}/api/strategy/record`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            regime: plan.regime,
            w_stocks: plan.weights_bps.xstocks,
            w_usdy: plan.weights_bps.usdy,
            w_meth: plan.weights_bps.meth,
            reason: plan.reason,
            tx_hash: repHash,
          }),
        });
        if (recRes.ok) recTx = (await recRes.json())?.tx_hash ?? null;
      } catch { /* record is best-effort */ }

      setPlan(null);
      setAmountInput("");
      const parts = [
        `Bought ${done.join(", ")} (${plan.weights_percent.xstocks}/${plan.weights_percent.usdy}/${plan.weights_percent.meth}).`,
        usdyHash && plan.usdy_leg ? `USDY bought via ${usdyRouteUsed ?? "best route"} (${plan.usdy_leg.route_label ?? "USDC→USDT→USDY"}, ~${plan.usdy_leg.est_usd} USDC, ${(plan.usdy_leg.price_impact_bps / 100).toFixed(2)}% impact).` : "",
        skipped.length ? `Limited (kept as USDC): ${skipped.join(", ")}.` : "",
        plan.usdy_usdc_held > 0 ? `${plan.usdy_usdc_held} USDC of the USDY layer kept as cash (${plan.usdy_leg?.capped ? "thin liquidity over impact cap" : "no route to quote"}).` : "",
        recTx ? "Decision recorded on-chain." : "",
      ].filter(Boolean);
      setNotice(parts.join(" ") || "Cycle complete.");
      await Promise.all([loadOnChain(), loadStatus(), loadUsdcBalance()]);
    } catch (e: any) {
      const msg = (e?.shortMessage || e?.message || "").toString();
      setError(isReject(e) ? "Transaction rejected in wallet." : `Execution failed: ${msg.slice(0, 140)}`);
    } finally {
      setExecuting(false); setExecStep("");
    }
  };

  // Autopilot DCA (Task 5).
  const loadDca = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/autopilot/dca/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDca((await res.json()) as DcaStatus);
      setBackendOk(true);
    } catch { /* keep last */ }
  };

  const startDca = async () => {
    setDcaBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/autopilot/dca/start`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_usdc: amountNum,
          risk_profile: riskProfile,
          duration_sec: dcaDuration,
          interval_sec: dcaInterval,
          symbols: selSymbols,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || `HTTP ${res.status}`); }
      setDca((await res.json()) as DcaStatus);
      setNotice("Autopilot DCA engaged — the agent will buy a tranche each interval, no further signatures needed.");
      setTimeout(() => { loadDca(); loadOnChain(); }, 2000);
    } catch (e: any) {
      setError(`Could not start DCA: ${(e?.message || "").toString().slice(0, 140)}`);
    } finally {
      setDcaBusy(false);
    }
  };

  const stopDca = async () => {
    setDcaBusy(true); setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/autopilot/dca/stop`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDca((await res.json()) as DcaStatus);
      setNotice("Autopilot DCA stopped. Remaining capital is left untouched.");
    } catch {
      setError("Backend unreachable — could not stop DCA.");
    } finally {
      setDcaBusy(false);
    }
  };

  const dcaCyclesFromInputs = dcaInterval > 0 ? Math.max(1, Math.floor(dcaDuration / dcaInterval)) : 1;

  const lastDecision = status?.last_decision;
  const lastTxHash: string | null = lastDecision?.tx_hash ?? null;
  const lastTxTs: number | null = lastDecision?.ts ?? null;

  // Donut data from the on-chain target weights (fallback to the latest decision).
  const weights = target ?? (decisions[0] ? [decisions[0].wStocks, decisions[0].wUSDY, decisions[0].wMETH] : null);
  const donut = weights ? [
    { name: "xStocks", value: weights[0] / 100 },
    { name: "USDY", value: weights[1] / 100 },
    { name: "mETH", value: weights[2] / 100 },
  ] : [];

  const fmtCountdown = (ts: number | null | undefined): string => {
    if (!ts) return "—";
    const secs = Math.max(0, ts - now);
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
  };
  const countdown = fmtCountdown(dcaActive ? dca?.next_run_ts : status?.next_run_ts);

  return (
    <div className="max-w-5xl mx-auto px-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold mb-1">Stocky Agent — Autonomous RWA Yield</h2>
        <p className="text-xs text-white/40">The agent classifies the market regime and dynamically allocates across xStocks (growth) · USDY (treasuries) · mETH (staking yield), recording every decision on-chain.</p>
      </div>

      {/* Mode bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 p-4 rounded-xl border border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dcaActive ? "bg-emerald-400" : "bg-white/30"}`}>
            {dcaActive && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />}
          </span>
          <div>
            <div className="text-sm font-semibold text-white/90">{dcaActive ? "Autopilot DCA — ON" : "Manual mode"}</div>
            <div className="text-[10px] text-white/40">{dcaActive ? `Cycle ${dca?.cycles_done}/${dca?.cycles_total} · next tranche in ${countdown}` : "Agent is idle. Run a manual cycle, or engage Autopilot DCA below."}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={(isConnected && amountValid) ? runManual : runNow} disabled={running || planning || executing || dcaActive} className="px-3 py-2 rounded-lg text-xs font-semibold border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-50">
            {planning ? "Analyzing…" : running ? "Running…" : "Run cycle now"}
          </button>
          {dcaActive && (
            <button onClick={stopDca} disabled={dcaBusy} className="px-4 py-2 rounded-lg text-xs font-bold transition bg-red-500/20 text-red-200 border border-red-500/30 hover:bg-red-500/30 disabled:opacity-50">
              {dcaBusy ? "…" : "Stop Autopilot"}
            </button>
          )}
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-[11px] text-red-200">{error}</div>}
      {notice && <div className="mb-4 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-200">{notice}</div>}

      {/* Cycle preview — signals → regime → target weights → planned USDC↔asset swaps */}
      {preview && (() => { const m = regimeMeta(preview.regime); return (
        <div className="mb-5 p-4 rounded-xl border border-blue-500/20 bg-blue-500/[0.04]">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] uppercase tracking-wide text-blue-300/80">Cycle preview · target rebalance on ${preview.notional.toLocaleString()} USDC</div>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${m.ring} ${m.bg} ${m.text}`}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.dot }} />{m.label}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {preview.legs.map((leg) => (
              <div key={leg.layer} className="p-3 rounded-lg border border-white/10 bg-white/[0.02]">
                <div className="text-[11px] text-white/55">USDC → {leg.layer}</div>
                <div className="text-[15px] font-semibold text-white/90 tabular-nums mt-0.5">${leg.usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                <div className="text-[10px] text-white/40 tabular-nums">{leg.pct.toFixed(0)}% target</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 text-[10px]">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${preview.guardrailsOk ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
              {preview.guardrailsOk ? "Guardrails ✓" : "Guardrails ✗"}
            </span>
            <span className="text-white/40">Σ = 100% · each layer ≤ 75%{preview.regime === 0 ? " · risk-off USDY ≥ 50%" : ""}</span>
          </div>
        </div>
      ); })()}

      {/* Investment amount (Task 2): connected wallet USDC + quick-select + custom */}
      <div className="mb-5 p-4 rounded-xl border border-white/10 bg-white/[0.02]">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] uppercase tracking-wide text-white/40">Amount to invest (USDC)</div>
          <div className="text-[11px] text-white/50">
            {isConnected
              ? <>Balance: <span className="text-white/80 font-semibold">{usdcBal === null ? "…" : usdcBal.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC</span></>
              : <span className="text-amber-300/80">Connect wallet to fund a cycle</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border bg-white/[0.03] ${amountTooHigh ? "border-red-500/40" : "border-white/10"}`}>
            <input
              type="number" min="0" step="any" inputMode="decimal" placeholder="0.00"
              value={amountInput} onChange={(e) => setAmountInput(e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm text-white/90 placeholder-white/25"
            />
            <span className="text-[11px] font-semibold text-white/40">USDC</span>
          </div>
          <button onClick={() => setPct(1)} disabled={usdcBal === null} className="px-3 py-2 rounded-lg text-[11px] font-bold border border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07] disabled:opacity-40">Max</button>
        </div>
        <div className="flex items-center gap-2">
          {[0.25, 0.5, 0.75].map((p) => (
            <button key={p} onClick={() => setPct(p)} disabled={usdcBal === null}
              className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border border-white/10 bg-white/[0.02] text-white/55 hover:bg-white/[0.06] disabled:opacity-40">
              {p * 100}%
            </button>
          ))}
        </div>
        {amountTooHigh && <div className="mt-2 text-[10px] text-red-300">Amount exceeds your USDC balance.</div>}
        <button
          onClick={runManual}
          disabled={!isConnected || !amountValid || planning || executing}
          className="mt-3 w-full px-4 py-2.5 rounded-lg text-xs font-bold bg-blue-500/20 text-blue-100 border border-blue-500/30 hover:bg-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed">
          {planning ? "Analyzing market…" : !isConnected ? "Connect wallet to invest" : !amountValid ? "Enter an amount" : `Run cycle — analyze & buy ${amountNum.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`}
        </button>
        <div className="mt-2 text-[10px] text-white/35">The agent computes the target % from live signals, then you sign each layer from your own wallet — xStocks &amp; mETH via Fluxion, USDY via Relay (with Agni multi-hop as fallback). A leg with no pool/liquidity is skipped without blocking the others.</div>
      </div>

      {/* Manual cycle plan preview (Task 3) — sign ONE tx to buy all layers. */}
      {plan && (() => {
        const m = regimeMeta(plan.regime);
        const totalBuy = plan.legs.filter((l) => l.tradable !== false).reduce((a, l) => a + l.est_usd, 0) + (plan.usdy_leg?.est_usd ?? 0);
        const impactPct = ((plan.usdy_leg?.price_impact_bps ?? 0) / 100);
        const impactColor = impactPct >= 2.5 ? "text-amber-300" : "text-emerald-300";
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => !executing && setPlan(null)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b0e14] shadow-2xl overflow-hidden">
              <div className="p-5 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white/90">Confirm strategy purchase</h3>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${m.ring} ${m.bg} ${m.text}`}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.dot }} />{m.label}
                  </span>
                </div>
                <p className="text-[11px] text-white/45 mt-2 leading-relaxed">{plan.reason}</p>
              </div>
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[["xStocks", plan.weights_percent.xstocks, "text-blue-300"], ["USDY", plan.weights_percent.usdy, "text-emerald-300"], ["mETH", plan.weights_percent.meth, "text-amber-300"]].map(([lbl, v, c]) => (
                    <div key={lbl as string} className="p-2 rounded-lg border border-white/10 bg-white/[0.02]">
                      <div className={`text-base font-bold ${c}`}>{v as number}%</div>
                      <div className="text-[9px] uppercase tracking-wide text-white/40">{lbl as string}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.02] divide-y divide-white/5">
                  {plan.legs.map((l) => {
                    const limited = l.tradable === false;
                    return (
                    <div key={l.symbol} className="flex items-center justify-between px-3 py-2 text-[11px]">
                      <span className="flex items-center gap-2">
                        <TokenIcon token={{ symbol: l.symbol, logo: legLogo(l.symbol) }} size={18} />
                        {l.symbol}
                        <span className="text-white/30">
                          {limited
                            ? `limited — ${l.note || "no liquidity"}`
                            : `Fluxion · ${l.unwrap ? "swap+unwrap" : "swap"}${l.price_impact_bps ? ` · ${(l.price_impact_bps / 100).toFixed(2)}% impact` : ""}${l.slippage_bps ? ` · ${(l.slippage_bps / 100).toFixed(0)}% max slippage` : ""}`}
                        </span>
                      </span>
                      <span className={`font-mono ${limited ? "text-white/30 line-through" : "text-white/75"}`}>{l.est_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC</span>
                    </div>
                  );})}
                  {plan.usdy_leg && (
                    <div className="flex items-center justify-between px-3 py-2 text-[11px]">
                      <span className="flex items-center gap-2"><TokenIcon token={{ symbol: "USDY", logo: legLogo("USDY") }} size={18} />USDY <span className="text-white/30"><span className={`mr-1 px-1 rounded ${plan.usdy_leg.route_kind === "relay" ? "bg-blue-500/20 text-blue-200/80" : "bg-white/10 text-white/50"}`}>{plan.usdy_leg.route_kind === "relay" ? "Relay" : "Agni"}</span>{plan.usdy_leg.route_label ?? "USDC→USDT→USDY via Agni"} · <span className={impactColor}>{impactPct.toFixed(2)}% impact</span>{plan.usdy_leg.slippage_bps ? ` · ${(plan.usdy_leg.slippage_bps / 100).toFixed(0)}% max slippage` : ""}</span></span>
                      <span className="font-mono text-white/75">{plan.usdy_leg.est_usd.toLocaleString(undefined, { maximumFractionDigits: 4 })} USDC</span>
                    </div>
                  )}
                  {plan.usdy_usdc_held > 0 && (
                    <div className="flex items-center justify-between px-3 py-2 text-[11px]">
                      <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20" />USDY <span className="text-white/30">{plan.usdy_leg?.capped ? "thin liquidity — rest kept as USDC*" : "no route to quote — kept as USDC*"}</span></span>
                      <span className="font-mono text-white/40">{plan.usdy_usdc_held.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC</span>
                    </div>
                  )}
                </div>
                {plan.usdy_leg && (
                  <div className="flex items-center justify-between text-[10px] text-white/40 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] px-3 py-2">
                    <span>{plan.usdy_leg.route_kind === "relay" ? "Relay" : "QuoterV2"} ({plan.usdy_leg.route_label ?? "USDC→USDT→USDY via Agni"}) → est. receive</span>
                    <span className="font-mono text-emerald-200/80">{plan.usdy_leg.quote_usdy.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDY</span>
                  </div>
                )}
                {plan.usdy_leg?.route_kind === "relay" && plan.usdy_leg.fees && (
                  <div className="flex items-center justify-between text-[10px] text-white/35 px-3">
                    <span>Relay fees</span>
                    <span className="font-mono">relay ${ (plan.usdy_leg.fees.relay_usd ?? 0).toFixed(4) } · swap ${ (plan.usdy_leg.fees.swap_usd ?? 0).toFixed(4) } · gas ${ (plan.usdy_leg.fees.gas_usd ?? 0).toFixed(4) }</span>
                  </div>
                )}
                {plan.usdy_leg?.routes?.relay?.ok && plan.usdy_leg?.routes?.agni?.ok && (
                  <div className="flex items-center justify-between text-[9px] text-white/25 px-3">
                    <span>Best route</span>
                    <span className="font-mono">Relay {plan.usdy_leg.routes.relay.quote_usdy.toFixed(5)} vs Agni {plan.usdy_leg.routes.agni.quote_usdy.toFixed(5)} USDY → {plan.usdy_leg.route_kind === "relay" ? "Relay" : "Agni"}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-[11px] text-white/50">
                  <span>Spent on swaps now</span>
                  <span className="font-semibold text-white/80">{totalBuy.toLocaleString(undefined, { maximumFractionDigits: 4 })} USDC</span>
                </div>
                {plan.usdy_usdc_held > 0 && <div className="text-[9px] text-white/30 leading-relaxed">* Soft {((plan.usdy_leg?.max_impact_bps ?? 800) / 100).toFixed(0)}% impact cap — the USDY leg is filled up to that impact via the USDC→USDT→USDY route; whatever the thin pool can&apos;t absorb within the cap stays as USDC. USDC is only fully held back when the route can&apos;t be quoted at all.</div>}
                <div className="text-[9px] text-white/30 leading-relaxed">The USDY leg is routed via Relay (meta-aggregator / solver network) as the primary route, with Agni multi-hop USDC→USDT→USDY as the fallback; the better USDY-per-USDC quote is chosen and the impact, fees &amp; max-slippage shown above are the honest execution cost.</div>
                <div className="text-[9px] text-amber-200/70 leading-relaxed rounded-lg border border-amber-500/15 bg-amber-500/[0.04] px-3 py-2">
                  <span className="font-semibold text-amber-200/90">Eligibility &amp; risk:</span> xStocks and USDY are tokenized securities (RWAs). KYC/eligibility is enforced by the issuers (Backed, Ondo) at mint/redeem; some assets are restricted for US persons and sanctioned jurisdictions. StockPilot is a non-custodial tool — you sign from your own wallet. This is not investment advice. <a href="/compliance" className="underline hover:text-amber-100">Compliance &amp; disclosures →</a>
                </div>
                {execStep && <div className="text-[11px] text-blue-200 flex items-center gap-2"><span className="w-3 h-3 rounded-full border-2 border-blue-300/40 border-t-blue-300 animate-spin" />{execStep}</div>}
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={() => setPlan(null)} disabled={executing} className="flex-1 px-4 py-2.5 rounded-lg text-xs font-semibold border border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.07] disabled:opacity-40">Cancel</button>
                  <button onClick={executePlan} disabled={executing} className="flex-1 px-4 py-2.5 rounded-lg text-xs font-bold bg-emerald-500/25 text-emerald-100 border border-emerald-500/40 hover:bg-emerald-500/35 disabled:opacity-50">
                    {executing ? "Working…" : "Approve & Sign all legs"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Top grid: regime + target donut + layers */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4 mb-5">
        {/* Regime + target allocation */}
        <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02]">
          <div className="text-[10px] uppercase tracking-wide text-white/40 mb-3">Current regime & target allocation</div>
          <div className="flex items-center gap-4">
            <div className="w-28 h-28 shrink-0">
              {donut.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donut} dataKey="value" innerRadius={30} outerRadius={52} paddingAngle={2} stroke="none">
                      <Cell fill="#3b82f6" /><Cell fill="#10b981" /><Cell fill="#f59e0b" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              ) : <div className="w-full h-full rounded-full border border-dashed border-white/10 flex items-center justify-center text-[10px] text-white/30">No data</div>}
            </div>
            <div className="flex-1 space-y-2">
              {decisions[0] && (() => { const m = regimeMeta(decisions[0].regime); return (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${m.ring} ${m.bg} ${m.text}`}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.dot }} />{m.label}
                </span>
              ); })()}
              {weights ? (
                <div className="space-y-1 text-[12px]">
                  <div className="flex items-center justify-between"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-blue-500" />xStocks</span><span className="font-semibold text-white/90">{(weights[0] / 100).toFixed(0)}%</span></div>
                  <div className="flex items-center justify-between"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-500" />USDY</span><span className="font-semibold text-white/90">{(weights[1] / 100).toFixed(0)}%</span></div>
                  <div className="flex items-center justify-between"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber-500" />mETH</span><span className="font-semibold text-white/90">{(weights[2] / 100).toFixed(0)}%</span></div>
                </div>
              ) : <div className="text-[11px] text-white/40">No on-chain decision yet — run a cycle.</div>}
            </div>
          </div>
        </div>

        {/* Three layers */}
        <div className="grid grid-cols-1 gap-3">
          <FeatureTile color="emerald" title="xStocks — growth" body="Tokenized equities (AAPLx, NVDAx, SPYx…). Overweighted in risk-on regimes." badge="Fluxion" />
          <FeatureTile color="violet" title="USDY — protection" body="Ondo's tokenized US Treasuries. Defensive ballast; overweighted in risk-off." badge="Ondo RWA" />
          <FeatureTile color="orange" title="mETH — yield" body="Mantle staked-ETH yield layer held for passive staking income." badge="Mantle" />
        </div>
      </div>

      {/* Strategy config */}
      <div className="mb-5 p-4 rounded-xl border border-white/10 bg-white/[0.02]">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] uppercase tracking-wide text-white/40">Strategy configuration</div>
          {!backendOk && <span className="text-[9px] text-amber-300/80">backend offline · read-only</span>}
        </div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] text-white/50">Pick 1 or more xStocks for the growth layer ({selSymbols.length}/{tradable.length})</div>
          <span className="text-[9px] text-white/30">{tradable.length} tradable · synced with Fluxion</span>
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {tradable.map((sym) => {
            const on = selSymbols.includes(sym);
            return (
              <button key={sym} onClick={() => toggleSymbol(sym)} className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition ${on ? "border-blue-500/40 bg-blue-500/15 text-blue-200" : "border-white/10 bg-white/[0.02] text-white/50 hover:bg-white/[0.05]"}`}>
                {sym}
              </button>
            );
          })}
        </div>
        <div className="text-[11px] text-white/50 mb-2">Risk profile (shifts the regime thresholds)</div>
        <div className="flex flex-wrap items-center gap-2">
          {RISK_PROFILE_CHOICES.map((rp) => (
            <button key={rp} onClick={() => setRiskProfile(rp)} className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold capitalize border transition ${riskProfile === rp ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200" : "border-white/10 bg-white/[0.02] text-white/50 hover:bg-white/[0.05]"}`}>
              {rp}
            </button>
          ))}
          <button onClick={saveConfig} className="ml-auto px-4 py-2 rounded-lg text-xs font-bold bg-blue-500/20 text-blue-200 border border-blue-500/30 hover:bg-blue-500/30">Save strategy</button>
        </div>
        {lastDecision?.simulated && (
          <div className="mt-3 text-[10px] text-amber-300/80">Swaps run in <b>simulation</b> (agent wallet holds no portfolio assets). On-chain <code>recordDecision</code> is real. Fund the wallet and set <code>AUTOPILOT_LIVE_SWAPS=1</code> for live trades.</div>
        )}
      </div>

      {/* Autopilot DCA (Task 5) — time-sliced accumulation */}
      <div className="mb-5 p-4 rounded-xl border border-white/10 bg-white/[0.02]">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] uppercase tracking-wide text-white/40">Autopilot DCA — accumulate over time</div>
          {dcaActive && <span className="text-[9px] text-emerald-300/80">running · autonomous</span>}
        </div>

        {dcaActive && dca ? (
          <div className="space-y-3">
            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full bg-emerald-500/70 transition-all" style={{ width: `${dca.cycles_total ? (dca.cycles_done / dca.cycles_total) * 100 : 0}%` }} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="p-2 rounded-lg border border-white/10 bg-white/[0.02]"><div className="text-base font-bold text-white/90">{dca.cycles_done}/{dca.cycles_total}</div><div className="text-[9px] uppercase tracking-wide text-white/40">cycles</div></div>
              <div className="p-2 rounded-lg border border-white/10 bg-white/[0.02]"><div className="text-base font-bold text-white/90">{dca.spent_usdc}</div><div className="text-[9px] uppercase tracking-wide text-white/40">spent USDC</div></div>
              <div className="p-2 rounded-lg border border-white/10 bg-white/[0.02]"><div className="text-base font-bold text-white/90">{dca.remaining_usdc}</div><div className="text-[9px] uppercase tracking-wide text-white/40">left USDC</div></div>
              <div className="p-2 rounded-lg border border-white/10 bg-white/[0.02]"><div className="text-base font-bold text-white/90">{countdown}</div><div className="text-[9px] uppercase tracking-wide text-white/40">next tranche</div></div>
            </div>
            <div className="text-[10px] text-white/40">{dca.per_cycle_usdc} USDC per cycle · {dca.risk_profile} · pre-approved via agent-vault deposit (no per-cycle signature).</div>
            {dca.cycles.length > 0 && (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] divide-y divide-white/5 max-h-44 overflow-auto">
                {dca.cycles.map((c) => { const m = regimeMeta(c.regime); return (
                  <div key={c.idx} className="flex items-center gap-2 px-3 py-2 text-[11px]">
                    <span className="text-white/40 font-mono">#{c.idx}</span>
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${m.ring} ${m.bg} ${m.text}`}>{m.label}</span>
                    <span className="font-mono text-white/60">{(c.weights_bps[0] / 100).toFixed(0)}/{(c.weights_bps[1] / 100).toFixed(0)}/{(c.weights_bps[2] / 100).toFixed(0)}</span>
                    <span className="text-white/40">${c.slice_usdc}</span>
                    {c.tx_hash && <a href={`https://mantlescan.xyz/tx/${c.tx_hash}`} target="_blank" rel="noreferrer" className="ml-auto text-blue-300/80 hover:text-blue-200 font-mono">{c.tx_hash.slice(0, 8)}…</a>}
                  </div>
                ); })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-[11px] text-white/50 mb-1.5">Duration</div>
              <div className="flex flex-wrap gap-2">
                {[["1h", 3600], ["6h", 6 * 3600], ["24h", 24 * 3600], ["7d", 7 * 24 * 3600]].map(([lbl, v]) => (
                  <button key={lbl as string} onClick={() => setDcaDuration(v as number)} className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition ${dcaDuration === v ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200" : "border-white/10 bg-white/[0.02] text-white/50 hover:bg-white/[0.05]"}`}>{lbl as string}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-white/50 mb-1.5">Interval (buy every)</div>
              <div className="flex flex-wrap gap-2">
                {[["5m", 300], ["1h", 3600], ["6h", 6 * 3600], ["12h", 12 * 3600]].map(([lbl, v]) => (
                  <button key={lbl as string} onClick={() => setDcaInterval(v as number)} className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition ${dcaInterval === v ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200" : "border-white/10 bg-white/[0.02] text-white/50 hover:bg-white/[0.05]"}`}>{lbl as string}</button>
                ))}
              </div>
            </div>
            <div className="text-[11px] text-white/55 p-2.5 rounded-lg border border-white/10 bg-white/[0.02]">
              {amountValid
                ? <>Splits <b className="text-white/80">{amountNum.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC</b> into <b className="text-white/80">{dcaCyclesFromInputs}</b> tranches of ~<b className="text-white/80">{(amountNum / dcaCyclesFromInputs).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC</b>, bought autonomously at each interval.</>
                : <>Enter an amount above to schedule a DCA plan.</>}
            </div>
            <button
              onClick={startDca}
              disabled={!amountValid || dcaBusy}
              className="w-full px-4 py-2.5 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-100 border border-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed">
              {dcaBusy ? "Engaging…" : "Engage Autopilot DCA"}
            </button>
            <div className="text-[9px] text-white/30 leading-relaxed">Pre-approval model: the plan runs from the agent-vault wallet funded by a one-time USDC deposit, so the scheduled tranches execute with <b>no further signatures</b>. Each cycle is recorded on-chain and appears in Decision History.</div>
          </div>
        )}
      </div>

      {/* Agent activity feed */}
      <div className="p-4 rounded-xl border border-white/10 bg-white/[0.015]">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] uppercase tracking-wide text-white/40">Agent activity — on-chain decisions</div>
          <button onClick={loadOnChain} className="text-[10px] text-white/40 hover:text-white/70">↻ refresh</button>
        </div>
        {loading ? (
          <div className="text-[12px] text-white/40 py-6 text-center">Loading on-chain history…</div>
        ) : decisions.length === 0 ? (
          <div className="text-[12px] text-white/40 py-6 text-center">No decisions recorded yet. Click “Run cycle now” to make the agent analyze the market and record its first decision on-chain.</div>
        ) : (
          <div className="space-y-2">
            {decisions.map((d, i) => {
              const m = regimeMeta(d.regime);
              const when = new Date(Number(d.ts) * 1000);
              const showTx = lastTxHash && lastTxTs !== null && Math.abs(Number(d.ts) - lastTxTs) <= 5;
              return (
                <div key={i} className="p-3 rounded-lg border border-white/5 bg-white/[0.02]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${m.ring} ${m.bg} ${m.text}`}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.dot }} />{m.label}
                    </span>
                    <span className="text-[11px] font-mono text-white/70">{(d.wStocks / 100).toFixed(0)}/{(d.wUSDY / 100).toFixed(0)}/{(d.wMETH / 100).toFixed(0)}</span>
                    <span className="text-[9px] text-white/30">xStocks/USDY/mETH</span>
                    <span className="ml-auto text-[10px] text-white/35">{when.toLocaleString()}</span>
                  </div>
                  <p className="text-[11px] text-white/65 leading-relaxed mt-2">{d.reason}</p>
                  <div className="mt-2 flex items-center gap-3">
                    {showTx ? (
                      <a href={`https://mantlescan.xyz/tx/${lastTxHash}`} target="_blank" rel="noreferrer" className="text-[10px] text-blue-300 hover:text-blue-200 underline">View tx on Mantlescan</a>
                    ) : (
                      <a href={`https://mantlescan.xyz/address/${CONTRACT}#events`} target="_blank" rel="noreferrer" className="text-[10px] text-white/40 hover:text-white/70 underline">View on-chain</a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 text-[9px] font-mono text-white/30 break-all">
          Contract: <a href={`https://mantlescan.xyz/address/${CONTRACT}`} target="_blank" rel="noreferrer" className="hover:text-white/60">{CONTRACT}</a>
        </div>
      </div>
    </div>
  );
}

export function FeatureTile({ color, title, body, badge }: { color: "orange" | "violet" | "emerald"; title: string; body: string; badge: string }) {
  const palette: Record<string, { ring: string; bg: string; text: string; pill: string }> = {
    orange:  { ring: "border-orange-500/25",  bg: "bg-orange-500/[0.04]",  text: "text-orange-300",  pill: "bg-orange-500/15 text-orange-200" },
    violet:  { ring: "border-violet-500/25",  bg: "bg-violet-500/[0.04]",  text: "text-violet-300",  pill: "bg-violet-500/15 text-violet-200" },
    emerald: { ring: "border-emerald-500/25", bg: "bg-emerald-500/[0.04]", text: "text-emerald-300", pill: "bg-emerald-500/15 text-emerald-200" },
  };
  const p = palette[color];
  return (
    <div className={`rounded-xl border ${p.ring} ${p.bg} p-4 space-y-2`}>
      <div className="flex items-center justify-between">
        <div className={`text-[13px] font-bold ${p.text}`}>{title}</div>
        <span className={`text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded ${p.pill}`}>{badge}</span>
      </div>
      <p className="text-[11px] text-white/65 leading-relaxed">{body}</p>
    </div>
  );
}
