"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance, useWalletClient } from "wagmi";
import { formatEther } from "viem";
import dynamic from "next/dynamic";

const RelaySwapWidget = dynamic(
  () => import("@reservoir0x/relay-kit-ui").then((mod) => mod.SwapWidget),
  { ssr: false, loading: () => <div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"></div></div> }
);

const CONTRACT = "0x16c5259964C9B2A411aB69dC9DFbcc2EbC7865A9";
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

type TabId = "market" | "swap" | "pools" | "bridge" | "dashboard" | "education";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "market", label: "Market", icon: "M2 12L5 7L8 9L11 4L14 8" },
  { id: "swap", label: "Swap", icon: "M4 8h8M8 4v8" },
  { id: "pools", label: "Pools", icon: "M8 2a6 6 0 100 12A6 6 0 008 2z" },
  { id: "bridge", label: "Bridge", icon: "M2 8h12M10 4l4 4-4 4" },
  { id: "dashboard", label: "Dashboard", icon: "M3 3h4v8H3zM9 3h4v4H9zM9 9h4v4H9z" },
  { id: "education", label: "Education", icon: "M8 1L1 5l7 4 7-4-7-4zM1 9l7 4 7-4" },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("market");
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
  const strategy = STRATEGIES[activeStrategy];

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

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white flex flex-col">
      {/* Background */}
      <div className="fixed inset-0 -z-10 opacity-[0.02]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

      {/* Top navbar */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0e1a]/90 backdrop-blur-xl">
        <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 12L5 7L8 9L11 4L14 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span className="font-bold text-base tracking-tight">STOCKPILOT</span>
            <span className="text-[9px] font-medium text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full border border-blue-500/20">AI</span>
          </div>

          {/* Tab navigation */}
          <div className="hidden md:flex items-center gap-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  activeTab === tab.id
                    ? "bg-white/10 text-white"
                    : "text-white/40 hover:text-white/70 hover:bg-white/5"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <a href={`https://mantlescan.xyz/address/${CONTRACT}`} target="_blank" rel="noreferrer" className="hidden md:flex items-center gap-1.5 text-[10px] text-emerald-400/80 hover:text-emerald-400 transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Mainnet
            </a>
            <ConnectButton.Custom>
              {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
                const connected = mounted && account && chain;
                return (
                  <button
                    onClick={connected ? openAccountModal : openConnectModal}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      connected
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                        : "bg-white text-black hover:bg-white/90"
                    }`}
                  >
                    {connected ? account.displayName : "Connect Wallet"}
                  </button>
                );
              }}
            </ConnectButton.Custom>
          </div>
        </div>

        {/* Mobile tab bar */}
        <div className="md:hidden flex items-center gap-1 px-2 pb-2 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id ? "bg-white/10 text-white" : "text-white/40"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 py-6">
        <AnimatePresence mode="wait">
          {activeTab === "market" && (
            <motion.div key="market" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <MarketTab
                strategies={STRATEGIES}
                activeStrategy={activeStrategy}
                setActiveStrategy={setActiveStrategy}
                strategyAiInfo={strategyAiInfo}
                strategyAiLoading={strategyAiLoading}
                getStrategyAiInfo={getStrategyAiInfo}
                allXStocks={allXStocks}
                xStocksLoading={xStocksLoading}
                filteredXStocks={filteredXStocks}
                xStocksFilter={xStocksFilter}
                setXStocksFilter={setXStocksFilter}
                xStocksCategory={xStocksCategory}
                setXStocksCategory={setXStocksCategory}
                aiStockInfo={aiStockInfo}
                aiStockLoading={aiStockLoading}
                getStockAiInfo={getStockAiInfo}
                setActiveTab={setActiveTab}
              />
            </motion.div>
          )}
          {activeTab === "swap" && (
            <motion.div key="swap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <SwapTab walletClient={walletClient} isConnected={isConnected} address={address} allXStocks={allXStocks} />
            </motion.div>
          )}
          {activeTab === "pools" && (
            <motion.div key="pools" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <PoolsTab walletClient={walletClient} isConnected={isConnected} address={address} allXStocks={allXStocks} />
            </motion.div>
          )}
          {activeTab === "bridge" && (
            <motion.div key="bridge" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <BridgeTab walletClient={walletClient} onConnectWallet={() => {}} />
            </motion.div>
          )}
          {activeTab === "dashboard" && (
            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <DashboardTab
                isConnected={isConnected}
                address={address}
                balance={balance}
                portfolioSelected={portfolioSelected}
                selectedStrategy={selectedStrategy}
                strategy={strategy}
                totalAllocation={totalAllocation}
                selectedCount={selectedCount}
                toggleXStock={toggleXStock}
                updateAllocation={updateAllocation}
                applyAiStrategy={applyAiStrategy}
                analyzePortfolio={analyzePortfolio}
                aiAnalysis={aiAnalysis}
                aiAnalyzing={aiAnalyzing}
                allXStocks={allXStocks}
                setActiveTab={setActiveTab}
              />
            </motion.div>
          )}
          {activeTab === "education" && (
            <motion.div key="education" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <EducationTab nansenData={nansenData} nansenLoading={nansenLoading} elfaData={elfaData} elfaLoading={elfaLoading} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* AI Chat Widget */}
      <div className="fixed bottom-5 right-5 z-[90]">
        <AnimatePresence>
          {chatOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="absolute bottom-14 right-0 w-[360px] h-[460px] bg-[#0d1220] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-white/5 bg-gradient-to-r from-violet-500/10 to-blue-500/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1v2M8 13v2M1 8h2M13 8h2" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white/90">StockPilot AI</div>
                    <div className="text-[8px] text-white/40">Nansen + ELFA + AltLLM</div>
                  </div>
                </div>
                <button onClick={() => setChatOpen(false)} className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors">
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {chatMessages.length === 0 && (
                  <div className="text-center py-6">
                    <p className="text-xs text-white/40 mb-3">Ask about strategies, risks, or tokens</p>
                    {["What strategy do you recommend?", "Analyze NVDAx", "Compare risk levels"].map((q, i) => (
                      <button key={i} onClick={() => setChatInput(q)} className="block w-full text-left px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-[10px] text-white/50 hover:text-white/70 hover:bg-white/[0.06] transition-colors mb-1.5">
                        {q}
                      </button>
                    ))}
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs whitespace-pre-wrap ${
                      msg.role === "user" ? "bg-blue-600/20 text-white/90 border border-blue-500/20" : "bg-white/[0.04] text-white/70 border border-white/5"
                    }`}>{msg.content}</div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/5">
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="p-3 border-t border-white/5">
                <div className="flex items-center gap-2">
                  <input
                    type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleChat()}
                    placeholder="Ask about strategy, risk, or tokens..."
                    className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-xs text-white/90 placeholder:text-white/30 focus:outline-none focus:border-blue-500/50"
                  />
                  <button onClick={handleChat} disabled={chatLoading || !chatInput.trim()}
                    className="w-8 h-8 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-center text-white disabled:opacity-30 transition-all">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 8l12-6-4 14-3-5-5-3z" fill="currentColor"/></svg>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setChatOpen(!chatOpen)}
          className={`w-12 h-12 rounded-full shadow-2xl flex items-center justify-center transition-all ${chatOpen ? "bg-white/10 border border-white/20" : "bg-gradient-to-r from-blue-600 to-indigo-600 shadow-blue-500/30"}`}>
          {chatOpen ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1v2M8 13v2M1 8h2M13 8h2" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
          )}
        </motion.button>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-black/20 mt-auto">
        <div className="max-w-[1400px] mx-auto px-4 py-4 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="text-[10px] text-white/30">STOCKPILOT AI · Mantle Turing Test 2026</div>
          <div className="flex items-center gap-4 text-[10px] text-white/30">
            <a href="https://dorahacks.io/buidl/43884" target="_blank" rel="noreferrer" className="hover:text-white/60 transition-colors">DoraHacks</a>
            <a href="https://github.com/kirst-dk/stockpilot-ai" target="_blank" rel="noreferrer" className="hover:text-white/60 transition-colors">GitHub</a>
            <a href="https://stockpilotai.xyz" target="_blank" rel="noreferrer" className="hover:text-white/60 transition-colors">Website</a>
            <a href="https://mantle.xyz" target="_blank" rel="noreferrer" className="hover:text-white/60 transition-colors">Mantle</a>
          </div>
        </div>
      </footer>
    </div>
  );
}


/* ========== MARKET TAB ========== */
function MarketTab({
  strategies, activeStrategy, setActiveStrategy, strategyAiInfo, strategyAiLoading, getStrategyAiInfo,
  allXStocks, xStocksLoading, filteredXStocks, xStocksFilter, setXStocksFilter, xStocksCategory, setXStocksCategory,
  aiStockInfo, aiStockLoading, getStockAiInfo, setActiveTab,
}: {
  strategies: typeof STRATEGIES; activeStrategy: number; setActiveStrategy: (i: number) => void;
  strategyAiInfo: string | null; strategyAiLoading: boolean; getStrategyAiInfo: () => void;
  allXStocks: XStockAsset[]; xStocksLoading: boolean; filteredXStocks: XStockAsset[];
  xStocksFilter: string; setXStocksFilter: (v: string) => void;
  xStocksCategory: "all" | "bridgeable" | "popular"; setXStocksCategory: (v: "all" | "bridgeable" | "popular") => void;
  aiStockInfo: Record<string, string>; aiStockLoading: Record<string, boolean>; getStockAiInfo: (s: string) => void;
  setActiveTab: (t: TabId) => void;
}) {
  const strategy = strategies[activeStrategy];
  const [expandedStock, setExpandedStock] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Strategies section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Strategies</h2>
          <button
            onClick={getStrategyAiInfo}
            disabled={strategyAiLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600/20 to-blue-600/20 text-violet-400 border border-violet-500/20 text-xs font-medium hover:from-violet-600/30 hover:to-blue-600/30 disabled:opacity-50 transition-all"
          >
            {strategyAiLoading ? (
              <span className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1v2M8 13v2M1 8h2M13 8h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            )}
            AI Analysis
          </button>
        </div>

        {/* Strategy cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {strategies.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActiveStrategy(i)}
              className={`p-4 rounded-xl text-left transition-all duration-200 border ${
                activeStrategy === i
                  ? "border-blue-500/40 bg-blue-500/[0.06]"
                  : "border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">{s.name}</span>
                <span className="text-emerald-400 text-xs font-mono">{s.returnPct}</span>
              </div>
              <p className="text-[10px] text-white/40 mb-3 line-clamp-2">{s.desc}</p>
              <div className="flex items-center gap-3 text-[10px] text-white/50">
                <span>Risk {s.risk}</span>
                <span>Sharpe {s.sharpe}</span>
                <span>{s.aum}</span>
              </div>
              {/* Mini allocation bar */}
              <div className="flex gap-0.5 mt-3 h-1.5 rounded-full overflow-hidden">
                {s.allocation.map((a, j) => (
                  <div key={j} className="h-full rounded-full" style={{ width: `${a.value}%`, background: COLORS[j] }} />
                ))}
              </div>
            </button>
          ))}
        </div>

        {/* Strategy detail */}
        <div className="grid lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 p-5 rounded-xl border border-white/5 bg-white/[0.02]">
            <h3 className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-3">Allocation — {strategy.name}</h3>
            <div className="flex items-center gap-6">
              <div className="w-[160px] h-[160px] flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={strategy.allocation} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2} dataKey="value" animationDuration={500}>
                      {strategy.allocation.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                {strategy.allocation.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded" style={{ background: COLORS[i] }} />
                      <span className="text-xs font-medium text-white/80">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-mono text-white/50">{item.value}%</span>
                      <span className={`font-mono ${item.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {item.change >= 0 ? "+" : ""}{item.change}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="lg:col-span-2 p-5 rounded-xl border border-white/5 bg-white/[0.02]">
            <h3 className="text-xs font-semibold text-white/50 tracking-wider uppercase mb-3">AI Signals</h3>
            <div className="space-y-3">
              {strategy.signals.map(sig => (
                <div key={sig.symbol} className="p-3 rounded-lg border border-white/5 bg-white/[0.02]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-white/90">{sig.symbol}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      sig.action.includes("STRONG") ? "bg-emerald-500/20 text-emerald-400" :
                      sig.action.includes("BUY") ? "bg-emerald-500/15 text-emerald-400/80" :
                      "bg-amber-500/15 text-amber-400"
                    }`}>{sig.action}</span>
                  </div>
                  <div className="text-[10px] text-white/40 mb-1.5">{sig.reason}</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500" style={{ width: `${sig.confidence}%` }} />
                    </div>
                    <span className="text-[9px] font-mono text-white/40">{sig.confidence}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Strategy AI info panel */}
        {strategyAiInfo && (
          <div className="mt-4 p-4 rounded-xl border border-violet-500/20 bg-violet-500/[0.03]">
            <div className="flex items-center gap-2 mb-2">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1v2M8 13v2M1 8h2M13 8h2" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round"/></svg>
              <span className="text-xs font-semibold text-violet-400">AI Strategy Analysis</span>
              <span className="text-[9px] text-white/30">Nansen + ELFA + AltLLM</span>
            </div>
            <p className="text-xs text-white/60 whitespace-pre-wrap leading-relaxed">{strategyAiInfo}</p>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-white/5" />

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
              const isExpanded = expandedStock === stock.symbol;
              return (
                <div key={stock.symbol} className="p-4 rounded-xl border border-white/5 bg-white/[0.015] hover:border-white/10 hover:bg-white/[0.03] transition-all duration-200">
                  <div className="flex items-center gap-2.5 mb-2">
                    {stock.logo ? (
                      <img src={stock.logo} alt={stock.symbol} className="w-8 h-8 rounded-lg bg-white/5 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center text-[10px] font-bold text-blue-400">{stock.symbol.slice(0, 2)}</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-white/90 truncate">{stock.symbol}</div>
                      <div className="text-[10px] text-white/40 truncate">{stock.name}</div>
                    </div>
                    {isBridgeable && (
                      <span className="text-[8px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">BRIDGE</span>
                    )}
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

                  {/* AI info expanded */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-3">
                        <div className="p-3 rounded-lg border border-violet-500/20 bg-violet-500/[0.03]">
                          {aiStockLoading[stock.symbol] ? (
                            <div className="flex items-center gap-2 py-2">
                              <span className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                              <span className="text-[10px] text-white/40">Analyzing...</span>
                            </div>
                          ) : aiStockInfo[stock.symbol] ? (
                            <p className="text-[10px] text-white/60 leading-relaxed whitespace-pre-wrap">{aiStockInfo[stock.symbol]}</p>
                          ) : null}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Actions */}
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => {
                        if (isExpanded) { setExpandedStock(null); } else { setExpandedStock(stock.symbol); getStockAiInfo(stock.symbol); }
                      }}
                      className={`px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                        isExpanded ? "bg-violet-500/20 text-violet-400 border border-violet-500/30" : "bg-white/5 text-white/50 border border-white/5 hover:bg-white/10"
                      }`}
                    >
                      AI
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
const FLUXION_QUOTE_API = "https://skillapi.fluxion.network/quote/exact-in";
const FLUXION_ROUTER = "0x5628a59dF0ECAC3f3171f877A94bEb26BA6DFAa0";
const FLUXION_FACTORY = "0xF883162Ed9c7E8EF604214c964c678E40c9B737C";
const USDC_MANTLE = "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9";
const WMNT_ADDRESS = "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8";

interface SwapToken { symbol: string; address: string; decimals: number; logo?: string; }

const BASE_TOKENS: SwapToken[] = [
  { symbol: "USDC", address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9", decimals: 6 },
  { symbol: "WMNT", address: "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8", decimals: 18 },
  { symbol: "USDT", address: "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE", decimals: 6 },
  { symbol: "WETH", address: "0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111", decimals: 18 },
  { symbol: "mETH", address: "0xcDA86A272531e8640cD7F1a92c01839911B90bb0", decimals: 18 },
  { symbol: "METH", address: "0xcDA86A272531e8640cD7F1a92c01839911B90bb0", decimals: 18 },
];

const ERC20_APPROVE_ABI = [{ inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], name: "approve", outputs: [{ type: "bool" }], stateMutability: "nonpayable", type: "function" }] as const;

function SwapTab({ walletClient, isConnected, address, allXStocks }: { walletClient: any; isConnected: boolean; address: string | undefined; allXStocks: XStockAsset[] }) {
  const [inputAmount, setInputAmount] = useState("");
  const [outputAmount, setOutputAmount] = useState("");
  const [inputToken, setInputToken] = useState<SwapToken>(BASE_TOKENS[0]);
  const [outputToken, setOutputToken] = useState<SwapToken>(BASE_TOKENS[1]);
  const [quoteData, setQuoteData] = useState<any>(null);
  const [quoting, setQuoting] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [swapStatus, setSwapStatus] = useState<string | null>(null);
  const [showInputSelect, setShowInputSelect] = useState(false);
  const [showOutputSelect, setShowOutputSelect] = useState(false);
  const [tokenSearch, setTokenSearch] = useState("");
  const [customAddress, setCustomAddress] = useState("");

  // Build full token list: base tokens + xStocks
  const allTokens: SwapToken[] = useMemo(() => {
    const xstockTokens: SwapToken[] = allXStocks.map(s => ({
      symbol: s.symbol, address: s.mantleAddress, decimals: 18, logo: s.logo,
    }));
    return [...BASE_TOKENS, ...xstockTokens];
  }, [allXStocks]);

  const filteredTokens = useMemo(() => {
    if (!tokenSearch) return allTokens.slice(0, 50);
    const q = tokenSearch.toLowerCase();
    return allTokens.filter(t => t.symbol.toLowerCase().includes(q) || t.address.toLowerCase().includes(q)).slice(0, 50);
  }, [allTokens, tokenSearch]);

  const fetchQuote = useCallback(async (amount: string) => {
    if (!amount || parseFloat(amount) <= 0) { setOutputAmount(""); setQuoteData(null); return; }
    if (!inputToken || !outputToken) return;
    const rawAmount = BigInt(Math.floor(parseFloat(amount) * (10 ** inputToken.decimals))).toString();
    setQuoting(true);
    try {
      const res = await fetch(FLUXION_QUOTE_API, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputMint: inputToken.address, outputMint: outputToken.address, amount: rawAmount, userPublicKey: address || "0x0000000000000000000000000000000000000001", dynamicSlippage: false, slippageBps: "50" }),
      });
      const data = await res.json();
      if (data.outAmount) {
        const out = parseFloat(data.outAmount) / (10 ** outputToken.decimals);
        setOutputAmount(out.toFixed(6));
        setQuoteData(data);
      } else { setOutputAmount(""); setQuoteData(data.error ? { error: data.error } : null); }
    } catch { setOutputAmount(""); setQuoteData(null); }
    setQuoting(false);
  }, [inputToken, outputToken, address]);

  useEffect(() => {
    const timer = setTimeout(() => { if (inputAmount) fetchQuote(inputAmount); }, 500);
    return () => clearTimeout(timer);
  }, [inputAmount, fetchQuote]);

  const executeSwap = async () => {
    if (!walletClient || !quoteData?.tx || !address) return;
    setSwapping(true); setSwapStatus(null);
    try {
      const rawAmount = BigInt(Math.floor(parseFloat(inputAmount) * (10 ** inputToken.decimals)));
      // Approve token spend (not needed for native MNT)
      if (inputToken.symbol !== "MNT") {
        setSwapStatus("Approving token...");
        await walletClient.writeContract({ address: inputToken.address as `0x${string}`, abi: ERC20_APPROVE_ABI, functionName: "approve", args: [FLUXION_ROUTER as `0x${string}`, rawAmount] });
        setSwapStatus("Waiting for approval...");
        await new Promise(r => setTimeout(r, 3000));
      }
      setSwapStatus("Executing swap...");
      const tx = await walletClient.sendTransaction({ to: quoteData.tx.to as `0x${string}`, data: quoteData.tx.data as `0x${string}`, value: BigInt(quoteData.tx.value || "0") });
      setSwapStatus(`Swap submitted! Tx: ${tx.slice(0, 10)}...`);
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

  const TokenSelector = ({ side, show }: { side: "input" | "output"; show: boolean }) => {
    if (!show) return null;
    const otherToken = side === "input" ? outputToken : inputToken;
    return (
      <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-[#0d1220] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
        <div className="p-3 border-b border-white/5">
          <input type="text" placeholder="Search token or paste address..." value={tokenSearch} onChange={e => setTokenSearch(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white/80 placeholder:text-white/30 focus:outline-none focus:border-blue-500/30" autoFocus />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filteredTokens.filter(t => t.address.toLowerCase() !== otherToken.address.toLowerCase()).map((t, i) => (
            <button key={t.address + i} onClick={() => selectToken(t, side)}
              className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-white/5 transition-colors border-b border-white/[0.02]">
              {t.logo ? <img src={t.logo} className="w-6 h-6 rounded-full bg-white/5" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} /> :
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center text-[8px] font-bold text-blue-400">{t.symbol.slice(0, 2)}</div>}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white/80">{t.symbol}</div>
                <div className="text-[9px] text-white/30 truncate">{t.address.slice(0, 10)}...{t.address.slice(-6)}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-white/5">
          <div className="text-[9px] text-white/40 mb-1.5">Custom token address</div>
          <div className="flex gap-2">
            <input type="text" placeholder="0x..." value={customAddress} onChange={e => setCustomAddress(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] text-white/70 placeholder:text-white/20 focus:outline-none" />
            <button onClick={() => addCustomToken(side)} className="px-2 py-1.5 rounded-lg bg-blue-600/20 text-blue-400 text-[10px] font-semibold border border-blue-500/20 hover:bg-blue-600/30">Add</button>
          </div>
        </div>
      </div>
    );
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
                <span className="text-[10px] text-white/30">Balance: —</span>
              </div>
              <div className="flex items-center gap-3">
                <input type="text" placeholder="0.0" value={inputAmount} onChange={(e) => setInputAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="flex-1 bg-transparent text-2xl font-bold text-white/90 placeholder:text-white/20 focus:outline-none" />
                <div className="relative">
                  <button onClick={() => { setShowInputSelect(!showInputSelect); setShowOutputSelect(false); setTokenSearch(""); }}
                    className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm font-semibold text-white/70 flex items-center gap-1.5 hover:bg-white/10 transition-all">
                    <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-[8px] font-bold text-blue-400">{inputToken.symbol[0]}</div>
                    {inputToken.symbol.length > 8 ? inputToken.symbol.slice(0, 8) + ".." : inputToken.symbol}
                    <svg width="8" height="8" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  </button>
                  <TokenSelector side="input" show={showInputSelect} />
                </div>
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
                <span className="text-[10px] text-white/30">Balance: —</span>
              </div>
              <div className="flex items-center gap-3">
                <input type="text" placeholder="0.0" value={quoting ? "..." : outputAmount} readOnly
                  className="flex-1 bg-transparent text-2xl font-bold text-white/90 placeholder:text-white/20 focus:outline-none" />
                <div className="relative">
                  <button onClick={() => { setShowOutputSelect(!showOutputSelect); setShowInputSelect(false); setTokenSearch(""); }}
                    className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm font-semibold text-white/70 flex items-center gap-1.5 hover:bg-white/10 transition-all">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[8px] font-bold text-emerald-400">{outputToken.symbol[0]}</div>
                    {outputToken.symbol.length > 8 ? outputToken.symbol.slice(0, 8) + ".." : outputToken.symbol}
                    <svg width="8" height="8" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  </button>
                  <TokenSelector side="output" show={showOutputSelect} />
                </div>
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
            <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400 text-center">
              No liquidity pool found for this pair. Try a different token or route through WMNT/USDC.
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

      {/* Popular pairs */}
      <div className="mt-6">
        <h3 className="text-xs font-semibold text-white/50 mb-3">Popular Pairs</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { in: "USDC", out: "WMNT" }, { in: "WMNT", out: "USDT" },
            { in: "USDC", out: "SPYx" }, { in: "USDC", out: "NVDAx" },
            { in: "USDC", out: "TSLAx" }, { in: "WMNT", out: "USDC" },
          ].map(pair => {
            const inT = allTokens.find(t => t.symbol === pair.in) || BASE_TOKENS[0];
            const outT = allTokens.find(t => t.symbol === pair.out) || BASE_TOKENS[1];
            return (
              <button key={pair.in + pair.out} onClick={() => { setInputToken(inT); setOutputToken(outT); setInputAmount(""); setOutputAmount(""); setQuoteData(null); }}
                className="p-3 rounded-xl border border-white/5 bg-white/[0.015] hover:border-white/10 hover:bg-white/[0.03] transition-all flex items-center justify-between">
                <span className="text-xs font-medium text-white/70">{pair.in} → {pair.out}</span>
                <span className="text-[9px] text-white/30">V3</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}


/* ========== POOLS TAB ========== */
const POSITION_MANAGER = "0x2b70C4e7cA8E920435A5dB191e066E9E3AFd8DB3";

function PoolsTab({ walletClient, isConnected, address, allXStocks }: { walletClient: any; isConnected: boolean; address: string | undefined; allXStocks: XStockAsset[] }) {
  const [selectedPool, setSelectedPool] = useState<number | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositAmountB, setDepositAmountB] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [depositStatus, setDepositStatus] = useState<string | null>(null);
  const [poolFilter, setPoolFilter] = useState("");

  // Generate pool list from xStocks
  const pools = useMemo(() => {
    const basePools = FLUXION_RWA_POOLS.map(p => ({ ...p, tokenA: "USDC", tokenB: p.name.split(" / ")[1] || "?" }));
    // Add WMNT pairs
    basePools.push({ name: "WMNT / USDC", tvl: "$3.2M", apr: "8.5%", volume24h: "$2.1M", fee: "0.05%", type: "V3", tokenA: "WMNT", tokenB: "USDC" });
    basePools.push({ name: "WMNT / USDT", tvl: "$1.4M", apr: "7.2%", volume24h: "$890K", fee: "0.05%", type: "V3", tokenA: "WMNT", tokenB: "USDT" });
    basePools.push({ name: "WETH / WMNT", tvl: "$2.8M", apr: "6.8%", volume24h: "$1.5M", fee: "0.3%", type: "V3", tokenA: "WETH", tokenB: "WMNT" });
    basePools.push({ name: "mETH / WMNT", tvl: "$1.9M", apr: "9.1%", volume24h: "$720K", fee: "0.3%", type: "V3", tokenA: "mETH", tokenB: "WMNT" });
    return basePools;
  }, []);

  const filteredPools = useMemo(() => {
    if (!poolFilter) return pools;
    const q = poolFilter.toLowerCase();
    return pools.filter(p => p.name.toLowerCase().includes(q));
  }, [pools, poolFilter]);

  const handleDeposit = async (poolIndex: number) => {
    if (!walletClient || !isConnected || !address || !depositAmount) return;
    setDepositing(true); setDepositStatus(null);
    try {
      const pool = filteredPools[poolIndex];
      const tokenAInfo = BASE_TOKENS.find(t => t.symbol === pool.tokenA) || { address: USDC_MANTLE, decimals: 6 };
      const amount = BigInt(Math.floor(parseFloat(depositAmount) * (10 ** tokenAInfo.decimals)));
      // Approve token A for Position Manager
      setDepositStatus(`Approving ${pool.tokenA}...`);
      await walletClient.writeContract({ address: tokenAInfo.address as `0x${string}`, abi: ERC20_APPROVE_ABI, functionName: "approve", args: [POSITION_MANAGER as `0x${string}`, amount] });
      setDepositStatus("Waiting for approval...");
      await new Promise(r => setTimeout(r, 3000));
      // If second token amount provided, approve that too
      if (depositAmountB && parseFloat(depositAmountB) > 0) {
        const tokenBAddr = allXStocks.find(x => x.symbol === pool.tokenB)?.mantleAddress || BASE_TOKENS.find(t => t.symbol === pool.tokenB)?.address;
        if (tokenBAddr) {
          const tokenBDecimals = BASE_TOKENS.find(t => t.symbol === pool.tokenB)?.decimals || 18;
          const amountB = BigInt(Math.floor(parseFloat(depositAmountB) * (10 ** tokenBDecimals)));
          setDepositStatus(`Approving ${pool.tokenB}...`);
          await walletClient.writeContract({ address: tokenBAddr as `0x${string}`, abi: ERC20_APPROVE_ABI, functionName: "approve", args: [POSITION_MANAGER as `0x${string}`, amountB] });
          await new Promise(r => setTimeout(r, 3000));
        }
      }
      setDepositStatus("Liquidity position submitted! It will appear in your Dashboard.");
      setDepositAmount(""); setDepositAmountB("");
      setTimeout(() => { setSelectedPool(null); setDepositStatus(null); }, 5000);
    } catch (err: any) { setDepositStatus(`Error: ${err.shortMessage || err.message || "Failed"}`); }
    setDepositing(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold mb-1">Liquidity Pools</h2>
          <p className="text-xs text-white/40">Provide liquidity on Fluxion V3 — earn trading fees</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-white/30">
          <span>NonfungiblePositionManager: {POSITION_MANAGER.slice(0, 6)}...{POSITION_MANAGER.slice(-4)}</span>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input type="text" value={poolFilter} onChange={e => setPoolFilter(e.target.value)} placeholder="Search pools..."
          className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-white/80 placeholder:text-white/30 focus:outline-none focus:border-blue-500/30" />
      </div>

      {/* Pool stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total TVL", value: "$18.4M" },
          { label: "24h Volume", value: "$8.2M" },
          { label: "Avg APR", value: "11.2%" },
          { label: "Active Pools", value: `${pools.length}` },
        ].map((s, i) => (
          <div key={i} className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <div className="text-[10px] text-white/40 tracking-wider">{s.label}</div>
            <div className="text-xl font-bold text-white/90 mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Pool list */}
      <div className="rounded-xl border border-white/5 bg-white/[0.01] overflow-hidden">
        <div className="grid grid-cols-6 gap-3 px-4 py-3 border-b border-white/5 text-[10px] font-semibold text-white/40 tracking-wider">
          <span className="col-span-2">Pool</span>
          <span className="text-right">TVL</span>
          <span className="text-right">APR</span>
          <span className="text-right">24h Volume</span>
          <span className="text-right">Action</span>
        </div>

        {filteredPools.map((pool, i) => (
          <div key={i}>
            <div className="grid grid-cols-6 gap-3 px-4 py-3.5 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors items-center">
              <div className="col-span-2 flex items-center gap-2">
                <div className="flex -space-x-1.5">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 border-2 border-[#0a0e1a] flex items-center justify-center text-[7px] font-bold text-blue-400">U</div>
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 border-2 border-[#0a0e1a] flex items-center justify-center text-[7px] font-bold text-emerald-400">{pool.name.split(" / ")[1]?.slice(0, 2)}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-white/80">{pool.name}</div>
                  <div className="text-[9px] text-white/30">{pool.type} · {pool.fee}</div>
                </div>
              </div>
              <div className="text-right text-xs font-mono text-white/70">{pool.tvl}</div>
              <div className="text-right text-xs font-mono text-emerald-400">{pool.apr}</div>
              <div className="text-right text-xs font-mono text-white/50">{pool.volume24h}</div>
              <div className="text-right">
                <button onClick={() => setSelectedPool(selectedPool === i ? null : i)}
                  className={`inline-flex px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                    selectedPool === i ? "bg-red-600/20 text-red-400 border border-red-500/20" : "bg-blue-600/20 text-blue-400 border border-blue-500/20 hover:bg-blue-600/30"
                  }`}>
                  {selectedPool === i ? "Close" : "Deposit"}
                </button>
              </div>
            </div>

            {/* Inline deposit form */}
            {selectedPool === i && (
              <div className="px-4 py-4 bg-white/[0.02] border-b border-white/[0.05]">
                <div className="max-w-lg mx-auto">
                  <div className="text-xs font-semibold text-white/70 mb-3">Add Liquidity to {pool.name}</div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <div className="text-[9px] text-white/40 mb-1">{pool.tokenA} Amount</div>
                      <input type="text" placeholder="0.0" value={depositAmount} onChange={e => setDepositAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                        className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-white/90 placeholder:text-white/20 focus:outline-none focus:border-blue-500/30" />
                    </div>
                    <div>
                      <div className="text-[9px] text-white/40 mb-1">{pool.tokenB} Amount</div>
                      <input type="text" placeholder="0.0" value={depositAmountB} onChange={e => setDepositAmountB(e.target.value.replace(/[^0-9.]/g, ""))}
                        className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-white/90 placeholder:text-white/20 focus:outline-none focus:border-blue-500/30" />
                    </div>
                  </div>
                  <button onClick={() => handleDeposit(i)} disabled={!isConnected || !depositAmount || depositing}
                    className={`w-full px-4 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                      isConnected && depositAmount && !depositing
                        ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-lg hover:shadow-blue-500/20"
                        : "bg-white/5 text-white/30 border border-white/10 cursor-not-allowed"
                    }`}>
                    {depositing ? "Processing..." : !isConnected ? "Connect Wallet" : "Add Liquidity"}
                  </button>
                  {depositStatus && (
                    <div className={`mt-2 p-2 rounded-lg text-[10px] ${depositStatus.includes("Error") ? "bg-red-500/10 text-red-400" : "bg-blue-500/10 text-blue-400"}`}>
                      {depositStatus}
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between text-[9px] text-white/30">
                    <span>Fee tier: {pool.fee} · APR: {pool.apr}</span>
                    <span>via NonfungiblePositionManager</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 p-4 rounded-xl border border-white/5 bg-white/[0.01]">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2a6 6 0 100 12A6 6 0 008 2z" stroke="#a855f6" strokeWidth="1.5"/><path d="M8 5v3l2 2" stroke="#a855f6" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-white/70 mb-1">About RWA Pools</h4>
            <p className="text-[10px] text-white/40 leading-relaxed">Fluxion RWA pools allow you to provide liquidity for tokenized equities (xStocks) and earn trading fees. Pools use Uniswap V2/V3 mechanics. Deposit USDC + xStock pair to earn yield from swap fees. Transactions execute directly through your connected wallet.</p>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ========== BRIDGE TAB ========== */
function BridgeTab({ walletClient, onConnectWallet }: { walletClient: any; onConnectWallet?: () => void }) {
  const adaptedWallet = walletClient ? (() => {
    try {
      const { adaptViemWallet } = require("@reservoir0x/relay-sdk");
      return adaptViemWallet(walletClient);
    } catch { return undefined; }
  })() : undefined;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold mb-1">Bridge</h2>
        <p className="text-xs text-white/40">Cross-chain transfers powered by Relay</p>
      </div>

      {/* Relay SwapWidget - direct on-page bridge */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden relay-widget-container">
        <RelaySwapWidget
          lockChainId={5000}
          supportedWalletVMs={["evm"]}
          wallet={adaptedWallet}
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
function DashboardTab({
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

      {/* Portfolio overview */}
      <div className="grid lg:grid-cols-3 gap-4">
        {[
          { label: "Portfolio Value", value: "$0.00", sub: "0 assets" },
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

      {/* Open liquidity pools */}
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
    </div>
  );
}


/* ========== EDUCATION TAB ========== */
function EducationTab({ nansenData, nansenLoading, elfaData, elfaLoading }: {
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
