"use client";

import type { SmartMoneyFlow } from "@/lib/intelligence/types";

const VERDICT_COLOR: Record<SmartMoneyFlow["verdict"], { bg: string; text: string; dot: string; label: string }> = {
  ACCUMULATE: { bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-300", dot: "bg-emerald-400", label: "ACCUMULATING" },
  DISTRIBUTE: { bg: "bg-rose-500/10 border-rose-500/30", text: "text-rose-300", dot: "bg-rose-400", label: "DISTRIBUTING" },
  NEUTRAL:    { bg: "bg-slate-500/10 border-slate-500/30", text: "text-slate-300", dot: "bg-slate-400", label: "NEUTRAL" },
  NO_DATA:    { bg: "bg-white/[0.03] border-white/10", text: "text-white/40", dot: "bg-white/30", label: "NO DATA" },
};

function fmtUsd(n: number | undefined): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "+";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function ago(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function SmartMoneyCard({ data }: { data: SmartMoneyFlow }) {
  const v = VERDICT_COLOR[data.verdict];
  return (
    <div className={`rounded-xl border ${v.bg} p-3 space-y-2`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${v.dot} ${data.verdict !== "NO_DATA" ? "animate-pulse" : ""}`} />
          <span className="text-[10px] font-semibold tracking-wider text-white/50 uppercase">Smart Money · Nansen</span>
        </div>
        <span className="text-[9px] text-white/30">{ago(data.asOf)}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-sm font-semibold text-white/90">{data.symbol}</div>
          <div className={`text-[10px] font-bold tracking-wider ${v.text}`}>{v.label}</div>
        </div>
        <div className="text-right">
          <div className={`text-xl font-bold tabular-nums ${data.netFlow24h && data.netFlow24h > 0 ? "text-emerald-300" : data.netFlow24h && data.netFlow24h < 0 ? "text-rose-300" : "text-white/70"}`}>
            {fmtUsd(data.netFlow24h)}
          </div>
          <div className="text-[9px] text-white/40">net flow / 24h</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/5">
        <div>
          <div className="text-[9px] text-white/40 uppercase">Traders</div>
          <div className="text-xs text-white/70 tabular-nums">{data.traderCount ?? "—"}</div>
        </div>
        <div>
          <div className="text-[9px] text-white/40 uppercase">Buy vol</div>
          <div className="text-xs text-emerald-300/80 tabular-nums">{fmtUsd(data.buyVolume).replace("+", "")}</div>
        </div>
        <div>
          <div className="text-[9px] text-white/40 uppercase">Sell vol</div>
          <div className="text-xs text-rose-300/80 tabular-nums">{fmtUsd(data.sellVolume).replace("+", "")}</div>
        </div>
      </div>
    </div>
  );
}
