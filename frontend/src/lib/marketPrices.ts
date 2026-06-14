// Price data for the xStock ticker / market widgets.
// xStocks are tokenized US equities (always end in "x") — the ticker MUST show
// these, never crypto pairs.
//
// Live quotes are fetched from the underlying equity (e.g. AAPLx -> AAPL) via the
// same-origin `/api/yf/` proxy (nginx -> Yahoo Finance spark endpoint, no key).
// REFERENCE_QUOTES below are a graceful, always-available fallback so the UI
// never hangs or shows a spinner if the live feed is unavailable.

import { useEffect, useState } from "react";

export interface StockQuote {
  symbol: string; // xStock symbol, e.g. "AAPLx"
  name: string;
  price: number; // USD
  change: number; // 24h % change
}

export interface LiveQuote {
  price: number;
  change: number;
}

export const REFERENCE_QUOTES: StockQuote[] = [
  { symbol: "SPYx", name: "S&P 500", price: 587.42, change: 0.74 },
  { symbol: "NVDAx", name: "NVIDIA", price: 131.88, change: 3.42 },
  { symbol: "AAPLx", name: "Apple", price: 198.55, change: -0.31 },
  { symbol: "TSLAx", name: "Tesla", price: 248.22, change: 2.11 },
  { symbol: "MSFTx", name: "Microsoft", price: 442.31, change: 0.83 },
  { symbol: "AMZNx", name: "Amazon", price: 201.45, change: 1.27 },
  { symbol: "GOOGLx", name: "Alphabet", price: 178.9, change: -0.52 },
  { symbol: "METAx", name: "Meta", price: 596.18, change: 1.94 },
  { symbol: "QQQx", name: "Nasdaq 100", price: 503.77, change: 0.61 },
  { symbol: "MSTRx", name: "MicroStrategy", price: 389.5, change: 4.88 },
  { symbol: "COINx", name: "Coinbase", price: 268.34, change: 2.57 },
  { symbol: "TSMx", name: "TSMC", price: 196.7, change: 1.05 },
  { symbol: "HOODx", name: "Robinhood", price: 41.62, change: 3.18 },
  { symbol: "PLTRx", name: "Palantir", price: 72.4, change: -1.24 },
  { symbol: "CRCLx", name: "Circle", price: 83.15, change: 1.46 },
  { symbol: "AMDx", name: "AMD", price: 138.27, change: -0.88 },
];

// Same-origin proxy to Yahoo Finance (configured in nginx as `/api/yf/`).
const QUOTE_PROXY = "/api/yf/v7/finance/spark";

/** Underlying equity ticker for an xStock symbol (AAPLx -> AAPL, SPYx -> SPY). */
export function underlyingTicker(xsym: string): string {
  return xsym.replace(/x$/i, "").toUpperCase();
}

// Module-level cache so we hit the feed once per session per symbol set.
const _quoteCache = new Map<string, LiveQuote>();

/**
 * Fetch live quotes for a set of xStock symbols. Resolves to a map keyed by the
 * xStock symbol. Never throws: any failure simply omits that symbol so the UI
 * can fall back to a reference quote or a consistent placeholder.
 */
export async function fetchLiveQuotes(xsymbols: string[]): Promise<Record<string, LiveQuote>> {
  const out: Record<string, LiveQuote> = {};
  const wanted = Array.from(new Set(xsymbols.filter(Boolean)));

  const toFetch: string[] = [];
  for (const x of wanted) {
    const cached = _quoteCache.get(x);
    if (cached) out[x] = cached;
    else toFetch.push(x);
  }
  if (toFetch.length === 0) return out;

  // underlying ticker -> xStock symbol
  const byUnderlying = new Map<string, string>();
  toFetch.forEach((x) => byUnderlying.set(underlyingTicker(x), x));
  const unders = Array.from(byUnderlying.keys());

  // Yahoo's spark endpoint rejects (HTTP 400) requests with too many symbols
  // (~20+), so keep batches comfortably under that limit.
  const CHUNK = 15;
  for (let i = 0; i < unders.length; i += CHUNK) {
    const batch = unders.slice(i, i + CHUNK);
    try {
      const res = await fetch(`${QUOTE_PROXY}?symbols=${batch.join(",")}&range=1d&interval=1d`);
      if (!res.ok) continue;
      const data = await res.json();
      const results: Array<{ symbol?: string; response?: Array<{ meta?: Record<string, number> }> }> =
        data?.spark?.result ?? [];
      for (const r of results) {
        const meta = r?.response?.[0]?.meta;
        const xsym = r?.symbol ? byUnderlying.get(r.symbol) : undefined;
        if (!meta || !xsym) continue;
        const price = meta.regularMarketPrice;
        const prev = meta.chartPreviousClose ?? meta.previousClose;
        if (typeof price !== "number" || !prev) continue;
        const q: LiveQuote = { price, change: ((price - prev) / prev) * 100 };
        out[xsym] = q;
        _quoteCache.set(xsym, q);
      }
    } catch {
      /* ignore — fall back to reference/placeholder */
    }
  }
  return out;
}

/**
 * Best-effort live quotes hook with a guaranteed reference fallback merged in.
 * Returns a map keyed by xStock symbol (live where available, otherwise the
 * static reference quote for the well-known tickers). Symbols with no data at
 * all are simply absent — callers render a single consistent placeholder.
 */
export function useLiveQuotes(xsymbols: string[]): { quotes: Record<string, LiveQuote>; loading: boolean } {
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [loading, setLoading] = useState(true);
  const key = Array.from(new Set(xsymbols)).sort().join(",");

  useEffect(() => {
    let cancelled = false;
    const reference: Record<string, LiveQuote> = {};
    for (const r of REFERENCE_QUOTES) reference[r.symbol] = { price: r.price, change: r.change };

    setLoading(true);
    fetchLiveQuotes(xsymbols)
      .then((live) => {
        if (cancelled) return;
        // Live data wins; reference fills gaps for well-known tickers only.
        setQuotes({ ...reference, ...live });
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { quotes, loading };
}

/** Kept for backwards compatibility. */
export async function fetchStockQuotes(): Promise<StockQuote[]> {
  return REFERENCE_QUOTES;
}
