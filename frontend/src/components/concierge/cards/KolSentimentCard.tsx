"use client";

import type { KolSentiment } from "@/lib/intelligence/types";

function ago(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function scoreColor(score: number): { bar: string; text: string; label: string } {
  if (score >= 65) return { bar: "bg-gradient-to-r from-emerald-500 to-emerald-300", text: "text-emerald-300", label: "BULLISH" };
  if (score >= 45) return { bar: "bg-gradient-to-r from-slate-500 to-slate-300", text: "text-slate-300", label: "MIXED" };
  return { bar: "bg-gradient-to-r from-rose-500 to-rose-300", text: "text-rose-300", label: "BEARISH" };
}

export function KolSentimentCard({ data }: { data: KolSentiment }) {
  const s = scoreColor(data.score);
  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
          <span className="text-[10px] font-semibold tracking-wider text-white/50 uppercase">KOL Sentiment · ELFA</span>
        </div>
        <span className="text-[9px] text-white/30">{ago(data.asOf)}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-sm font-semibold text-white/90">${data.ticker}</div>
          <div className={`text-[10px] font-bold tracking-wider ${s.text}`}>{s.label}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums text-white/90">{data.score}</div>
          <div className="text-[9px] text-white/40">sentiment / 100</div>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full ${s.bar}`} style={{ width: `${Math.max(2, Math.min(100, data.score))}%` }} />
      </div>
      <div className="flex justify-between text-[9px] text-white/40 pt-1 border-t border-white/5">
        <span>{data.totalMentions} mentions</span>
        <span>{Math.round(data.totalViews / 1000)}K views</span>
      </div>
      {data.topMentions.length > 0 && (
        <div className="pt-1 space-y-1">
          {data.topMentions.slice(0, 2).map((m) => (
            <a
              key={m.link}
              href={m.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-[10px] text-white/50 hover:text-white/80 transition-colors"
            >
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${m.isVerified ? "bg-blue-500/20 text-blue-300" : "bg-white/5 text-white/40"}`}>
                @{m.username}
              </span>
              <span className="tabular-nums text-[9px] text-white/30">
                {m.views > 0 ? `${(m.views / 1000).toFixed(0)}K views` : `${m.likes} likes`}
              </span>
              {m.ctReposts > 0 && (
                <span className="text-[9px] text-violet-300/70">{m.ctReposts} CT</span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
