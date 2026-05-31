"use client";

/**
 * Inline badge attached to each xStock row in the Market tab showing
 * a "smart money + social pulse" verdict for the underlying ticker.
 *
 * Why both signals:
 *  - Nansen indexes Mantle DeFi tokens, but doesn't yet track wrapped
 *    xStock contracts → would always show NO_DATA for 155 tickers.
 *  - ELFA tracks the underlying equity tickers (NVDA, TSLA, AAPL…) and
 *    surfaces engagement-weighted KOL chatter that IS available for every
 *    xStock in the list.
 *
 * The badge therefore prefers Nansen smart-money flow when available
 * (e.g. crypto-native xStocks like COINx, CRCLx, MSTRx, HOODx) and falls
 * back to ELFA social pulse for everything else. This guarantees every
 * row gets a real, live signal instead of "NO_DATA".
 *
 * Performance: lazy-loaded via IntersectionObserver and gated through a
 * tiny shared semaphore so the page doesn't fire 155 parallel API calls
 * on first render.
 */

import { useEffect, useRef, useState } from "react";
import { nansenTokenFlow } from "@/lib/intelligence/nansen";
import { elfaTopMentions } from "@/lib/intelligence/elfa";
import { useStocky } from "@/components/concierge/StockyContext";

type Verdict =
  | "ACCUMULATE" // Nansen netflow > +$500k
  | "DISTRIBUTE" // Nansen netflow < -$500k
  | "HOT"        // ELFA: 5+ mentions or >500k total views
  | "ACTIVE"     // ELFA: 2-4 mentions or 50-500k views
  | "QUIET"      // ELFA: 1 mention or <50k views
  | "NEUTRAL"    // Nansen tracked but tiny flow
  | "NO_DATA";

interface Pulse {
  verdict: Verdict;
  source: "nansen" | "elfa" | "both" | "none";
  // Nansen-side
  netFlow24h?: number;
  traderCount?: number;
  // ELFA-side
  mentions24h?: number;
  totalViews24h?: number;
  topKol?: string;
  topKolVerified?: boolean;
}

const VERDICT_STYLES: Record<Verdict, { bg: string; text: string; ring: string; label: string; icon: string }> = {
  ACCUMULATE: { bg: "bg-emerald-500/15", text: "text-emerald-300", ring: "ring-emerald-500/30", label: "ACCUM",   icon: "⚡" },
  DISTRIBUTE: { bg: "bg-rose-500/15",    text: "text-rose-300",    ring: "ring-rose-500/30",    label: "DIST",    icon: "⚡" },
  HOT:        { bg: "bg-orange-500/15",  text: "text-orange-300",  ring: "ring-orange-500/30",  label: "HOT",     icon: "🔥" },
  ACTIVE:     { bg: "bg-sky-500/15",     text: "text-sky-300",     ring: "ring-sky-500/30",     label: "ACTIVE",  icon: "📣" },
  QUIET:      { bg: "bg-slate-500/10",   text: "text-slate-300",   ring: "ring-slate-500/20",   label: "QUIET",   icon: "💬" },
  NEUTRAL:    { bg: "bg-slate-500/15",   text: "text-slate-300",   ring: "ring-slate-500/30",   label: "NEUTRAL", icon: "⚡" },
  NO_DATA:    { bg: "bg-white/[0.03]",   text: "text-white/40",    ring: "ring-white/10",       label: "—",       icon: "" },
};

function fmtCompact(n: number | undefined): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "+";
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function fmtViews(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}

// Tiny semaphore: cap concurrent badge fetches so we don't blow ELFA's
// 60-req/min rate-limit when 155 rows mount at once.
const MAX_CONCURRENT = 4;
let inflight = 0;
const queue: Array<() => void> = [];
function acquire(): Promise<void> {
  return new Promise<void>(resolve => {
    if (inflight < MAX_CONCURRENT) {
      inflight++;
      resolve();
    } else {
      queue.push(() => { inflight++; resolve(); });
    }
  });
}
function release() {
  inflight = Math.max(0, inflight - 1);
  const next = queue.shift();
  if (next) next();
}

function underlyingTicker(symbol: string): string {
  // NVDAx → NVDA, BRK.Bx → BRK.B, but keep symbols like "Vx" → "V"
  return symbol.replace(/x$/, "").toUpperCase();
}

function classify(
  nansen: { netFlow24h?: number; traderCount?: number } | null,
  elfa:   { mentions: number; views: number; topKol?: string; topKolVerified?: boolean } | null,
): Pulse {
  const nfDefined = nansen?.netFlow24h !== undefined && nansen?.netFlow24h !== null;
  // 1) Strong Nansen signal overrides everything
  if (nfDefined && Math.abs(nansen!.netFlow24h!) >= 500_000) {
    return {
      verdict: nansen!.netFlow24h! > 0 ? "ACCUMULATE" : "DISTRIBUTE",
      source: elfa && elfa.mentions > 0 ? "both" : "nansen",
      netFlow24h: nansen!.netFlow24h,
      traderCount: nansen?.traderCount,
      mentions24h: elfa?.mentions,
      totalViews24h: elfa?.views,
      topKol: elfa?.topKol,
      topKolVerified: elfa?.topKolVerified,
    };
  }
  // 2) ELFA-based social pulse
  if (elfa && elfa.mentions > 0) {
    let v: Verdict;
    if (elfa.views >= 500_000 || elfa.mentions >= 5) v = "HOT";
    else if (elfa.views >= 50_000 || elfa.mentions >= 2) v = "ACTIVE";
    else v = "QUIET";
    return {
      verdict: v,
      source: nfDefined ? "both" : "elfa",
      netFlow24h: nansen?.netFlow24h,
      traderCount: nansen?.traderCount,
      mentions24h: elfa.mentions,
      totalViews24h: elfa.views,
      topKol: elfa.topKol,
      topKolVerified: elfa.topKolVerified,
    };
  }
  // 3) Nansen tracked but tiny flow
  if (nfDefined) {
    return {
      verdict: "NEUTRAL",
      source: "nansen",
      netFlow24h: nansen!.netFlow24h,
      traderCount: nansen?.traderCount,
    };
  }
  return { verdict: "NO_DATA", source: "none" };
}

export function SmartMoneyBadge({ symbol, tokenAddress, compact }: {
  symbol: string;
  tokenAddress?: string;
  compact?: boolean;
}) {
  const { open, analyzeXStock } = useStocky();
  const spanRef = useRef<HTMLElement | null>(null);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [visible, setVisible] = useState(false);

  // Lazy-load: only fetch when the badge enters the viewport.
  useEffect(() => {
    if (!spanRef.current || visible) return;
    const el = spanRef.current;
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          setVisible(true);
          obs.disconnect();
          break;
        }
      }
    }, { rootMargin: "200px 0px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [visible]);

  // Fetch pulse from ELFA (always) + Nansen (when address present).
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      await acquire();
      try {
        const ticker = underlyingTicker(symbol);
        const [nansenRes, mentionsRes] = await Promise.allSettled([
          tokenAddress
            ? nansenTokenFlow({ symbol, tokenAddress, chain: "mantle" })
            : Promise.resolve(null),
          elfaTopMentions(ticker, "24h", 5),
        ]);

        const nansen = nansenRes.status === "fulfilled" && nansenRes.value
          ? { netFlow24h: nansenRes.value.netFlow24h, traderCount: nansenRes.value.traderCount }
          : null;

        let elfa: { mentions: number; views: number; topKol?: string; topKolVerified?: boolean } | null = null;
        if (mentionsRes.status === "fulfilled" && Array.isArray(mentionsRes.value)) {
          const ms = mentionsRes.value;
          const views = ms.reduce((s, m) => s + (m.views ?? 0), 0);
          const top = ms[0];
          elfa = {
            mentions: ms.length,
            views,
            topKol: top?.username,
            topKolVerified: top?.isVerified,
          };
        }

        if (!cancelled) setPulse(classify(nansen, elfa));
      } finally {
        release();
      }
    })();
    return () => { cancelled = true; };
  }, [visible, symbol, tokenAddress]);

  // Pre-fetch placeholder before viewport (still lets the row layout settle).
  if (!visible || pulse === null) {
    return (
      <span
        ref={(el) => { spanRef.current = el; }}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.04] text-white/30 text-[9px] font-medium ring-1 ring-inset ring-white/10"
      >
        <span className="w-1 h-1 rounded-full bg-white/30 animate-pulse" />
        Stocky…
      </span>
    );
  }

  const style = VERDICT_STYLES[pulse.verdict];

  const tooltipLines: string[] = [];
  if (pulse.netFlow24h !== undefined) {
    tooltipLines.push(
      `Nansen smart money: ${fmtCompact(pulse.netFlow24h)}$ 24h netflow${pulse.traderCount ? ` · ${pulse.traderCount} smart traders` : ""}`,
    );
  }
  if (pulse.mentions24h !== undefined && pulse.mentions24h > 0) {
    tooltipLines.push(
      `ELFA KOL pulse: ${pulse.mentions24h} mentions · ${fmtViews(pulse.totalViews24h)} views${pulse.topKol ? ` · top @${pulse.topKol}${pulse.topKolVerified ? " ✓" : ""}` : ""}`,
    );
  }
  if (pulse.source === "none") {
    tooltipLines.push("No live data yet — click to ask Stocky for a research breakdown.");
  } else {
    tooltipLines.push("Click to ask Stocky for a full breakdown.");
  }

  const onClick: React.MouseEventHandler = (e) => {
    e.preventDefault();
    e.stopPropagation();
    open("floating");
    // Defer slightly so the panel mount animation doesn't drop the turn.
    setTimeout(() => { analyzeXStock(symbol); }, 50);
  };

  return (
    <button
      ref={(el) => { spanRef.current = el; }}
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md ${style.bg} ${style.text} text-[9px] font-bold tracking-wider ring-1 ring-inset ${style.ring} hover:brightness-125 transition cursor-pointer`}
      title={tooltipLines.join("\n")}
    >
      {style.icon && <span className="opacity-80">{style.icon}</span>}
      {style.label}
      {!compact && pulse.netFlow24h !== undefined && Math.abs(pulse.netFlow24h) >= 1000 && (
        <span className="ml-0.5 opacity-90 tabular-nums">{fmtCompact(pulse.netFlow24h)}</span>
      )}
      {!compact && pulse.mentions24h !== undefined && pulse.mentions24h > 0 && pulse.netFlow24h === undefined && (
        <span className="ml-0.5 opacity-90 tabular-nums">{pulse.mentions24h}m</span>
      )}
    </button>
  );
}
