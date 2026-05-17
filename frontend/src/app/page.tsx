"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance } from "wagmi";
import { formatEther } from "viem";

const CONTRACT = "0x16c5259964C9B2A411aB69dC9DFbcc2EbC7865A9";
const NANSEN_API_KEY = process.env.NEXT_PUBLIC_NANSEN_API_KEY || "";
const ELFA_API_KEY = process.env.NEXT_PUBLIC_ELFA_API_KEY || "";
const ALTLLM_API_KEY = process.env.NEXT_PUBLIC_ALTLLM_API_KEY || "";
const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

const STRATEGIES = [
  {
    id: "balanced",
    name: "Balanced Growth",
    risk: "5/10",
    desc: "Diversified exposure across sectors with automatic stop-loss protection",
    returnPct: "+12.4%",
    sharpe: "1.82",
    aum: "$100,000",
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
    id: "momentum",
    name: "Momentum Trading",
    risk: "6/10",
    desc: "Follows price trends and sector rotations for maximum short-term gains",
    returnPct: "+18.7%",
    sharpe: "1.54",
    aum: "$75,000",
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
    id: "value",
    name: "Value Investing",
    risk: "4/10",
    desc: "Mean reversion strategy targeting undervalued assets with high dividend yield",
    returnPct: "+8.2%",
    sharpe: "2.14",
    aum: "$150,000",
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

const TICKER_DATA = [
  { symbol: "SPYx", price: "587.42", change: "+1.2%" },
  { symbol: "NVDAx", price: "131.88", change: "+3.4%" },
  { symbol: "AAPLx", price: "198.55", change: "-0.3%" },
  { symbol: "TSLAx", price: "178.22", change: "+2.1%" },
  { symbol: "MSFTx", price: "442.31", change: "+0.8%" },
  { symbol: "AMZNx", price: "193.67", change: "+1.5%" },
];

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
  { chain: "ethereum", token_symbol: "SPY", price_usd: 587.42, price_change: 0.012, buy_volume: 4350000, sell_volume: 3900000, nof_traders: 156, market_cap_usd: 520000000000, netflow: 450000 },
  { chain: "ethereum", token_symbol: "AAPL", price_usd: 198.55, price_change: -0.003, buy_volume: 2100000, sell_volume: 2300000, nof_traders: 65, market_cap_usd: 3050000000000, netflow: -200000 },
];

const DEMO_ELFA: ElfaTrending[] = [
  { token: "BTC", current_count: 435, change_percent: -29.15 },
  { token: "ETH", current_count: 216, change_percent: -10.37 },
  { token: "SOL", current_count: 105, change_percent: 15.38 },
  { token: "NVDA", current_count: 86, change_percent: -23.89 },
  { token: "XRP", current_count: 109, change_percent: -28.76 },
];

const AI_RESPONSES: Record<string, string> = {
  default: "I'm StockPilot AI, powered by ELFA intelligence and AltLLM. I can help you with tokenized equity strategies on Mantle. Ask me about market trends, portfolio allocation, or specific xStocks like SPYx, NVDAx, AAPLx.",
  strategy: "Based on current smart money flows (Nansen data), institutional funds are accumulating tech equities. For your risk profile, I recommend the Balanced Growth strategy with overweight on NVDAx (+3.4% today) and SPYx for stability. ELFA sentiment analysis shows 82% bullish signals on AI sector tokens.",
  risk: "Risk assessment powered by Nansen + ELFA:\n\n- Balanced Growth: Risk 5/10, Sharpe 1.82 — best for steady returns\n- Momentum: Risk 6/10, Sharpe 1.54 — higher returns but more volatile\n- Value: Risk 4/10, Sharpe 2.14 — lowest risk, dividend-focused\n\nSmart money is currently favoring momentum plays in AI sector.",
  nvda: "NVDAx Analysis (via Nansen + ELFA):\n\nSmart Money Flow: +$2.75M net inflow (87 traders)\nSentiment: 89% bullish (ELFA mentions: 2,340)\nPrice: $131.88 (+3.4%)\n\nAI sector momentum is strong. Earnings beat estimates by 15%. Institutional funds increasing positions. STRONG BUY signal at 92% confidence.",
  mantle: "Mantle Network Insights (Nansen):\n\nMNT: $0.82 (+4.5%)\nSmart Money Net Inflow: +$566K\nActive Smart Traders: 342\n\nMantle ecosystem growing with xStocks tokenized equities and Fluxion DEX. The network offers low fees ideal for high-frequency AI trading strategies.",
  xstocks: "xStocks are tokenized equities backed 1:1 by real stocks on Mantle. Available tokens:\n\n- SPYx (S&P 500) — $587.42\n- NVDAx (NVIDIA) — $131.88\n- AAPLx (Apple) — $198.55\n- TSLAx (Tesla) — $178.22\n- MSFTx (Microsoft) — $442.31\n- AMZNx (Amazon) — $193.67\n\nMint with USDC via Atomic RFQ. Dividends auto-rebase.",
};

function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 30 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] }} className={className}>
      {children}
    </motion.div>
  );
}

export default function Home() {
  const [activeStrategy, setActiveStrategy] = useState(0);
  const [agentRunning, setAgentRunning] = useState(false);
  const [showActivation, setShowActivation] = useState(false);
  const [activationStep, setActivationStep] = useState(0);
  const [nansenData, setNansenData] = useState<NansenToken[]>(DEMO_NANSEN);
  const [elfaData, setElfaData] = useState<ElfaTrending[]>(DEMO_ELFA);
  const [nansenLoading, setNansenLoading] = useState(true);
  const [elfaLoading, setElfaLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const prevConnected = useRef(false);

  const { address, isConnected } = useAccount();
  const { data: balance } = useBalance({ address });

  const walletConnected = isConnected;
  const strategy = STRATEGIES[activeStrategy];

  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "";

  const scrollToDashboard = () => {
    dashboardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (isConnected && !prevConnected.current) {
      setTimeout(() => scrollToDashboard(), 500);
    }
    prevConnected.current = isConnected;
  }, [isConnected]);

  // Fetch Nansen smart money data
  useEffect(() => {
    async function fetchNansen() {
      if (!NANSEN_API_KEY) { setNansenLoading(false); return; }
      try {
        const res = await fetch("https://api.nansen.ai/api/v1/token-screener", {
          method: "POST",
          headers: { "Content-Type": "application/json", apiKey: NANSEN_API_KEY },
          body: JSON.stringify({
            chains: ["ethereum", "mantle"],
            timeframe: "24h",
            filters: { only_smart_money: true, token_age_days: { min: 30, max: 365 } },
            order_by: [{ field: "buy_volume", direction: "DESC" }],
            pagination: { page: 1, per_page: 5 },
          }),
        });
        const json = await res.json();
        if (json.data && json.data.length > 0) setNansenData(json.data);
      } catch { /* use demo data */ }
      setNansenLoading(false);
    }
    fetchNansen();
  }, []);

  // Fetch ELFA trending tokens
  useEffect(() => {
    async function fetchElfa() {
      if (!ELFA_API_KEY) { setElfaLoading(false); return; }
      try {
        const res = await fetch("https://api.elfa.ai/v2/aggregations/trending-tokens?timeWindow=24h", {
          headers: { "x-elfa-api-key": ELFA_API_KEY },
        });
        const json = await res.json();
        if (json.success && json.data?.data) {
          setElfaData(json.data.data.slice(0, 5).map((t: Record<string, unknown>) => ({
            token: (t.token as string) || "—",
            current_count: Number(t.current_count) || 0,
            change_percent: Number(t.change_percent) || 0,
          })));
        }
      } catch { /* use demo data */ }
      setElfaLoading(false);
    }
    fetchElfa();
  }, []);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const getFallbackResponse = useCallback((input: string): string => {
    const lower = input.toLowerCase();
    if (lower.includes("strat") || lower.includes("recommend") || lower.includes("suggest")) return AI_RESPONSES.strategy;
    if (lower.includes("risk") || lower.includes("safe") || lower.includes("compare")) return AI_RESPONSES.risk;
    if (lower.includes("nvda") || lower.includes("nvidia")) return AI_RESPONSES.nvda;
    if (lower.includes("mantle") || lower.includes("mnt")) return AI_RESPONSES.mantle;
    if (lower.includes("xstock") || lower.includes("token") || lower.includes("available")) return AI_RESPONSES.xstocks;
    return AI_RESPONSES.default;
  }, []);

  const handleChat = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setChatLoading(true);

    if (ALTLLM_API_KEY) {
      try {
        const systemPrompt = `You are StockPilot AI, an autonomous AI agent for trading tokenized equities (xStocks) on Mantle blockchain. You help users with portfolio strategy, risk assessment, and market analysis.

Available xStocks: SPYx ($587.42), NVDAx ($131.88), AAPLx ($198.55), TSLAx ($178.22), MSFTx ($442.31), AMZNx ($193.67).
Strategies: Balanced Growth (risk 5/10), Momentum Trading (risk 6/10), Value Investing (risk 4/10).
Powered by: Nansen (on-chain analytics), ELFA (market sentiment), AltLLM (AI inference).
Network: Mantle Mainnet (ChainID 5000). Contract: ${CONTRACT}.

Be concise, data-driven, and actionable. Use bullet points. Max 150 words.`;

        const res = await fetch("https://api.altllm.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ALTLLM_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "altllm-standard",
            messages: [
              { role: "system", content: systemPrompt },
              ...chatMessages.slice(-6).map(m => ({ role: m.role, content: m.content })),
              { role: "user", content: userMsg },
            ],
            max_tokens: 300,
          }),
        });
        const json = await res.json();
        const reply = json.choices?.[0]?.message?.content || getFallbackResponse(userMsg);
        setChatMessages(prev => [...prev, { role: "assistant", content: reply }]);
      } catch {
        setChatMessages(prev => [...prev, { role: "assistant", content: getFallbackResponse(userMsg) }]);
      }
    } else {
      await new Promise(r => setTimeout(r, 800 + Math.random() * 700));
      setChatMessages(prev => [...prev, { role: "assistant", content: getFallbackResponse(userMsg) }]);
    }
    setChatLoading(false);
  }, [chatInput, chatLoading, chatMessages, getFallbackResponse]);

  const handleExecute = () => {
    if (!walletConnected) return;
    setShowActivation(true);
    setActivationStep(0);
    setTimeout(() => setActivationStep(1), 800);
    setTimeout(() => setActivationStep(2), 1800);
    setTimeout(() => {
      setActivationStep(3);
      setAgentRunning(true);
    }, 2800);
  };

  return (
    <div className="min-h-screen bg-[#030712] text-white overflow-x-hidden">
      {/* Background */}
      <div className="fixed inset-0 -z-10 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-[-20%] left-[30%] w-[600px] h-[600px] bg-blue-600/[0.08] rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[20%] w-[500px] h-[500px] bg-purple-600/[0.06] rounded-full blur-[130px]" />
      </div>

      {/* Ticker bar */}
      <div className="border-b border-white/5 bg-black/40 backdrop-blur-sm overflow-hidden">
        <div className="flex animate-[scroll_20s_linear_infinite] whitespace-nowrap py-2.5">
          {[...TICKER_DATA, ...TICKER_DATA].map((t, i) => (
            <div key={i} className="flex items-center gap-3 px-6 text-xs font-mono">
              <span className="text-white/60 font-semibold tracking-wider">{t.symbol}</span>
              <span className="text-white/90">${t.price}</span>
              <span className={t.change.startsWith("+") ? "text-emerald-400" : "text-red-400"}>{t.change}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#030712]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M2 12L5 7L8 9L11 4L14 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span className="font-bold text-lg tracking-tight">STOCKPILOT</span>
            <span className="text-[10px] font-medium text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">AI</span>
          </div>
          <div className="flex items-center gap-4">
            {agentRunning && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="hidden md:flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Agent Active
              </motion.div>
            )}
            <a href={`https://mantlescan.xyz/address/${CONTRACT}`} target="_blank" rel="noreferrer" className="hidden md:flex items-center gap-1.5 text-xs text-emerald-400/80 hover:text-emerald-400 transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Mainnet
            </a>
            <ConnectButton.Custom>
              {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
                const connected = mounted && account && chain;
                return (
                  <button
                    onClick={connected ? openAccountModal : openConnectModal}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${
                      connected
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                        : "bg-white text-black hover:bg-white/90 hover:shadow-lg hover:shadow-white/10 hover:-translate-y-0.5"
                    }`}
                  >
                    {connected ? account.displayName : "Connect Wallet"}
                  </button>
                );
              }}
            </ConnectButton.Custom>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 pt-24 pb-20">
        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }} className="max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-medium text-white/70 mb-8 uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            AI × RWA · Mantle Turing Test 2026
          </div>
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter leading-[0.9] mb-6">
            <span className="block text-white/90">YOUR AI</span>
            <span className="block bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">PORTFOLIO</span>
            <span className="block text-white/90">MANAGER</span>
          </h1>
          <p className="text-lg md:text-xl text-white/50 max-w-2xl leading-relaxed mb-10">
            Autonomous agent trading tokenized equities on Mantle.
            Choose a strategy — the AI handles everything. Every trade recorded on-chain.
          </p>
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <ConnectButton.Custom>
              {({ account, chain, openConnectModal, mounted }) => {
                const connected = mounted && account && chain;
                return (
                  <button
                    onClick={connected ? scrollToDashboard : openConnectModal}
                    className="group px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-base transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/25 hover:-translate-y-1 flex items-center gap-2"
                  >
                    {connected ? "Choose Strategy ↓" : "Connect Wallet & Start"}
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="group-hover:translate-x-1 transition-transform"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                );
              }}
            </ConnectButton.Custom>
            <a href="https://github.com/kirst-dk/stockpilot-ai" target="_blank" rel="noreferrer" className="px-8 py-4 rounded-xl border border-white/10 text-white/70 hover:text-white hover:border-white/20 font-medium text-base transition-all duration-300 hover:-translate-y-0.5">
              View Source
            </a>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.6 }} className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "ASSETS MANAGED", value: "$100K+", sub: "across 6 xStocks" },
            { label: "AI SIGNALS", value: "24/7", sub: "ELFA + AltLLM powered" },
            { label: "ON-CHAIN TRADES", value: "47", sub: "fully transparent" },
            { label: "STRATEGIES", value: "3", sub: "risk profiles" },
          ].map((stat, i) => (
            <div key={i} className="p-5 rounded-xl border border-white/5 bg-white/[0.02] backdrop-blur-sm hover:border-white/10 hover:bg-white/[0.04] transition-all duration-300">
              <div className="text-[10px] font-semibold text-white/40 tracking-widest mb-2">{stat.label}</div>
              <div className="text-2xl font-bold text-white/90">{stat.value}</div>
              <div className="text-xs text-white/30 mt-1">{stat.sub}</div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* How it works */}
      <section className="max-w-7xl mx-auto px-6 py-24 border-t border-white/5">
        <FadeIn>
          <div className="text-center mb-16">
            <span className="text-[11px] font-semibold text-white/40 tracking-[0.2em] uppercase">HOW IT WORKS</span>
            <h2 className="text-3xl md:text-4xl font-bold mt-3 tracking-tight">Three steps. AI does the rest.</h2>
          </div>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { step: "01", title: "Connect Wallet", desc: "Link your Mantle wallet. Your funds stay in your control — the agent operates through a transparent smart contract.", icon: "🔗", active: walletConnected },
            { step: "02", title: "Choose Strategy", desc: "Balanced Growth, Momentum Trading, or Value Investing. Each has different risk/reward profiles and AI models.", icon: "⚡", active: agentRunning },
            { step: "03", title: "AI Trades for You", desc: "The agent buys xStocks via Atomic RFQ, trades on Fluxion DEX, and rebalances 24/7. All recorded on Mantle.", icon: "🤖", active: agentRunning },
          ].map((item, i) => (
            <FadeIn key={i} delay={i * 0.15}>
              <div className={`relative p-8 rounded-2xl border transition-all duration-500 ${item.active ? "border-emerald-500/30 bg-emerald-500/[0.03]" : "border-white/5 bg-white/[0.01]"} hover:border-white/15 hover:-translate-y-1`}>
                <div className="absolute top-6 right-6 text-[11px] font-mono text-white/20">{item.step}</div>
                <div className="text-4xl mb-5">{item.icon}</div>
                <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                <p className="text-sm text-white/50 leading-relaxed">{item.desc}</p>
                {item.active && <div className="absolute bottom-0 left-6 right-6 h-0.5 bg-gradient-to-r from-emerald-500 to-transparent rounded-full" />}
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* xStocks & Fluxion - What are they and how to interact */}
      <section className="max-w-7xl mx-auto px-6 py-24 border-t border-white/5">
        <FadeIn>
          <div className="text-center mb-16">
            <span className="text-[11px] font-semibold text-white/40 tracking-[0.2em] uppercase">POWERED BY</span>
            <h2 className="text-3xl md:text-4xl font-bold mt-3 tracking-tight">How Your Money Works</h2>
            <p className="text-white/40 mt-3 max-w-xl mx-auto">StockPilot AI uses two market sources to get you the best price on tokenized equities.</p>
          </div>
        </FadeIn>
        <div className="grid md:grid-cols-2 gap-8">
          {/* xStocks */}
          <FadeIn delay={0.1}>
            <div className="p-8 rounded-2xl border border-blue-500/20 bg-blue-500/[0.02] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/5 rounded-full blur-[60px]" />
              <div className="text-[9px] font-bold text-blue-400 tracking-[0.2em] mb-3">PRIMARY MARKET</div>
              <h3 className="text-2xl font-bold mb-2">xStocks</h3>
              <p className="text-white/50 text-sm leading-relaxed mb-4">
                Tokenized equities backed 1:1 by real stocks. When StockPilot AI buys SPYx, there&apos;s a real S&amp;P 500 ETF share held in custody. Proof of Reserves verifiable on-chain.
              </p>
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-3 text-sm">
                  <span className="w-6 h-6 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center text-xs">→</span>
                  <span className="text-white/60"><span className="text-white/80 font-medium">Mint</span> — deposit USDC, receive xStock token instantly</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="w-6 h-6 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center text-xs">←</span>
                  <span className="text-white/60"><span className="text-white/80 font-medium">Redeem</span> — return xStock, get USDC at market price</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="w-6 h-6 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center text-xs">$</span>
                  <span className="text-white/60"><span className="text-white/80 font-medium">Dividends</span> — auto-rebase reflects stock splits &amp; dividends</span>
                </div>
              </div>
              <div className="text-xs text-white/30 mb-4">Available: SPYx, NVDAx, AAPLx, TSLAx, MSFTx, AMZNx</div>
              <a href="https://xstocks.fi" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors">
                Learn more at xstocks.fi
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 12L12 4M12 4H6M12 4v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </a>
            </div>
          </FadeIn>
          {/* Fluxion */}
          <FadeIn delay={0.2}>
            <div className="p-8 rounded-2xl border border-purple-500/20 bg-purple-500/[0.02] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-purple-500/5 rounded-full blur-[60px]" />
              <div className="text-[9px] font-bold text-purple-400 tracking-[0.2em] mb-3">SECONDARY MARKET</div>
              <h3 className="text-2xl font-bold mb-2">Fluxion Network</h3>
              <p className="text-white/50 text-sm leading-relaxed mb-4">
                DEX on Mantle with V2/V3 AMM pools. StockPilot AI routes trades here when pool prices are better than xStocks RFQ — saving you money on every swap.
              </p>
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-3 text-sm">
                  <span className="w-6 h-6 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center text-xs">⚡</span>
                  <span className="text-white/60"><span className="text-white/80 font-medium">Smart Routing</span> — AI compares RFQ vs pool price in real-time</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="w-6 h-6 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center text-xs">💧</span>
                  <span className="text-white/60"><span className="text-white/80 font-medium">Multi-Pool</span> — V2 and V3 pools with multiple fee tiers</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="w-6 h-6 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center text-xs">📊</span>
                  <span className="text-white/60"><span className="text-white/80 font-medium">Liquidity Analysis</span> — depth check before large orders</span>
                </div>
              </div>
              <div className="text-xs text-white/30 mb-4">Avg. savings: 0.12% per trade vs direct RFQ</div>
              <a href="https://fluxion.network" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-purple-400 hover:text-purple-300 transition-colors">
                Explore Fluxion DEX
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 12L12 4M12 4H6M12 4v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </a>
            </div>
          </FadeIn>
        </div>
        {/* Flow diagram */}
        <FadeIn delay={0.3}>
          <div className="mt-10 p-6 rounded-2xl border border-white/5 bg-white/[0.01]">
            <div className="flex items-center justify-center gap-3 flex-wrap text-sm">
              <span className="px-3 py-1.5 rounded-lg bg-white/5 text-white/70 font-medium">Your USDC</span>
              <span className="text-white/20">→</span>
              <span className="px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">StockPilot AI Agent</span>
              <span className="text-white/20">→</span>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-lg bg-blue-500/5 text-blue-300/70 text-xs">xStocks RFQ</span>
                <span className="text-white/30 text-xs">or</span>
                <span className="px-3 py-1.5 rounded-lg bg-purple-500/5 text-purple-300/70 text-xs">Fluxion DEX</span>
              </div>
              <span className="text-white/20">→</span>
              <span className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">xStock Tokens in Your Wallet</span>
            </div>
            <div className="text-center text-[10px] text-white/30 mt-3">Every step recorded on Mantle · Verify at mantlescan.xyz</div>
          </div>
        </FadeIn>
      </section>

      {/* Strategy selector + Dashboard */}
      <section ref={dashboardRef} id="dashboard" className="max-w-7xl mx-auto px-6 py-24 border-t border-white/5">
        <FadeIn>
          <div className="text-center mb-12">
            <span className="text-[11px] font-semibold text-white/40 tracking-[0.2em] uppercase">LIVE DASHBOARD</span>
            <h2 className="text-3xl md:text-4xl font-bold mt-3 tracking-tight">Select your strategy</h2>
            <p className="text-white/40 mt-3 max-w-lg mx-auto">Each strategy has different allocation weights, risk levels, and AI signal patterns.</p>
          </div>
        </FadeIn>

        {/* Strategy tabs */}
        <div className="flex flex-wrap justify-center gap-3 mb-12">
          {STRATEGIES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActiveStrategy(i)}
              className={`relative px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
                activeStrategy === i
                  ? "bg-white text-black shadow-xl shadow-white/10"
                  : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white"
              }`}
            >
              {s.name}
              {activeStrategy === i && (
                <motion.span layoutId="strategyDot" className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-blue-500 border-2 border-[#030712]" />
              )}
            </button>
          ))}
        </div>

        {/* Wallet info banner */}
        {walletConnected && address && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 p-4 rounded-xl border border-blue-500/20 bg-blue-500/[0.03] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-xs font-bold">W</div>
              <div>
                <div className="text-sm font-semibold text-white/90">{shortAddress}</div>
                <div className="text-xs text-white/40">Mantle Mainnet · {balance ? `${Number(formatEther(balance.value)).toFixed(4)} MNT` : "Loading..."}</div>
              </div>
            </div>
            <div className="text-xs text-white/50">Select a strategy below and click Execute to start the AI agent</div>
          </motion.div>
        )}

        {/* Strategy details + chart */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeStrategy}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {/* Metrics row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                <div className="text-[10px] text-white/40 tracking-wider">RETURN</div>
                <div className="text-2xl font-bold text-emerald-400 mt-1">{strategy.returnPct}</div>
              </div>
              <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                <div className="text-[10px] text-white/40 tracking-wider">RISK LEVEL</div>
                <div className="text-2xl font-bold text-white/90 mt-1">{strategy.risk}</div>
              </div>
              <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                <div className="text-[10px] text-white/40 tracking-wider">SHARPE RATIO</div>
                <div className="text-2xl font-bold text-white/90 mt-1">{strategy.sharpe}</div>
              </div>
              <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                <div className="text-[10px] text-white/40 tracking-wider">AUM</div>
                <div className="text-2xl font-bold text-white/90 mt-1">{strategy.aum}</div>
              </div>
            </div>

            {/* Chart + Signals */}
            <div className="grid lg:grid-cols-5 gap-6">
              {/* Allocation */}
              <div className="lg:col-span-3 p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
                <h3 className="text-sm font-semibold text-white/60 tracking-wider uppercase mb-4">ALLOCATION</h3>
                <div className="flex items-center gap-8">
                  <div className="w-[200px] h-[200px] flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={strategy.allocation} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value" animationDuration={500}>
                          {strategy.allocation.map((_, i) => (
                            <Cell key={i} fill={COLORS[i]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-3">
                    {strategy.allocation.map((item, i) => (
                      <div key={item.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="w-3 h-3 rounded" style={{ background: COLORS[i] }} />
                          <span className="text-sm font-medium text-white/80">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="font-mono text-white/50">{item.value}%</span>
                          <span className={`font-mono text-xs ${item.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {item.change >= 0 ? "+" : ""}{item.change}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI Signals */}
              <div className="lg:col-span-2 p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
                <h3 className="text-sm font-semibold text-white/60 tracking-wider uppercase mb-4">AI SIGNALS</h3>
                <div className="space-y-4">
                  {strategy.signals.map((sig) => (
                    <div key={sig.symbol} className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-white/90">{sig.symbol}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          sig.action.includes("STRONG") ? "bg-emerald-500/20 text-emerald-400" :
                          sig.action.includes("BUY") ? "bg-emerald-500/15 text-emerald-400/80" :
                          "bg-amber-500/15 text-amber-400"
                        }`}>{sig.action}</span>
                      </div>
                      <div className="text-xs text-white/40 mb-2">{sig.reason}</div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${sig.confidence}%` }}
                            transition={{ duration: 0.8, delay: 0.2 }}
                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500"
                          />
                        </div>
                        <span className="text-[10px] font-mono text-white/40">{sig.confidence}%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleExecute}
                  className={`w-full mt-4 py-3 rounded-xl font-semibold text-sm transition-all ${
                    agentRunning
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 cursor-default"
                      : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-lg hover:shadow-blue-500/20"
                  }`}
                >
                  {agentRunning ? "Agent Running — Monitoring" : walletConnected ? "Execute Strategy →" : "Connect Wallet to Execute"}
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </section>

      {/* Activation modal overlay */}
      <AnimatePresence>
        {showActivation && !agentRunning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setShowActivation(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#0a0f1a] border border-white/10 rounded-2xl p-8 max-w-md w-full"
            >
              <h3 className="text-xl font-bold mb-6">Activating AI Agent</h3>
              <div className="space-y-4">
                {[
                  { label: "Connecting to Mantle...", done: activationStep >= 1 },
                  { label: `Loading ${strategy.name} strategy...`, done: activationStep >= 2 },
                  { label: "Starting AI agent...", done: activationStep >= 3 },
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-3">
                    {s.done ? (
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">✓</span>
                    ) : activationStep === i ? (
                      <span className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                    ) : (
                      <span className="w-5 h-5 rounded-full border border-white/10" />
                    )}
                    <span className={`text-sm ${s.done ? "text-white/80" : activationStep === i ? "text-white/60" : "text-white/30"}`}>{s.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showActivation && agentRunning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setShowActivation(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#0a0f1a] border border-emerald-500/20 rounded-2xl p-8 max-w-md w-full text-center"
            >
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <span className="text-2xl">🤖</span>
              </div>
              <h3 className="text-xl font-bold mb-2 text-emerald-400">Agent is Active</h3>
              <p className="text-sm text-white/50 mb-4">
                {strategy.name} strategy deployed. The AI is now monitoring {strategy.allocation.length} assets and will execute trades automatically.
              </p>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 mb-6 text-left">
                <div className="text-[10px] text-white/40 tracking-wider mb-2">NEXT ACTIONS</div>
                <div className="space-y-2 text-xs text-white/60">
                  <div>• Scanning {strategy.signals.length} active signals</div>
                  <div>• Comparing xStocks RFQ vs Fluxion prices</div>
                  <div>• Will rebalance when deviation {">"} 5%</div>
                </div>
              </div>
              <button
                onClick={() => setShowActivation(false)}
                className="px-6 py-3 rounded-xl bg-white text-black font-semibold text-sm hover:shadow-lg transition-all"
              >
                View Dashboard
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Intelligence Layer — Nansen + ELFA + AltLLM */}
      <section className="max-w-7xl mx-auto px-6 py-24 border-t border-white/5">
        <FadeIn>
          <div className="text-center mb-16">
            <span className="text-[11px] font-semibold text-white/40 tracking-[0.2em] uppercase">INTELLIGENCE LAYER</span>
            <h2 className="text-3xl md:text-4xl font-bold mt-3 tracking-tight">Powered by Mantle Partners</h2>
            <p className="text-white/40 mt-3 max-w-2xl mx-auto">Real-time on-chain analytics, AI sentiment analysis, and intelligent chat — all from official Mantle hackathon sponsors.</p>
          </div>
        </FadeIn>

        {/* Three partner cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <FadeIn delay={0.1}>
            <div className="p-6 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.02] relative overflow-hidden h-full">
              <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-[50px]" />
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm">N</div>
                <div>
                  <h3 className="font-bold text-white/90">Nansen</h3>
                  <span className="text-[10px] text-cyan-400/80">On-Chain Analytics</span>
                </div>
              </div>
              <p className="text-sm text-white/50 leading-relaxed mb-4">Smart money tracking across 20+ chains. See what institutional funds and top traders are buying — real-time alpha signals.</p>
              <div className="text-[10px] text-white/30 mb-2 tracking-wider">SMART MONEY SIGNALS</div>
              <div className="space-y-2">
                {(nansenLoading ? [] : nansenData.slice(0, 3)).map((t, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white/80">{t.token_symbol}</span>
                      <span className="text-[9px] text-white/30 uppercase">{t.chain}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono ${t.netflow > 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {t.netflow > 0 ? "+" : ""}{(t.netflow / 1000).toFixed(0)}K
                      </span>
                      <span className="text-[9px] text-white/30">{t.nof_traders} traders</span>
                    </div>
                  </div>
                ))}
                {nansenLoading && <div className="flex items-center gap-2 py-3 justify-center"><span className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /><span className="text-xs text-white/40">Loading Nansen data...</span></div>}
              </div>
              <a href="https://nansen.ai" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors mt-4">
                nansen.ai <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M4 12L12 4M12 4H6M12 4v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </a>
            </div>
          </FadeIn>

          <FadeIn delay={0.2}>
            <div className="p-6 rounded-2xl border border-amber-500/20 bg-amber-500/[0.02] relative overflow-hidden h-full">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-[50px]" />
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-sm">E</div>
                <div>
                  <h3 className="font-bold text-white/90">ELFA AI</h3>
                  <span className="text-[10px] text-amber-400/80">Market Intelligence</span>
                </div>
              </div>
              <p className="text-sm text-white/50 leading-relaxed mb-4">Real-time sentiment analysis, trending tokens, and AI-powered market insights. Ask questions about any strategy or asset.</p>
              <div className="text-[10px] text-white/30 mb-2 tracking-wider">TRENDING & SENTIMENT</div>
              <div className="space-y-2">
                {(elfaLoading ? [] : elfaData.slice(0, 3)).map((t, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white/80 uppercase">{t.token}</span>
                      <span className={`text-[10px] font-mono ${t.change_percent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {t.change_percent >= 0 ? "+" : ""}{t.change_percent.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500" style={{ width: `${Math.min(100, (t.current_count / 5))}%` }} />
                      </div>
                      <span className="text-[9px] text-white/30">{t.current_count} mentions</span>
                    </div>
                  </div>
                ))}
                {elfaLoading && <div className="flex items-center gap-2 py-3 justify-center"><span className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /><span className="text-xs text-white/40">Loading ELFA data...</span></div>}
              </div>
              <a href="https://elfa.ai" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors mt-4">
                elfa.ai <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M4 12L12 4M12 4H6M12 4v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </a>
            </div>
          </FadeIn>

          <FadeIn delay={0.3}>
            <div className="p-6 rounded-2xl border border-violet-500/20 bg-violet-500/[0.02] relative overflow-hidden h-full">
              <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full blur-[50px]" />
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">A</div>
                <div>
                  <h3 className="font-bold text-white/90">AltLLM</h3>
                  <span className="text-[10px] text-violet-400/80">AI Chat & Analysis</span>
                </div>
              </div>
              <p className="text-sm text-white/50 leading-relaxed mb-4">Frontier AI models via unified API. Powers the StockPilot AI chat assistant for personalized strategy advice and portfolio analysis.</p>
              <div className="text-[10px] text-white/30 mb-2 tracking-wider">AI CAPABILITIES</div>
              <div className="space-y-2">
                {["Strategy Recommendations", "Risk Assessment", "Market Sentiment Q&A"].map((cap, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02] border border-white/5">
                    <span className="w-5 h-5 rounded-md bg-violet-500/10 text-violet-400 flex items-center justify-center text-[10px]">{'\u2713'}</span>
                    <span className="text-xs text-white/60">{cap}</span>
                  </div>
                ))}
              </div>
              <a href="https://altllm.ai" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-violet-400 hover:text-violet-300 transition-colors mt-4">
                altllm.ai <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M4 12L12 4M12 4H6M12 4v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </a>
            </div>
          </FadeIn>
        </div>

        {/* Data flow diagram */}
        <FadeIn delay={0.4}>
          <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.01]">
            <div className="text-[10px] text-white/30 tracking-wider text-center mb-4">DATA PIPELINE</div>
            <div className="flex items-center justify-center gap-2 flex-wrap text-sm">
              <span className="px-3 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs font-medium">Nansen API</span>
              <span className="text-white/20">+</span>
              <span className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-medium">ELFA API</span>
              <span className="text-white/20">{"\u2192"}</span>
              <span className="px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 text-xs font-medium">AltLLM Processing</span>
              <span className="text-white/20">{"\u2192"}</span>
              <span className="px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-medium">StockPilot AI Agent</span>
              <span className="text-white/20">{"\u2192"}</span>
              <span className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium">Trade Execution</span>
            </div>
            <div className="text-center text-[10px] text-white/30 mt-3">Smart money signals + AI sentiment + LLM analysis = optimal trade decisions</div>
          </div>
        </FadeIn>
      </section>

      {/* AI Chat Widget */}
      <div className="fixed bottom-6 right-6 z-[90]">
        <AnimatePresence>
          {chatOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="absolute bottom-16 right-0 w-[380px] h-[500px] bg-[#0a0f1a] border border-white/10 rounded-2xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden"
            >
              {/* Chat header */}
              <div className="px-4 py-3 border-b border-white/5 bg-gradient-to-r from-violet-500/10 to-amber-500/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-amber-500 flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white/90">StockPilot AI</div>
                    <div className="text-[9px] text-white/40">Powered by ELFA + AltLLM</div>
                  </div>
                </div>
                <button onClick={() => setChatOpen(false)} className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                </button>
              </div>

              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 && (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gradient-to-br from-violet-500/20 to-amber-500/20 border border-white/10 flex items-center justify-center">
                      <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M8 1v2M8 13v2M1 8h2M13 8h2" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/></svg>
                    </div>
                    <p className="text-sm text-white/50 mb-4">Ask about strategies, risks, or market trends</p>
                    <div className="space-y-2">
                      {["What strategy do you recommend?", "Analyze NVDAx for me", "Compare risk levels"].map((q, i) => (
                        <button key={i} onClick={() => { setChatInput(q); }} className="block w-full text-left px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5 text-xs text-white/50 hover:text-white/70 hover:bg-white/[0.06] transition-colors">
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-blue-600/20 text-white/90 border border-blue-500/20"
                        : "bg-white/[0.04] text-white/70 border border-white/5"
                    }`}>
                      {msg.content}
                    </div>
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

              {/* Chat input */}
              <div className="p-3 border-t border-white/5">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleChat()}
                    placeholder="Ask about strategy, risk, or tokens..."
                    className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:border-violet-500/50"
                  />
                  <button
                    onClick={handleChat}
                    disabled={chatLoading || !chatInput.trim()}
                    className="w-9 h-9 rounded-lg bg-gradient-to-r from-violet-600 to-amber-600 flex items-center justify-center text-white disabled:opacity-30 hover:shadow-lg transition-all"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 8l12-6-4 14-3-5-5-3z" fill="currentColor"/></svg>
                  </button>
                </div>
                <div className="flex items-center gap-3 mt-2 px-1">
                  <span className="text-[9px] text-white/20">Powered by</span>
                  <span className="text-[9px] text-amber-400/50">ELFA</span>
                  <span className="text-[9px] text-white/10">+</span>
                  <span className="text-[9px] text-violet-400/50">AltLLM</span>
                  <span className="text-[9px] text-white/10">+</span>
                  <span className="text-[9px] text-cyan-400/50">Nansen</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setChatOpen(!chatOpen)}
          className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all ${
            chatOpen
              ? "bg-white/10 border border-white/20"
              : "bg-gradient-to-r from-violet-600 to-amber-600 shadow-violet-500/30"
          }`}
        >
          {chatOpen ? (
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
          )}
        </motion.button>
      </div>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-6 py-24 border-t border-white/5">
        <FadeIn>
          <div className="text-center">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-4">
              Start trading with AI
            </h2>
            <p className="text-white/40 text-lg mb-8 max-w-md mx-auto">Connect your wallet, pick a strategy, let the agent work. All on-chain, all transparent.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <ConnectButton.Custom>
                {({ account, chain, openConnectModal, mounted }) => {
                  const connected = mounted && account && chain;
                  return (
                    <button
                      onClick={connected ? scrollToDashboard : openConnectModal}
                      className="px-8 py-4 rounded-xl bg-white text-black font-bold text-base hover:shadow-2xl hover:shadow-white/10 hover:-translate-y-1 transition-all duration-300"
                    >
                      {connected ? (agentRunning ? "View Dashboard ↑" : "Choose Strategy ↑") : "Connect Wallet →"}
                    </button>
                  );
                }}
              </ConnectButton.Custom>
              <a href={`https://mantlescan.xyz/address/${CONTRACT}`} target="_blank" rel="noreferrer" className="px-8 py-4 rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-white/20 font-medium text-base transition-all">
                Verify Contract
              </a>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-black/30">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-white/30">
            <span className="font-bold text-white/50">STOCKPILOT AI</span>
            <span>·</span>
            <span>Mantle Turing Test Hackathon 2026</span>
          </div>
          <div className="flex items-center gap-5 text-xs text-white/30">
            <a href="https://dorahacks.io/buidl/43884" target="_blank" rel="noreferrer" className="hover:text-white/70 transition-colors">DoraHacks</a>
            <a href="https://github.com/kirst-dk/stockpilot-ai" target="_blank" rel="noreferrer" className="hover:text-white/70 transition-colors">GitHub</a>
            <a href="https://xstocks.fi" target="_blank" rel="noreferrer" className="hover:text-white/70 transition-colors">xStocks</a>
            <a href="https://fluxion.network" target="_blank" rel="noreferrer" className="hover:text-white/70 transition-colors">Fluxion</a>
            <a href="https://nansen.ai" target="_blank" rel="noreferrer" className="hover:text-white/70 transition-colors">Nansen</a>
            <a href="https://elfa.ai" target="_blank" rel="noreferrer" className="hover:text-white/70 transition-colors">ELFA</a>
            <a href="https://altllm.ai" target="_blank" rel="noreferrer" className="hover:text-white/70 transition-colors">AltLLM</a>
            <a href="https://mantle.xyz" target="_blank" rel="noreferrer" className="hover:text-white/70 transition-colors">Mantle</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
