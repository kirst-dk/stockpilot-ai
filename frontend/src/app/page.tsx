"use client";

import { useState, useEffect, useCallback } from "react";

const API_BASE = "/api";

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
  market_data: {
    prices: Record<string, number>;
  };
  recommendations: Recommendation[];
  target_allocation: Record<string, number>;
}

const ALLOCATION_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899",
];

export default function Home() {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [strategy, setStrategy] = useState("balanced");
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/analyze`);
      if (res.ok) {
        const data = await res.json();
        setAnalysis(data);
      }
    } catch (e) {
      console.error("Failed to fetch analysis:", e);
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
    } catch (e) {
      console.error("Failed to fetch history:", e);
    }
  }, []);

  const changeStrategy = async (name: string) => {
    try {
      const res = await fetch(`${API_BASE}/strategy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: name }),
      });
      if (res.ok) {
        setStrategy(name);
        await fetchAnalysis();
      }
    } catch (e) {
      console.error("Failed to change strategy:", e);
    }
  };

  const executeAll = async () => {
    if (!analysis?.recommendations) return;
    setExecuting(true);
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
    } catch (e) {
      console.error("Failed to execute:", e);
    }
    setExecuting(false);
  };

  useEffect(() => {
    fetchAnalysis();
    fetchHistory();
  }, [fetchAnalysis, fetchHistory]);

  const portfolio = analysis?.portfolio;
  const prices = analysis?.market_data?.prices || {};
  const recommendations = analysis?.recommendations || [];
  const targetAlloc = analysis?.target_allocation || {};

  // Calculate portfolio metrics
  const totalValue = portfolio?.total_value_usd || 0;
  const cashValue = portfolio?.cash_usd || 0;
  const investedValue = totalValue - cashValue;
  const positionCount = Object.keys(portfolio?.positions || {}).length;

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <h1>StockPilot AI</h1>
          <p>AI-Powered xStocks Portfolio Manager on Mantle Network</p>
        </div>
        <div className="header-right">
          <span className="badge badge-mantle">Mantle Network</span>
          <span className="badge badge-rwa">AI x RWA</span>
          <span className="badge badge-live">Agent Active</span>
        </div>
      </header>

      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Portfolio Value</div>
          <div className="stat-value">${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div className="stat-change neutral">Simulated Capital</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Invested</div>
          <div className="stat-value">${investedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div className="stat-change neutral">{positionCount} positions</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Cash Available</div>
          <div className="stat-value">${cashValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div className="stat-change neutral">USDC on Mantle</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Strategy</div>
          <div className="stat-value" style={{ fontSize: 20 }}>
            {strategy.charAt(0).toUpperCase() + strategy.slice(1)}
          </div>
          <div className="stat-change neutral">{recommendations.length} signals</div>
        </div>
      </div>

      {/* Strategy Selector */}
      <div className="section">
        <h2 className="section-title">Trading Strategy</h2>
        <div className="strategy-selector">
          {["balanced", "momentum", "value"].map((s) => (
            <button
              key={s}
              className={`strategy-btn ${strategy === s ? "active" : ""}`}
              onClick={() => changeStrategy(s)}
            >
              {s === "balanced" ? "Balanced Growth" : s === "momentum" ? "Momentum" : "Value Investing"}
            </button>
          ))}
          <button className="btn btn-outline btn-sm" onClick={fetchAnalysis} disabled={loading}>
            {loading ? "Analyzing..." : "Refresh Analysis"}
          </button>
        </div>
      </div>

      <div className="grid grid-2">
        {/* Market Prices */}
        <div className="card section">
          <div className="card-header">
            <span className="card-title">xStocks Market Prices</span>
            <span className="badge badge-mantle" style={{ fontSize: 11 }}>Live via xStocks API</span>
          </div>
          {loading ? (
            <div className="loading">
              <div className="spinner" />
              Fetching prices...
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Price (USD)</th>
                    <th>Target Weight</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(prices).map(([symbol, price]) => (
                    <tr key={symbol}>
                      <td style={{ fontWeight: 600 }}>{symbol}</td>
                      <td>${(price as number).toFixed(2)}</td>
                      <td>{((targetAlloc[symbol] || 0) * 100).toFixed(0)}%</td>
                      <td>
                        <span
                          className={`rec-signal signal-${
                            (portfolio?.positions || {})[symbol] ? "buy" : "hold"
                          }`}
                        >
                          {(portfolio?.positions || {})[symbol] ? "Held" : "Watching"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Allocation Bar */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
              Target Allocation
            </div>
            <div className="allocation-bar">
              {Object.entries(targetAlloc).map(([symbol, weight], i) => (
                <div
                  key={symbol}
                  className="allocation-segment"
                  style={{
                    width: `${(weight as number) * 100}%`,
                    background: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
                  }}
                  title={`${symbol}: ${((weight as number) * 100).toFixed(0)}%`}
                />
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
              {Object.entries(targetAlloc).map(([symbol, weight], i) => (
                <div key={symbol} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
                    }}
                  />
                  <span style={{ color: "var(--text-muted)" }}>
                    {symbol} {((weight as number) * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Recommendations */}
        <div className="card section">
          <div className="card-header">
            <span className="card-title">AI Recommendations</span>
            <button
              className="btn btn-success btn-sm"
              onClick={executeAll}
              disabled={executing || recommendations.length === 0}
            >
              {executing ? "Executing..." : "Execute All"}
            </button>
          </div>
          {recommendations.length === 0 ? (
            <div className="loading">No recommendations — portfolio is balanced</div>
          ) : (
            recommendations.map((rec, i) => (
              <div className="rec-card" key={i}>
                <div className="rec-header">
                  <span className="rec-symbol">{rec.symbol}</span>
                  <span className={`rec-signal signal-${rec.signal}`}>{rec.signal.replace("_", " ")}</span>
                </div>
                <div className="rec-reasoning">{rec.reasoning}</div>
                <div className="rec-meta">
                  <span>Price: ${rec.price_usd.toFixed(2)}</span>
                  <span>Confidence: {(rec.confidence * 100).toFixed(0)}%</span>
                  <span>Target: {(rec.target_weight * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Trade History */}
      <div className="card section">
        <div className="card-header">
          <span className="card-title">On-Chain Trade History</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            All actions recorded on Mantle for transparency
          </span>
        </div>
        {history.length === 0 ? (
          <div className="loading">No trades executed yet</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Symbol</th>
                  <th>Amount</th>
                  <th>Value (USD)</th>
                  <th>Price</th>
                  <th>Reasoning</th>
                </tr>
              </thead>
              <tbody>
                {history
                  .slice()
                  .reverse()
                  .map((action, i) => (
                    <tr key={i}>
                      <td>
                        <span
                          className={`rec-signal signal-${action.action === "BUY" ? "buy" : "sell"}`}
                        >
                          {action.action}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{action.symbol}</td>
                      <td>{action.amount?.toFixed(4)}</td>
                      <td>${action.value_usd?.toFixed(2)}</td>
                      <td>${action.price?.toFixed(2)}</td>
                      <td style={{ maxWidth: 300, fontSize: 12, color: "var(--text-secondary)" }}>
                        {action.reasoning?.substring(0, 100)}
                        {action.reasoning?.length > 100 ? "..." : ""}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="footer">
        <p>
          StockPilot AI — Built for{" "}
          <a href="https://dorahacks.io/hackathon/mantleturingtesthackathon2026" target="_blank" rel="noreferrer">
            Mantle Turing Test Hackathon 2026
          </a>{" "}
          | AI x RWA Track | Powered by{" "}
          <a href="https://xstocks.fi" target="_blank" rel="noreferrer">
            xStocks
          </a>{" "}
          on{" "}
          <a href="https://mantle.xyz" target="_blank" rel="noreferrer">
            Mantle Network
          </a>
        </p>
      </footer>
    </div>
  );
}
