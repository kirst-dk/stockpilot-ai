/**
 * ELFA AI client — verified KOL mentions and sentiment from crypto Twitter.
 *
 * Free-tier limits: 1000 req/day, 60/min. Cache aggressively.
 */

import { ELFA_BASE } from "./config";
import { cachedFetch, TTL } from "./cache";
import type { KolMention, KolSentiment } from "./types";

type TimeWindow = "1h" | "24h" | "7d" | "30d";

interface ElfaTopMentionRaw {
  tweetId: string;
  link: string;
  likeCount: number;
  repostCount: number;
  viewCount: number;
  quoteCount: number;
  replyCount: number;
  bookmarkCount: number;
  mentionedAt: string;
  type: string;
  content?: string;
  text?: string;
  account?: {
    username?: string;
    isVerified?: boolean;
    followerCount?: number;
  };
  repostBreakdown?: {
    smart?: number;
    ct?: number;
  };
}

async function elfaGet<T>(path: string, query: Record<string, string | number>): Promise<T> {
  const base = ELFA_BASE();
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) qs.set(k, String(v));
  const u = `${base}${path}${qs.toString() ? `?${qs.toString()}` : ""}`;
  const res = await fetch(u);
  if (!res.ok) {
    throw new Error(`ELFA ${path} HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json && json.success === false) {
    throw new Error(`ELFA ${path}: ${json.message ?? "unknown error"}`);
  }
  return json as T;
}

/** Top tweets mentioning a ticker, weighted by engagement. */
export async function elfaTopMentions(
  ticker: string,
  timeWindow: TimeWindow = "24h",
  limit = 8,
): Promise<KolMention[]> {
  const key = `elfa:topMentions:${ticker.toUpperCase()}:${timeWindow}:${limit}`;
  return cachedFetch(key, TTL.MENTIONS, async () => {
    const json = await elfaGet<{ success: boolean; data: ElfaTopMentionRaw[] }>(
      "/v2/data/top-mentions",
      { ticker: ticker.toUpperCase(), timeWindow, limit },
    );
    const rows = json.data ?? [];
    // Dedupe by tweetId (the API returns duplicates with slightly different metrics)
    const seen = new Set<string>();
    const out: KolMention[] = [];
    for (const r of rows) {
      if (seen.has(r.tweetId)) continue;
      seen.add(r.tweetId);
      const username = r.account?.username ?? r.link?.split("/x.com/")[1]?.split("/")[0] ?? "unknown";
      out.push({
        username,
        isVerified: !!r.account?.isVerified,
        link: r.link,
        text: r.content ?? r.text,
        likes: r.likeCount ?? 0,
        views: r.viewCount ?? 0,
        reposts: r.repostCount ?? 0,
        smartReposts: r.repostBreakdown?.smart ?? 0,
        ctReposts: r.repostBreakdown?.ct ?? 0,
        mentionedAt: r.mentionedAt,
      });
    }
    return out;
  });
}

/** Trending tokens across the ELFA universe. */
export interface ElfaTrending {
  token: string;
  current_count: number;
  previous_count: number;
  change_percent: number;
}
export async function elfaTrendingTokens(timeWindow: TimeWindow = "24h", limit = 10): Promise<ElfaTrending[]> {
  const key = `elfa:trending:${timeWindow}:${limit}`;
  return cachedFetch(key, TTL.SENTIMENT, async () => {
    const json = await elfaGet<{ success: boolean; data: { data: ElfaTrending[] } }>(
      "/v2/aggregations/trending-tokens",
      { timeWindow, pageSize: limit },
    );
    return (json.data?.data ?? []).slice(0, limit);
  });
}

/** Engagement-weighted sentiment proxy.
 * ELFA's free tier doesn't expose a true sentiment endpoint — we derive
 * a 0-100 score from KOL engagement metrics and rough text polarity.
 */
const POS = ["bull", "bullish", "moon", "up", "buy", "long", "pump", "gains", "rally", "breakout", "beat", "strong", "growth", "🚀", "📈"];
const NEG = ["bear", "bearish", "down", "sell", "short", "dump", "crash", "loss", "weak", "decline", "drop", "miss", "risk", "🔻", "📉"];

function scoreText(t: string | undefined): number {
  if (!t) return 0;
  const lower = t.toLowerCase();
  let s = 0;
  for (const p of POS) if (lower.includes(p)) s += 1;
  for (const n of NEG) if (lower.includes(n)) s -= 1;
  return Math.max(-3, Math.min(3, s));
}

export async function elfaSentiment(
  ticker: string,
  timeWindow: TimeWindow = "24h",
): Promise<KolSentiment> {
  const mentions = await elfaTopMentions(ticker, timeWindow, 12);
  if (mentions.length === 0) {
    return {
      ticker: ticker.toUpperCase(),
      score: 50,
      totalMentions: 0,
      totalViews: 0,
      topMentions: [],
      asOf: Date.now(),
      source: "elfa",
    };
  }
  let weighted = 0;
  let weight = 0;
  let totalViews = 0;
  for (const m of mentions) {
    const eng = Math.log10(1 + (m.likes + m.reposts * 3 + m.smartReposts * 5 + m.ctReposts * 2 + m.views / 1000));
    const s = scoreText(m.text);
    weighted += s * eng;
    weight += eng;
    totalViews += m.views;
  }
  const raw = weight > 0 ? weighted / weight : 0; // -3..3
  const score = Math.round(50 + (raw / 3) * 40); // 10..90
  return {
    ticker: ticker.toUpperCase(),
    score: Math.max(5, Math.min(95, score)),
    totalMentions: mentions.length,
    totalViews,
    topMentions: mentions.slice(0, 6),
    asOf: Date.now(),
    source: "elfa",
  };
}
