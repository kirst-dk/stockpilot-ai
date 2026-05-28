"use client";

import type { KolMention } from "@/lib/intelligence/types";

export function KolMentionsCard({ data }: { data: { ticker: string; mentions: KolMention[] } }) {
  if (!data.mentions.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <div className="text-[10px] text-white/40">No recent KOL mentions for ${data.ticker}.</div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-violet-400" />
        <span className="text-[10px] font-semibold tracking-wider text-white/50 uppercase">Top KOL Mentions · ELFA</span>
        <span className="text-[9px] text-white/30 ml-auto">${data.ticker}</span>
      </div>
      <div className="space-y-1.5">
        {data.mentions.slice(0, 5).map((m) => (
          <a
            key={m.link}
            href={m.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg bg-black/20 hover:bg-black/40 border border-white/5 px-2.5 py-2 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${m.isVerified ? "bg-blue-500/20 text-blue-300" : "bg-white/10 text-white/60"}`}>
                @{m.username}
              </span>
              {m.isVerified && (
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="text-blue-400">
                  <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm3.5 5.5a.5.5 0 0 1 .354.854l-4 4a.5.5 0 0 1-.708 0L4.146 7.354a.5.5 0 1 1 .708-.708L7.5 9.293l3.65-3.65a.5.5 0 0 1 .354-.143z"/>
                </svg>
              )}
              <span className="text-[10px] text-white/30 ml-auto">{new Date(m.mentionedAt).toUTCString().slice(0, 16)}</span>
            </div>
            {m.text && (
              <div className="text-[11px] text-white/70 mt-1.5 line-clamp-3">{m.text}</div>
            )}
            <div className="flex gap-3 mt-1.5 text-[9px] text-white/40 tabular-nums">
              <span>👁 {m.views >= 1000 ? `${(m.views / 1000).toFixed(0)}K` : m.views}</span>
              <span>♥ {m.likes}</span>
              <span>🔁 {m.reposts}</span>
              {m.ctReposts > 0 && <span className="text-violet-300/70">CT {m.ctReposts}</span>}
              {m.smartReposts > 0 && <span className="text-emerald-300/70">Smart {m.smartReposts}</span>}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
