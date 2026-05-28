"use client";

/**
 * Inline badge attached to each xStock row in the Market tab showing
 * the smart-money verdict (ACCUMULATE / NEUTRAL / DISTRIBUTE) from Nansen.
 * Falls back to a lightweight placeholder while loading.
 */

import { useEffect, useState } from "react";
import { nansenTokenFlow } from "@/lib/intelligence/nansen";
import type { SmartMoneyFlow } from "@/lib/intelligence/types";

function fmtCompact(n: number | undefined): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "+";
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

const VERDICT_STYLES: Record<SmartMoneyFlow["verdict"], { bg: string; text: string; ring: string; label: string }> = {
  ACCUMULATE: { bg: "bg-emerald-500/15", text: "text-emerald-300", ring: "ring-emerald-500/30", label: "ACCUM" },
  DISTRIBUTE: { bg: "bg-rose-500/15",    text: "text-rose-300",    ring: "ring-rose-500/30",    label: "DIST"  },
  NEUTRAL:    { bg: "bg-slate-500/15",   text: "text-slate-300",   ring: "ring-slate-500/30",   label: "NEUTRAL"},
  NO_DATA:    { bg: "bg-white/[0.03]",   text: "text-white/40",    ring: "ring-white/10",       label: "—"     },
};

export function SmartMoneyBadge({ symbol, tokenAddress, compact }: {
  symbol: string;
  tokenAddress?: string;
  compact?: boolean;
}) {
  const [flow, setFlow] = useState<SmartMoneyFlow | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    nansenTokenFlow({ symbol, tokenAddress, chain: "mantle" })
      .then(f => { if (!cancelled) setFlow(f); })
      .catch(() => { if (!cancelled) setFlow(null); });
    return () => { cancelled = true; };
  }, [symbol, tokenAddress]);

  if (flow === undefined) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/5 text-white/30 text-[9px] font-medium ring-1 ring-inset ring-white/10">
        <span className="w-1 h-1 rounded-full bg-white/30 animate-pulse" />
        Nansen…
      </span>
    );
  }

  const v = flow?.verdict ?? "NO_DATA";
  const style = VERDICT_STYLES[v];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md ${style.bg} ${style.text} text-[9px] font-bold tracking-wider ring-1 ring-inset ${style.ring}`}
      title={
        flow?.netFlow24h !== undefined
          ? `Smart money 24h netflow: ${fmtCompact(flow.netFlow24h)}$ · ${flow.traderCount ?? 0} traders`
          : "No Nansen data for this token yet"
      }
    >
      <span className="opacity-70">⚡</span>
      {style.label}
      {!compact && flow?.netFlow24h !== undefined && Math.abs(flow.netFlow24h) >= 1000 && (
        <span className="ml-0.5 opacity-90 tabular-nums">{fmtCompact(flow.netFlow24h)}</span>
      )}
    </span>
  );
}
