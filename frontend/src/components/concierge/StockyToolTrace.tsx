"use client";

import type { ToolCallTrace } from "@/lib/intelligence/types";
import { uiStrings, type LangCode } from "@/lib/intelligence/lang";

const SOURCE_FOR_TOOL: Record<string, { label: string; color: string }> = {
  get_smart_money:    { label: "Nansen", color: "text-orange-300" },
  get_kol_sentiment:  { label: "ELFA",   color: "text-violet-300" },
  get_kol_mentions:   { label: "ELFA",   color: "text-violet-300" },
  get_xstock_info:    { label: "Catalog",color: "text-blue-300" },
  list_xstocks:       { label: "Catalog",color: "text-blue-300" },
  get_market_pulse:   { label: "Nansen+ELFA", color: "text-teal-300" },
  compare_xstocks:    { label: "Nansen+ELFA", color: "text-teal-300" },
};

export function StockyToolTrace({ trace, lang }: { trace: ToolCallTrace[]; lang: LangCode }) {
  if (!trace.length) return null;
  const t = uiStrings(lang);
  return (
    <div className="rounded-lg bg-black/30 border border-white/10 px-2.5 py-2 space-y-1">
      <div className="text-[9px] font-semibold tracking-wider text-white/40 uppercase">{t.callingTool}</div>
      {trace.map((c) => {
        const src = SOURCE_FOR_TOOL[c.name] ?? { label: c.name, color: "text-white/50" };
        const argsLine = c.args.symbol ? `${String(c.args.symbol)}` : "";
        return (
          <div key={c.id} className="flex items-center gap-2 text-[10px]">
            <span className={`inline-flex items-center gap-1 ${src.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                c.status === "running" ? "bg-amber-400 animate-pulse" :
                c.status === "done" ? "bg-emerald-400" : "bg-rose-400"
              }`} />
              <span className="font-medium">{src.label}</span>
            </span>
            <span className="text-white/40 font-mono truncate">{c.name}({argsLine})</span>
            {c.status === "done" && c.result?.ok && (
              <span className="text-emerald-300/60 text-[9px]">✓</span>
            )}
            {c.status === "error" && (
              <span className="text-rose-300/80 text-[9px]" title={c.result?.error}>!</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
