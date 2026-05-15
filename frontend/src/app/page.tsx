"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

const CONTRACT = "0x16c5259964C9B2A411aB69dC9DFbcc2EbC7865A9";
const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

const STRATEGIES = [
  {
    id: "balanced",
    name: "Balanced Growth",
    risk: "5/10",
    desc: "Diversified exposure across sectors with automatic stop-loss protection",
    returnPct: "+12.4%",
    sharpe: "1.82",
    allocation: [
      { name: "SPYx", value: 30, price: 587.42, change: +1.2 },
      { name: "NVDAx", value: 25, price: 131.88, change: +3.4 },
      { name: "AAPLx", value: 15, price: 198.55, change: -0.3 },
      { name: "TSLAx", value: 10, price: 178.22, change: +2.1 },
      { name: "MSFTx", value: 10, price: 442.31, change: +0.8 },
      { name: "AMZNx", value: 10, price: 193.67, change: +1.5 },
    ],
    signals: [
      { symbol: "NVDAx", action: "STRONG BUY", confidence: 87 },
      { symbol: "TSLAx", action: "BUY", confidence: 65 },
      { symbol: "SPYx", action: "HOLD", confidence: 72 },
    ],
  },
  {
    id: "momentum",
    name: "Momentum Trading",
    risk: "6/10",
    desc: "Follows price trends and sector rotations for maximum short-term gains",
    returnPct: "+18.7%",
    sharpe: "1.54",
    allocation: [
      { name: "NVDAx", value: 35, price: 131.88, change: +3.4 },
      { name: "TSLAx", value: 25, price: 178.22, change: +2.1 },
      { name: "AMZNx", value: 20, price: 193.67, change: +1.5 },
      { name: "SPYx", value: 10, price: 587.42, change: +1.2 },
      { name: "AAPLx", value: 5, price: 198.55, change: -0.3 },
      { name: "MSFTx", value: 5, price: 442.31, change: +0.8 },
    ],
    signals: [
      { symbol: "NVDAx", action: "STRONG BUY", confidence: 92 },
      { symbol: "TSLAx", action: "BUY", confidence: 78 },
      { symbol: "AMZNx", action: "BUY", confidence: 71 },
    ],
  },
  {
    id: "value",
    name: "Value Investing",
    risk: "4/10",
    desc: "Mean reversion strategy targeting undervalued assets with high dividend yield",
    returnPct: "+8.2%",
    sharpe: "2.14",
    allocation: [
      { name: "SPYx", value: 35, price: 587.42, change: +1.2 },
      { name: "MSFTx", value: 25, price: 442.31, change: +0.8 },
      { name: "AAPLx", value: 20, price: 198.55, change: -0.3 },
      { name: "AMZNx", value: 10, price: 193.67, change: +1.5 },
      { name: "NVDAx", value: 5, price: 131.88, change: +3.4 },
      { name: "TSLAx", value: 5, price: 178.22, change: +2.1 },
    ],
    signals: [
      { symbol: "MSFTx", action: "BUY", confidence: 74 },
      { symbol: "SPYx", action: "HOLD", confidence: 82 },
      { symbol: "AAPLx", action: "HOLD", confidence: 69 },
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

function AnimatedCounter({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const end = value;
    const duration = 1500;
    const step = (end - start) / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setCount(end); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [isInView, value]);
  return <span ref={ref}>{prefix}{count.toLocaleString()}{suffix}</span>;
}

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
  const [walletConnected, setWalletConnected] = useState(false);
  const [step, setStep] = useState(0); // 0: landing, 1: strategy, 2: dashboard

  const strategy = STRATEGIES[activeStrategy];

  return (
    <div className="min-h-screen bg-[#030712] text-white overflow-x-hidden">
      {/* Animated background grid */}
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
            <a href={`https://mantlescan.xyz/address/${CONTRACT}`} target="_blank" rel="noreferrer" className="hidden md:flex items-center gap-1.5 text-xs text-emerald-400/80 hover:text-emerald-400 transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Mainnet
            </a>
            <button
              onClick={() => { setWalletConnected(true); setStep(1); }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${
                walletConnected
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  : "bg-white text-black hover:bg-white/90 hover:shadow-lg hover:shadow-white/10 hover:-translate-y-0.5"
              }`}
            >
              {walletConnected ? "0x25F8...19cF" : "Connect Wallet"}
            </button>
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
            <button
              onClick={() => { setWalletConnected(true); setStep(1); }}
              className="group px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-base transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/25 hover:-translate-y-1 flex items-center gap-2"
            >
              {walletConnected ? "Choose Strategy" : "Connect Wallet & Start"}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="group-hover:translate-x-1 transition-transform"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <a href="https://github.com/kirst-dk/stockpilot-ai" target="_blank" rel="noreferrer" className="px-8 py-4 rounded-xl border border-white/10 text-white/70 hover:text-white hover:border-white/20 font-medium text-base transition-all duration-300 hover:-translate-y-0.5">
              View Source
            </a>
          </div>
        </motion.div>

        {/* Floating stats */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.6 }} className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "ASSETS MANAGED", value: "$100K+", sub: "across 6 xStocks" },
            { label: "AI SIGNALS", value: "24/7", sub: "GPT-4o-mini powered" },
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

      {/* How it works - 3 steps */}
      <section className="max-w-7xl mx-auto px-6 py-24 border-t border-white/5">
        <FadeIn>
          <div className="text-center mb-16">
            <span className="text-[11px] font-semibold text-white/40 tracking-[0.2em] uppercase">HOW IT WORKS</span>
            <h2 className="text-3xl md:text-4xl font-bold mt-3 tracking-tight">Three steps. AI does the rest.</h2>
          </div>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { step: "01", title: "Connect Wallet", desc: "Link your Mantle wallet. Your funds stay in your control — the agent operates through a transparent smart contract.", icon: "🔗", active: step >= 0 },
            { step: "02", title: "Choose Strategy", desc: "Balanced Growth, Momentum Trading, or Value Investing. Each has different risk/reward profiles.", icon: "⚡", active: step >= 1 },
            { step: "03", title: "AI Trades for You", desc: "The agent analyzes markets 24/7, executes trades via xStocks RFQ and Fluxion DEX, all on-chain.", icon: "🤖", active: step >= 2 },
          ].map((item, i) => (
            <FadeIn key={i} delay={i * 0.15}>
              <div className={`relative p-8 rounded-2xl border transition-all duration-500 ${item.active ? "border-blue-500/30 bg-blue-500/[0.03]" : "border-white/5 bg-white/[0.01]"} hover:border-white/15 hover:-translate-y-1`}>
                <div className="absolute top-6 right-6 text-[11px] font-mono text-white/20">{item.step}</div>
                <div className="text-4xl mb-5">{item.icon}</div>
                <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                <p className="text-sm text-white/50 leading-relaxed">{item.desc}</p>
                {item.active && <div className="absolute bottom-0 left-6 right-6 h-0.5 bg-gradient-to-r from-blue-500 to-transparent rounded-full" />}
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* Strategy selector + Dashboard */}
      <section id="dashboard" className="max-w-7xl mx-auto px-6 py-24 border-t border-white/5">
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
                <div className="text-[10px] text-white/40 tracking-wider">PORTFOLIO</div>
                <div className="text-2xl font-bold text-white/90 mt-1">$100K</div>
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
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-white/90">{sig.symbol}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          sig.action.includes("STRONG") ? "bg-emerald-500/20 text-emerald-400" :
                          sig.action.includes("BUY") ? "bg-emerald-500/15 text-emerald-400/80" :
                          "bg-amber-500/15 text-amber-400"
                        }`}>{sig.action}</span>
                      </div>
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
                  onClick={() => setStep(2)}
                  className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-sm hover:shadow-lg hover:shadow-blue-500/20 transition-all"
                >
                  Execute Strategy →
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </section>

      {/* Ecosystem */}
      <section className="max-w-7xl mx-auto px-6 py-24 border-t border-white/5">
        <FadeIn>
          <div className="text-center mb-16">
            <span className="text-[11px] font-semibold text-white/40 tracking-[0.2em] uppercase">ECOSYSTEM</span>
            <h2 className="text-3xl md:text-4xl font-bold mt-3 tracking-tight">Built on Mantle&apos;s best infrastructure</h2>
          </div>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { title: "xStocks", sub: "Primary Market", desc: "Mint & redeem tokenized equities via Atomic RFQ. 1:1 backed by real stocks.", link: "https://xstocks.fi", tag: "INSTANT SETTLEMENT" },
            { title: "Fluxion Network", sub: "Secondary Market", desc: "Smart routing across V2/V3 AMM pools. Multi fee-tier for optimal execution.", link: "https://fluxion.network", tag: "BEST PRICE" },
            { title: "GPT-4o-mini", sub: "AI Engine", desc: "Macro analysis, technical indicators, and sentiment scoring. 24/7 signal generation.", link: "#", tag: "ALWAYS ON" },
          ].map((item, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <a href={item.link} target="_blank" rel="noreferrer" className="group block p-8 rounded-2xl border border-white/5 bg-white/[0.01] hover:border-white/15 hover:bg-white/[0.03] transition-all duration-300 hover:-translate-y-1">
                <div className="text-[9px] font-bold text-blue-400/70 tracking-[0.2em] mb-3">{item.tag}</div>
                <h3 className="text-xl font-bold mb-1 group-hover:text-blue-400 transition-colors">{item.title}</h3>
                <div className="text-sm text-white/40 mb-3">{item.sub}</div>
                <p className="text-sm text-white/50 leading-relaxed">{item.desc}</p>
              </a>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-6 py-24 border-t border-white/5">
        <FadeIn>
          <div className="text-center">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-4">
              Start trading with AI
            </h2>
            <p className="text-white/40 text-lg mb-8 max-w-md mx-auto">Connect your wallet, pick a strategy, let the agent work. All on-chain, all transparent.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => { setWalletConnected(true); setStep(1); }}
                className="px-8 py-4 rounded-xl bg-white text-black font-bold text-base hover:shadow-2xl hover:shadow-white/10 hover:-translate-y-1 transition-all duration-300"
              >
                {walletConnected ? "Go to Dashboard ↑" : "Connect Wallet →"}
              </button>
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
            <a href="https://mantle.xyz" target="_blank" rel="noreferrer" className="hover:text-white/70 transition-colors">Mantle</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
