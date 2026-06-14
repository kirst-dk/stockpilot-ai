"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  TrendingUp, TrendingDown, ArrowUpRight, Wallet, Layers, Globe2,
  Sparkles, BarChart3,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TokenIcon, useAppData } from "@/components/AppCore";
import { REFERENCE_QUOTES, useLiveQuotes, type StockQuote } from "@/lib/marketPrices";

function seededSeries(base: number, change: number, n = 32) {
  // deterministic gentle walk ending near `base`, shaped by 24h `change`
  const start = base / (1 + change / 100);
  const out: { t: number; p: number }[] = [];
  let seed = Math.floor(base * 100) % 997 || 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed / 0x7fffffff) - 0.5; };
  for (let i = 0; i < n; i++) {
    const trend = start + (base - start) * (i / (n - 1));
    const noise = trend * 0.012 * rand();
    out.push({ t: i, p: +(trend + noise).toFixed(2) });
  }
  out[n - 1].p = base;
  return out;
}

function StatCard({ icon: Icon, label, value, sub, accent }: {
  icon: React.ElementType; label: string; value: string; sub?: string; accent: string;
}) {
  return (
    <div className="sp-glass sp-card-hover p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-medium text-white/45">{label}</span>
        <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${accent}1a`, color: accent }}>
          <Icon size={16} />
        </span>
      </div>
      <div className="mt-3 font-display font-semibold text-[24px] sm:text-[26px] text-white tabular-nums">{value}</div>
      {sub && <div className="text-[11.5px] text-white/40 mt-0.5">{sub}</div>}
    </div>
  );
}

function MoverCard({ q, logo }: { q: StockQuote; logo?: string }) {
  const up = q.change >= 0;
  return (
    <Link
      href="/market"
      className="sp-glass sp-card-hover shrink-0 w-[176px] p-4 block"
    >
      <div className="flex items-center gap-2">
        <TokenIcon token={{ symbol: q.symbol, logo }} size={28} />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-white leading-none">{q.symbol}</div>
          <div className="text-[10.5px] text-white/40 truncate mt-0.5">{q.name}</div>
        </div>
      </div>
      <div className="mt-3 font-display text-[18px] text-white tabular-nums">${q.price.toFixed(2)}</div>
      <div className="inline-flex items-center gap-1 text-[11.5px] font-medium tabular-nums mt-0.5" style={{ color: up ? "#34e3b0" : "#ff6b81" }}>
        {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{up ? "+" : ""}{q.change.toFixed(2)}%
      </div>
    </Link>
  );
}

export function DashboardOverview() {
  const d = useAppData();
  const quotes = REFERENCE_QUOTES;
  const [featuredSym, setFeaturedSym] = useState<StockQuote>(quotes[1]); // NVDAx

  const available = d.allXStocks.length || 155;

  const logoBySym = useMemo(() => new Map(d.allXStocks.map((s) => [s.symbol, s.logo])), [d.allXStocks]);

  const tableBase = useMemo(() => {
    const list = d.allXStocks.length
      ? d.allXStocks
      : quotes.map((q) => ({ symbol: q.symbol, name: q.name, logo: undefined, mantleAddress: "", networks: [] as string[] }));
    return list.slice(0, 8);
  }, [d.allXStocks, quotes]);

  // Live quotes for everything shown: top movers + featured selector + table.
  const quoteSymbols = useMemo(
    () => [...quotes.map((q) => q.symbol), ...tableBase.map((s) => s.symbol)],
    [quotes, tableBase],
  );
  const { quotes: live } = useLiveQuotes(quoteSymbols);

  // Merge live data onto the featured selection for the chart/header.
  const featured: StockQuote = { ...featuredSym, ...(live[featuredSym.symbol] ?? {}) };
  const setFeatured = setFeaturedSym;
  const series = useMemo(() => seededSeries(featured.price, featured.change), [featured]);
  const featUp = featured.change >= 0;

  const marketRows = useMemo(
    () => tableBase.map((s) => ({ ...s, quote: live[s.symbol] })),
    [tableBase, live],
  );

  // Real market 24h = average of the live changes we have.
  const market24h = useMemo(() => {
    const vals = Object.values(live).map((q) => q.change);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [live]);

  return (
    <div className="space-y-6">
      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon={Wallet} label="Portfolio Value" value={d.selectedCount ? `${d.totalAllocation}%` : "$0.00"} sub={d.selectedCount ? `${d.selectedCount} assets allocated` : "Build your portfolio"} accent="#2fe6b0" />
        <StatCard icon={TrendingUp} label="Market 24h" value={market24h === null ? "—" : `${market24h >= 0 ? "+" : ""}${market24h.toFixed(2)}%`} sub="xStocks avg" accent="#7c6bff" />
        <StatCard icon={Layers} label="xStocks Available" value={`${available}`} sub="Tokenized equities" accent="#34e3b0" />
        <StatCard icon={Globe2} label="Networks" value="9+" sub="Bridgeable via CCIP" accent="#9d90ff" />
      </div>

      {/* Top movers */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-[15px] text-white flex items-center gap-2"><Sparkles size={15} className="text-emerald-300" /> Top Movers</h2>
          <Link href="/market" className="text-[12px] text-white/45 hover:text-white inline-flex items-center gap-1">View market <ArrowUpRight size={13} /></Link>
        </div>
        <div className="flex gap-3 overflow-x-auto sp-noscroll pb-1">
          {quotes.slice(0, 10).map((q) => <MoverCard key={q.symbol} q={{ ...q, ...(live[q.symbol] ?? {}) }} logo={logoBySym.get(q.symbol)} />)}
        </div>
      </section>

      {/* Chart + exchange panel */}
      <div className="grid grid-cols-1 gap-4">
        <div className="min-w-0 sp-glass p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-3">
              <TokenIcon token={{ symbol: featured.symbol, logo: logoBySym.get(featured.symbol) }} size={36} />
              <div>
                <div className="font-display font-semibold text-white text-[16px] leading-none">{featured.symbol} <span className="text-white/40 text-[12px] font-normal">/ USDC</span></div>
                <div className="text-[11.5px] text-white/40 mt-1">{featured.name} · tokenized equity</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-display text-[22px] text-white tabular-nums">${featured.price.toFixed(2)}</div>
              <div className="inline-flex items-center gap-1 text-[12px] font-medium tabular-nums" style={{ color: featUp ? "#34e3b0" : "#ff6b81" }}>
                {featUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{featUp ? "+" : ""}{featured.change.toFixed(2)}% · 24h
              </div>
            </div>
          </div>

          <div className="h-[230px] -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="spArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={featUp ? "#2fe6b0" : "#ff6b81"} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={featUp ? "#2fe6b0" : "#ff6b81"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="t" hide />
                <YAxis domain={["auto", "auto"]} width={48} tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#0b1020", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12 }}
                  labelStyle={{ display: "none" }}
                  formatter={(v: number) => [`$${v}`, featured.symbol]}
                />
                <Area type="monotone" dataKey="p" stroke={featUp ? "#2fe6b0" : "#ff6b81"} strokeWidth={2} fill="url(#spArea)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex gap-2 mt-3 overflow-x-auto sp-noscroll">
            {quotes.slice(0, 8).map((q) => (
              <button
                key={q.symbol}
                onClick={() => setFeatured(q)}
                className="shrink-0 px-3 py-1.5 rounded-lg text-[11.5px] font-medium border transition-colors"
                style={featured.symbol === q.symbol
                  ? { borderColor: "rgba(47,230,176,0.5)", background: "rgba(47,230,176,0.1)", color: "#5cf0c6" }
                  : { borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.55)" }}
              >
                {q.symbol}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Market overview table */}
      <section className="sp-glass p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="font-display font-semibold text-[15px] text-white flex items-center gap-2"><BarChart3 size={15} className="text-emerald-300" /> Market Overview</h2>
          <Link href="/market" className="text-[12px] text-white/45 hover:text-white inline-flex items-center gap-1">All {available} xStocks <ArrowUpRight size={13} /></Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wider text-white/35">
                <th className="px-5 py-2.5 font-medium">Asset</th>
                <th className="px-3 py-2.5 font-medium text-right">Price</th>
                <th className="px-3 py-2.5 font-medium text-right">24h</th>
                <th className="px-5 py-2.5 font-medium text-right hidden sm:table-cell"></th>
              </tr>
            </thead>
            <tbody>
              {marketRows.map((r) => {
                const up = (r.quote?.change ?? 0) >= 0;
                return (
                  <tr key={r.symbol} className="border-t border-white/[0.05] hover:bg-white/[0.02]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <TokenIcon token={{ symbol: r.symbol, logo: r.logo }} size={26} />
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-white leading-none">{r.symbol}</div>
                          <div className="text-[10.5px] text-white/40 truncate mt-0.5 max-w-[160px]">{r.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right text-[13px] text-white/85 tabular-nums">{r.quote ? `$${r.quote.price.toFixed(2)}` : "—"}</td>
                    <td className="px-3 py-3 text-right text-[12.5px] font-medium tabular-nums" style={{ color: r.quote ? (up ? "#34e3b0" : "#ff6b81") : "rgba(255,255,255,0.3)" }}>
                      {r.quote ? `${up ? "+" : ""}${r.quote.change.toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-5 py-3 text-right hidden sm:table-cell">
                      <Link href="/swap" className="text-[12px] font-semibold text-emerald-300 hover:text-emerald-200">Trade</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
