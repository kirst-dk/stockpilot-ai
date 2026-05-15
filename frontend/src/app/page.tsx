"use client";

import { useState, useEffect, useCallback } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const API_BASE = "/api";

const MOCK_DATA = {
  portfolio: {
    total_value_usd: 100000,
    cash_usd: 25000,
    positions: { SPYx: 0.3, NVDAx: 0.25, AAPLx: 0.15, TSLAx: 0.1, MSFTx: 0.1, AMZNx: 0.1 },
    strategy: "balanced",
  },
  market_data: {
    prices: { SPYx: 587.42, NVDAx: 131.88, AAPLx: 198.55, TSLAx: 178.22, MSFTx: 442.31, AMZNx: 193.67 },
  },
  recommendations: [
    { symbol: "NVDAx", signal: "strong_buy", confidence: 0.87, target_weight: 0.25, reasoning: "Strong momentum with AI sector tailwinds. Earnings beat expectations, institutional accumulation detected.", price_usd: 131.88 },
    { symbol: "SPYx", signal: "hold", confidence: 0.72, target_weight: 0.3, reasoning: "Market at fair value. Maintaining core position for broad market exposure.", price_usd: 587.42 },
    { symbol: "TSLAx", signal: "buy", confidence: 0.65, target_weight: 0.1, reasoning: "Technical breakout above resistance. Energy sector rotation favorable.", price_usd: 178.22 },
    { symbol: "AAPLx", signal: "hold", confidence: 0.68, target_weight: 0.15, reasoning: "Stable position. Services revenue growing. Awaiting next catalyst.", price_usd: 198.55 },
  ],
  target_allocation: { SPYx: 0.3, NVDAx: 0.25, AAPLx: 0.15, TSLAx: 0.1, MSFTx: 0.1, AMZNx: 0.1 },
};

const MOCK_HISTORY = [
  { action: "BUY", symbol: "NVDAx", amount: 15.2, value_usd: 2004.58, price: 131.88, reasoning: "AI sector momentum play, strong earnings outlook" },
  { action: "BUY", symbol: "SPYx", amount: 5.1, value_usd: 2995.84, price: 587.42, reasoning: "Core portfolio allocation, broad market exposure" },
  { action: "SELL", symbol: "TSLAx", amount: 3.0, value_usd: 534.66, price: 178.22, reasoning: "Take partial profits after 12% gain" },
  { action: "BUY", symbol: "AAPLx", amount: 7.5, value_usd: 1489.13, price: 198.55, reasoning: "Value entry on services growth thesis" },
];

interface Recommendation {
  symbol: string;
  signal: string;
  confidence: number;
  target_weight: number;
  reasoning: string;
  price_usd: number;
}

interface AnalysisResult {
  portfolio: {
    total_value_usd: number;
    cash_usd: number;
    positions: Record<string, number>;
    strategy: string;
  };
  market_data: { prices: Record<string, number> };
  recommendations: Recommendation[];
  target_allocation: Record<string, number>;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

const STRATEGIES = [
  { id: "balanced", name: "Balanced Growth", risk: "5/10", desc: "Diversified allocation with stop-loss protection" },
  { id: "momentum", name: "Momentum Trading", risk: "6/10", desc: "Follows price trends and market momentum" },
  { id: "value", name: "Value Investing", risk: "4/10", desc: "Mean reversion strategy for undervalued assets" },
];

const CONTRACT = "0x16c5259964C9B2A411aB69dC9DFbcc2EbC7865A9";

export default function Home() {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [strategy, setStrategy] = useState("balanced");
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [useMock, setUseMock] = useState(false);

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/analyze`);
      if (res.ok) {
        const data = await res.json();
        setAnalysis(data);
        setUseMock(false);
      } else {
        setAnalysis(MOCK_DATA as any);
        setHistory(MOCK_HISTORY);
        setUseMock(true);
      }
    } catch {
      setAnalysis(MOCK_DATA as any);
      setHistory(MOCK_HISTORY);
      setUseMock(true);
    }
    setLoading(false);
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/history`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch {
      if (history.length === 0) setHistory(MOCK_HISTORY);
    }
  }, [history.length]);

  const changeStrategy = async (name: string) => {
    setStrategy(name);
    if (!useMock) {
      try {
        await fetch(`${API_BASE}/strategy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ strategy: name }),
        });
        await fetchAnalysis();
      } catch { /* use current data */ }
    }
  };

  const executeAll = async () => {
    if (!analysis?.recommendations) return;
    setExecuting(true);
    if (!useMock) {
      try {
        const res = await fetch(`${API_BASE}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recommendations: analysis.recommendations }),
        });
        if (res.ok) {
          await fetchAnalysis();
          await fetchHistory();
        }
      } catch { /* noop */ }
    }
    setTimeout(() => setExecuting(false), 1500);
  };

  useEffect(() => {
    fetchAnalysis();
    fetchHistory();
  }, [fetchAnalysis, fetchHistory]);

  const portfolio = analysis?.portfolio;
  const prices = analysis?.market_data?.prices || {};
  const recommendations = analysis?.recommendations || [];
  const targetAlloc = analysis?.target_allocation || {};

  const totalValue = portfolio?.total_value_usd || 0;
  const cashValue = portfolio?.cash_usd || 0;
  const investedValue = totalValue - cashValue;

  const pieData = Object.entries(targetAlloc).map(([name, value]) => ({
    name,
    value: Math.round((value as number) * 100),
  }));

  return (
    <div className="app">
      {/* Ambient background */}
      <div className="ambient-bg" />

      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="logo-group">
            <div className="logo-icon">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="8" fill="url(#grad)" />
                <path d="M8 22L12 14L16 18L20 10L24 16" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="24" cy="10" r="2" fill="#10b981" />
                <defs><linearGradient id="grad" x1="0" y1="0" x2="32" y2="32"><stop stopColor="#3b82f6" /><stop offset="1" stopColor="#8b5cf6" /></linearGradient></defs>
              </svg>
            </div>
            <div>
              <h1>StockPilot AI</h1>
              <p className="header-subtitle">Autonomous AI Portfolio Manager on Mantle</p>
            </div>
          </div>
        </div>
        <div className="header-right">
          <div className="network-badge">
            <span className="pulse-dot" />
            Mantle Mainnet
          </div>
          <a href={`https://mantlescan.xyz/address/${CONTRACT}`} target="_blank" rel="noreferrer" className="contract-link">
            {CONTRACT.slice(0, 6)}...{CONTRACT.slice(-4)}
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h2>AI-Powered xStocks Portfolio Management</h2>
          <p>
            Autonomous agent managing tokenized equities with GPT-4o-mini intelligence,
            xStocks Atomic RFQ primary market, and Fluxion Network DEX secondary market.
            Every trade recorded on-chain for full transparency.
          </p>
          <div className="hero-badges">
            <span className="hero-badge">AI x RWA</span>
            <span className="hero-badge">xStocks Integration</span>
            <span className="hero-badge">Fluxion DEX</span>
            <span className="hero-badge">On-Chain Transparent</span>
          </div>
        </div>
        {useMock && (
          <div className="demo-banner">
            <span className="demo-icon">i</span>
            Demo Mode — Showing simulated data. Connect backend for live trading.
          </div>
        )}
      </section>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card stat-primary">
          <div className="stat-icon">$</div>
          <div className="stat-info">
            <span className="stat-label">Portfolio Value</span>
            <span className="stat-value">${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">↗</div>
          <div className="stat-info">
            <span className="stat-label">Invested</span>
            <span className="stat-value">${investedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">◎</div>
          <div className="stat-info">
            <span className="stat-label">Cash (USDC)</span>
            <span className="stat-value">${cashValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⚡</div>
          <div className="stat-info">
            <span className="stat-label">Active Signals</span>
            <span className="stat-value">{recommendations.length}</span>
          </div>
        </div>
      </div>

      {/* Strategy Section */}
      <section className="section">
        <h3 className="section-title">Trading Strategy</h3>
        <div className="strategy-grid">
          {STRATEGIES.map((s) => (
            <button
              key={s.id}
              className={`strategy-card ${strategy === s.id ? "active" : ""}`}
              onClick={() => changeStrategy(s.id)}
            >
              <div className="strategy-name">{s.name}</div>
              <div className="strategy-risk">Risk: {s.risk}</div>
              <div className="strategy-desc">{s.desc}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Main Content */}
      <div className="main-grid">
        {/* Left: Chart + Market Data */}
        <div className="panel">
          <div className="panel-header">
            <h3>Portfolio Allocation</h3>
            <button className="btn-refresh" onClick={fetchAnalysis} disabled={loading}>
              {loading ? "..." : "↻"}
            </button>
          </div>

          <div className="chart-container">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => `${value}%`}
                  contentStyle={{ background: "#1a1f35", border: "1px solid #1e293b", borderRadius: 8 }}
                  labelStyle={{ color: "#f1f5f9" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="chart-legend">
              {pieData.map((item, i) => (
                <div key={item.name} className="legend-item">
                  <span className="legend-dot" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="legend-label">{item.name}</span>
                  <span className="legend-value">{item.value}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Market Prices */}
          <div className="panel-section">
            <h4 className="panel-subtitle">xStocks Market</h4>
            <div className="market-list">
              {Object.entries(prices).map(([symbol, price]) => (
                <div key={symbol} className="market-item">
                  <div className="market-symbol">
                    <span className="symbol-badge">{symbol.replace("x", "")}</span>
                    {symbol}
                  </div>
                  <div className="market-price">${(price as number).toFixed(2)}</div>
                  <div className="market-weight">{((targetAlloc[symbol] || 0) as number * 100).toFixed(0)}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: AI Recommendations */}
        <div className="panel">
          <div className="panel-header">
            <h3>AI Recommendations</h3>
            <button
              className="btn-execute"
              onClick={executeAll}
              disabled={executing || recommendations.length === 0}
            >
              {executing ? "Executing..." : "Execute All"}
            </button>
          </div>

          <div className="recommendations-list">
            {recommendations.length === 0 ? (
              <div className="empty-state">Portfolio is balanced — no actions needed</div>
            ) : (
              recommendations.map((rec, i) => (
                <div className="rec-card" key={i}>
                  <div className="rec-top">
                    <div className="rec-symbol">{rec.symbol}</div>
                    <span className={`signal-badge signal-${rec.signal}`}>
                      {rec.signal.replace("_", " ")}
                    </span>
                  </div>
                  <div className="rec-reasoning">{rec.reasoning}</div>
                  <div className="rec-footer">
                    <span className="rec-meta-item">
                      <span className="meta-label">Price</span>
                      ${rec.price_usd.toFixed(2)}
                    </span>
                    <span className="rec-meta-item">
                      <span className="meta-label">Confidence</span>
                      {(rec.confidence * 100).toFixed(0)}%
                    </span>
                    <span className="rec-meta-item">
                      <span className="meta-label">Target</span>
                      {(rec.target_weight * 100).toFixed(0)}%
                    </span>
                    <div className="confidence-bar">
                      <div className="confidence-fill" style={{ width: `${rec.confidence * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Fluxion DEX Integration */}
      <section className="section">
        <h3 className="section-title">Ecosystem Integration</h3>
        <div className="eco-grid">
          <div className="eco-card">
            <div className="eco-header">
              <span className="eco-icon">⚡</span>
              <div>
                <h4>xStocks — Primary Market</h4>
                <span className="eco-tag">Atomic RFQ</span>
              </div>
            </div>
            <p>Instant mint & redeem xStock tokens via xChange protocol. 1:1 backed by real equities with Proof of Reserves.</p>
            <div className="eco-assets">SPYx · NVDAx · AAPLx · TSLAx · MSFTx · AMZNx</div>
          </div>
          <div className="eco-card">
            <div className="eco-header">
              <span className="eco-icon">🔄</span>
              <div>
                <h4>Fluxion — Secondary Market</h4>
                <span className="eco-tag">AMM V2/V3</span>
              </div>
            </div>
            <p>Smart routing across V2 and V3 liquidity pools on Mantle&apos;s core DEX. Multi fee-tier discovery for optimal execution.</p>
            <div className="eco-assets">0.01% · 0.05% · 0.3% · 1% fee tiers</div>
          </div>
          <div className="eco-card">
            <div className="eco-header">
              <span className="eco-icon">🧠</span>
              <div>
                <h4>AI Engine — GPT-4o-mini</h4>
                <span className="eco-tag">Intelligence</span>
              </div>
            </div>
            <p>Macro analysis, technical indicators, and market sentiment powered by OpenAI. Enhanced trading recommendations.</p>
            <div className="eco-assets">3 strategies · Risk management · Auto-rebalance</div>
          </div>
        </div>
      </section>

      {/* Trade History */}
      <section className="section">
        <div className="panel">
          <div className="panel-header">
            <h3>On-Chain Trade History</h3>
            <span className="panel-meta">Recorded on Mantle for full transparency</span>
          </div>
          {history.length === 0 ? (
            <div className="empty-state">No trades executed yet</div>
          ) : (
            <div className="history-list">
              {history.slice().reverse().map((action, i) => (
                <div className="history-item" key={i}>
                  <span className={`signal-badge signal-${action.action === "BUY" ? "buy" : "sell"}`}>
                    {action.action}
                  </span>
                  <span className="history-symbol">{action.symbol}</span>
                  <span className="history-amount">{action.amount?.toFixed(4)} tokens</span>
                  <span className="history-value">${action.value_usd?.toFixed(2)}</span>
                  <span className="history-reason">{action.reasoning}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-links">
          <a href="https://dorahacks.io/buidl/43884" target="_blank" rel="noreferrer">DoraHacks BUIDL</a>
          <span className="footer-sep">·</span>
          <a href="https://github.com/kirst-dk/stockpilot-ai" target="_blank" rel="noreferrer">GitHub</a>
          <span className="footer-sep">·</span>
          <a href={`https://mantlescan.xyz/address/${CONTRACT}`} target="_blank" rel="noreferrer">Contract</a>
          <span className="footer-sep">·</span>
          <a href="https://xstocks.fi" target="_blank" rel="noreferrer">xStocks</a>
          <span className="footer-sep">·</span>
          <a href="https://fluxion.network" target="_blank" rel="noreferrer">Fluxion</a>
          <span className="footer-sep">·</span>
          <a href="https://mantle.xyz" target="_blank" rel="noreferrer">Mantle</a>
        </div>
        <p className="footer-copy">
          StockPilot AI — Built for Mantle Turing Test Hackathon 2026 | AI x RWA Track
        </p>
      </footer>
    </div>
  );
}
