"use client";

import type { SmartMoneyFlow, KolSentiment } from "@/lib/intelligence/types";

interface CompareRow {
  symbol: string;
  flow: SmartMoneyFlow | null;
  sentiment: KolSentiment | null;
}

function fmtUsd(n: number | undefined | null): string {
  if (n === undefined || n === null) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "+";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function CompareCard({ data }: { data: CompareRow[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-semibold tracking-wider text-white/50 uppercase">Comparison · Nansen + ELFA</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] text-white/40 uppercase">
              <th className="text-left py-1.5">Symbol</th>
              <th className="text-right py-1.5">Smart $</th>
              <th className="text-right py-1.5">Sentiment</th>
              <th className="text-right py-1.5">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.symbol} className="border-t border-white/5">
                <td className="py-2 font-medium text-white/85">{r.symbol}</td>
                <td className={`py-2 text-right tabular-nums ${(r.flow?.netFlow24h ?? 0) > 0 ? "text-emerald-300" : (r.flow?.netFlow24h ?? 0) < 0 ? "text-rose-300" : "text-white/50"}`}>
                  {fmtUsd(r.flow?.netFlow24h)}
                </td>
                <td className="py-2 text-right tabular-nums text-white/75">
                  {r.sentiment ? r.sentiment.score : "—"}
                </td>
                <td className="py-2 text-right">
                  <span className={`text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded ${
                    r.flow?.verdict === "ACCUMULATE" ? "bg-emerald-500/15 text-emerald-300" :
                    r.flow?.verdict === "DISTRIBUTE" ? "bg-rose-500/15 text-rose-300" :
                    r.flow?.verdict === "NEUTRAL" ? "bg-slate-500/15 text-slate-300" :
                    "bg-white/5 text-white/40"
                  }`}>
                    {r.flow?.verdict ?? "NO_DATA"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
