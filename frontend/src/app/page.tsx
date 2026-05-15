"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const CONTRACT = "0x16c5259964C9B2A411aB69dC9DFbcc2EbC7865A9";
const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

const PORTFOLIO = {
  total: 100000,
  invested: 75000,
  cash: 25000,
  pnl: "+12.4%",
  allocation: [
    { name: "SPYx", value: 30, price: 587.42, change: +1.2 },
    { name: "NVDAx", value: 25, price: 131.88, change: +3.4 },
    { name: "AAPLx", value: 15, price: 198.55, change: -0.3 },
    { name: "TSLAx", value: 10, price: 178.22, change: +2.1 },
    { name: "MSFTx", value: 10, price: 442.31, change: +0.8 },
    { name: "AMZNx", value: 10, price: 193.67, change: +1.5 },
  ],
};

const RECOMMENDATIONS = [
  { symbol: "NVDAx", signal: "STRONG BUY", confidence: 87, reasoning: "AI sector momentum. Earnings beat +15%. Institutional accumulation.", color: "emerald" },
  { symbol: "TSLAx", signal: "BUY", confidence: 65, reasoning: "Breakout above $175 resistance. Energy sector rotation.", color: "emerald" },
  { symbol: "SPYx", signal: "HOLD", confidence: 72, reasoning: "Fair value. Maintaining broad market exposure position.", color: "amber" },
  { symbol: "AAPLx", signal: "HOLD", confidence: 68, reasoning: "Services revenue growing. Waiting for WWDC catalyst.", color: "amber" },
];

function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default function Home() {
  const [activeStrategy, setActiveStrategy] = useState(0);
  const [showDashboard, setShowDashboard] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowDashboard(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen">
      {/* Background effects */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-blue-500/[0.07] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[400px] bg-purple-500/[0.05] rounded-full blur-[100px]" />
        <div className="absolute top-1/2 left-0 w-[400px] h-[300px] bg-emerald-500/[0.04] rounded-full blur-[80px]" />
      </div>

      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 12L5 7L8 9L11 4L14 8" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span className="font-semibold text-lg">StockPilot AI</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How it works</a>
            <a href="#dashboard" className="hover:text-foreground transition-colors">Dashboard</a>
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href={`https://mantlescan.xyz/address/${CONTRACT}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Mainnet Live
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="text-center max-w-3xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            Built for Mantle Turing Test Hackathon 2026
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
            Your AI Portfolio Manager
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">
              for Tokenized Stocks
            </span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed mb-8 max-w-2xl mx-auto">
            StockPilot AI autonomously manages your portfolio of tokenized equities on Mantle.
            Choose a strategy, and the AI handles analysis, trading, and rebalancing — all transparent on-chain.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="#dashboard" className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-all hover:shadow-lg hover:shadow-blue-500/25 hover:-translate-y-0.5">
              See Live Dashboard →
            </a>
            <a href="https://github.com/kirst-dk/stockpilot-ai" target="_blank" rel="noreferrer" className="px-6 py-3 rounded-lg border border-border hover:border-muted-foreground/30 text-muted-foreground hover:text-foreground font-medium transition-all hover:-translate-y-0.5">
              View Source Code
            </a>
          </div>
        </motion.div>

        {/* Trust indicators */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="flex flex-wrap items-center justify-center gap-6 mt-12 text-xs text-muted-foreground"
        >
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            On-chain transparent
          </div>
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
            Deployed on Mantle Mainnet
          </div>
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M2 12h20"/></svg>
            6 tokenized equities
          </div>
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            24/7 autonomous
          </div>
        </motion.div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-6 py-20">
        <FadeIn>
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">How It Works</h2>
          <p className="text-muted-foreground text-center mb-12 max-w-lg mx-auto">Three simple steps. The AI does the rest.</p>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { step: "01", title: "Choose a Strategy", desc: "Pick from Balanced Growth, Momentum Trading, or Value Investing based on your risk tolerance.", icon: "⚡" },
            { step: "02", title: "AI Analyzes Markets", desc: "GPT-4o-mini processes real-time data from xStocks and Fluxion DEX to find opportunities.", icon: "🧠" },
            { step: "03", title: "Trades Execute On-Chain", desc: "Every buy, sell, and rebalance is recorded on Mantle. Full transparency, full control.", icon: "🔗" },
          ].map((item, i) => (
            <FadeIn key={i} delay={i * 0.15}>
              <div className="group relative p-6 rounded-xl border border-border bg-card/50 hover:bg-card hover:border-border/80 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-500/5">
                <div className="absolute top-4 right-4 text-xs font-mono text-muted-foreground/50">{item.step}</div>
                <div className="text-3xl mb-4">{item.icon}</div>
                <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* Dashboard */}
      <section id="dashboard" className="max-w-6xl mx-auto px-6 py-20">
        <FadeIn>
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">Live Dashboard</h2>
          <p className="text-muted-foreground text-center mb-12 max-w-lg mx-auto">Real-time portfolio tracking with AI-powered recommendations.</p>
        </FadeIn>

        {/* Strategy Selector */}
        <FadeIn delay={0.1}>
          <div className="flex flex-wrap gap-3 mb-8 justify-center">
            {["Balanced Growth", "Momentum Trading", "Value Investing"].map((name, i) => (
              <button
                key={i}
                onClick={() => setActiveStrategy(i)}
                className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeStrategy === i
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/25"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </FadeIn>

        {/* Stats */}
        <FadeIn delay={0.2}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Portfolio Value", value: "$100,000", sub: "Total AUM" },
              { label: "Return", value: "+12.4%", sub: "Since inception", color: "text-emerald-400" },
              { label: "Cash Available", value: "$25,000", sub: "USDC on Mantle" },
              { label: "Active Signals", value: "4", sub: "AI recommendations" },
            ].map((stat, i) => (
              <div key={i} className="p-4 rounded-xl border border-border bg-card/50">
                <div className="text-xs text-muted-foreground mb-1">{stat.label}</div>
                <div className={`text-xl md:text-2xl font-bold ${stat.color || ""}`}>{stat.value}</div>
                <div className="text-xs text-muted-foreground/70 mt-0.5">{stat.sub}</div>
              </div>
            ))}
          </div>
        </FadeIn>

        {/* Portfolio + Recommendations */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Allocation */}
          <FadeIn delay={0.3}>
            <div className="p-6 rounded-xl border border-border bg-card/50">
              <h3 className="font-semibold mb-4">Portfolio Allocation</h3>
              <div className="flex items-center gap-6">
                <div className="w-[180px] h-[180px] flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={PORTFOLIO.allocation} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2} dataKey="value">
                        {PORTFOLIO.allocation.map((_, i) => (
                          <Cell key={i} fill={COLORS[i]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "hsl(224 71% 6%)", border: "1px solid hsl(216 34% 17%)", borderRadius: "8px", fontSize: "12px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2">
                  {PORTFOLIO.allocation.map((item, i) => (
                    <div key={item.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS[i] }} />
                        <span className="text-muted-foreground">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs">${item.price}</span>
                        <span className={`text-xs font-medium ${item.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {item.change >= 0 ? "+" : ""}{item.change}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </FadeIn>

          {/* AI Recommendations */}
          <FadeIn delay={0.4}>
            <div className="p-6 rounded-xl border border-border bg-card/50">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">AI Recommendations</h3>
                <button className="px-3 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors">
                  Execute All
                </button>
              </div>
              <div className="space-y-3">
                {RECOMMENDATIONS.map((rec) => (
                  <div key={rec.symbol} className="p-3 rounded-lg border border-border/50 bg-background/50 hover:border-border transition-colors">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-sm">{rec.symbol}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        rec.signal.includes("BUY") ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                      }`}>{rec.signal}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{rec.reasoning}</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-border">
                        <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500" style={{ width: `${rec.confidence}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium">{rec.confidence}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-20">
        <FadeIn>
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">Why StockPilot AI?</h2>
          <p className="text-muted-foreground text-center mb-12 max-w-lg mx-auto">Powered by the Mantle ecosystem for maximum performance.</p>
        </FadeIn>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { title: "xStocks Integration", desc: "Trade SPYx, NVDAx, AAPLx, TSLAx, MSFTx, AMZNx. 1:1 backed by real equities with Proof of Reserves.", tag: "Primary Market" },
            { title: "Fluxion DEX", desc: "Smart routing across V2/V3 AMM pools. Multi fee-tier discovery for optimal execution on secondary markets.", tag: "Secondary Market" },
            { title: "GPT-4o-mini Intelligence", desc: "Macro analysis, technical indicators, sentiment scoring. Constantly learning and adapting strategies.", tag: "AI Engine" },
            { title: "On-Chain Transparency", desc: "Every trade recorded on Mantle. Verify any decision the agent makes. No black boxes.", tag: "Trust" },
            { title: "3 Risk Profiles", desc: "Balanced (5/10), Momentum (6/10), Value (4/10). Pick what matches your goals and risk appetite.", tag: "Strategies" },
            { title: "Auto-Rebalancing", desc: "24/7 monitoring and portfolio rebalancing. The agent never sleeps, so your portfolio stays optimal.", tag: "Automation" },
          ].map((feature, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div className="group p-5 rounded-xl border border-border bg-card/30 hover:bg-card/60 hover:border-border/80 transition-all duration-300 hover:-translate-y-0.5">
                <div className="text-[10px] font-medium text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded inline-block mb-3">{feature.tag}</div>
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <FadeIn>
          <div className="relative p-10 md:p-14 rounded-2xl border border-border bg-gradient-to-br from-blue-500/[0.08] via-card to-purple-500/[0.05] text-center overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.08),transparent_70%)]" />
            <div className="relative">
              <h2 className="text-2xl md:text-3xl font-bold mb-4">Ready to let AI manage your portfolio?</h2>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                Transparent, autonomous, on-chain. Check out the code and the verified contract on Mantle.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <a href="https://github.com/kirst-dk/stockpilot-ai" target="_blank" rel="noreferrer" className="px-6 py-3 rounded-lg bg-foreground text-background font-medium hover:opacity-90 transition-all hover:-translate-y-0.5">
                  GitHub Repository
                </a>
                <a href={`https://mantlescan.xyz/address/${CONTRACT}`} target="_blank" rel="noreferrer" className="px-6 py-3 rounded-lg border border-border hover:border-muted-foreground/30 text-muted-foreground hover:text-foreground font-medium transition-all hover:-translate-y-0.5">
                  View Contract →
                </a>
              </div>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M2 12L5 7L8 9L11 4L14 8" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            StockPilot AI · Mantle Turing Test 2026
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <a href="https://dorahacks.io/buidl/43884" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">DoraHacks</a>
            <a href="https://github.com/kirst-dk/stockpilot-ai" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">GitHub</a>
            <a href="https://xstocks.fi" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">xStocks</a>
            <a href="https://fluxion.network" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">Fluxion</a>
            <a href="https://mantle.xyz" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">Mantle</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
