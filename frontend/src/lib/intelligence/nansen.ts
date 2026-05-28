/**
 * Nansen client — institutional / smart-money on-chain flows.
 *
 * Endpoints exposed:
 * - /api/v1/smart-money/netflow  → which tokens smart money is buying/selling
 * - /api/v1/smart-money/holdings → current holdings
 * - /api/v1/tgm/flow-intelligence → per-token deep-dive
 * - /api/v1/token-screener → generic discovery
 *
 * Note: Nansen labels crypto wallets, so for tokenized equities (xStocks)
 * on Mantle, smart money signals reflect on-chain demand for the wrapped
 * version (NVDAx etc.), not the underlying Wall-Street stock.
 */

import { NANSEN_BASE, NANSEN_CHAINS_DEFAULT } from "./config";
import { cachedFetch, TTL } from "./cache";
import type { SmartMoneyFlow } from "./types";

type TGMTimeframe = "5m" | "1h" | "6h" | "12h" | "1d" | "7d";

interface NansenNetflowRow {
  token_address: string;
  token_symbol: string;
  net_flow_1h_usd?: number;
  net_flow_24h_usd?: number;
  net_flow_7d_usd?: number;
  net_flow_30d_usd?: number;
  chain: string;
  token_sectors?: string[];
  trader_count?: number;
  token_age_days?: number;
  market_cap_usd?: number;
}

interface NansenScreenerRow {
  chain: string;
  token_address: string;
  token_symbol: string;
  token_age_days?: number;
  market_cap_usd?: number;
  liquidity?: number;
  price_usd?: number;
  price_change?: number;
  fdv?: number;
  nof_traders?: number;
  buy_volume?: number;
  sell_volume?: number;
  volume?: number;
  netflow?: number;
}

interface NansenFlowIntelligence {
  // shape varies; we treat fields opportunistically
  [key: string]: unknown;
}

async function nansenPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${NANSEN_BASE()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Nansen ${path} HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

function verdictFromFlow(netFlow24h: number | undefined): SmartMoneyFlow["verdict"] {
  if (netFlow24h === undefined || netFlow24h === null) return "NO_DATA";
  if (netFlow24h > 500_000) return "ACCUMULATE";
  if (netFlow24h < -500_000) return "DISTRIBUTE";
  return "NEUTRAL";
}

/** Top tokens by smart-money net flow (across configured chains). */
export async function nansenTopNetflow(
  chains: readonly string[] = NANSEN_CHAINS_DEFAULT,
  limit = 10,
): Promise<SmartMoneyFlow[]> {
  const key = `nansen:netflow:${chains.join(",")}:${limit}`;
  return cachedFetch(key, TTL.SMART_MONEY, async () => {
    const json = await nansenPost<{ data: NansenNetflowRow[] }>(
      "/api/v1/smart-money/netflow",
      {
        chains: [...chains],
        order_by: [{ field: "net_flow_24h_usd", direction: "DESC" }],
        pagination: { page: 1, per_page: limit },
      },
    );
    return (json.data ?? []).map((r) => ({
      symbol: r.token_symbol,
      tokenAddress: r.token_address,
      chain: r.chain,
      netFlow1h: r.net_flow_1h_usd,
      netFlow24h: r.net_flow_24h_usd,
      netFlow7d: r.net_flow_7d_usd,
      traderCount: r.trader_count,
      marketCapUsd: r.market_cap_usd,
      verdict: verdictFromFlow(r.net_flow_24h_usd),
      asOf: Date.now(),
      source: "nansen" as const,
    }));
  });
}

/** Per-token smart money flow on a specific chain. Uses the screener as the
 * authoritative source for per-token volumes — it returns price, buy/sell
 * volume, and netflow in one shot.
 */
export async function nansenTokenFlow(opts: {
  symbol: string;
  tokenAddress?: string;
  chain?: string;
  timeframe?: "1h" | "24h" | "7d";
}): Promise<SmartMoneyFlow | null> {
  const chain = opts.chain ?? "mantle";
  const tf = opts.timeframe ?? "24h";
  const key = `nansen:tokenFlow:${chain}:${opts.tokenAddress ?? opts.symbol}:${tf}`;
  return cachedFetch(key, TTL.SMART_MONEY, async () => {
    // Strategy: query the token-screener with a chain filter and pick the
    // matching token by address or symbol. If the address is in our list we
    // also enrich with tgm/flow-intelligence.
    try {
      const json = await nansenPost<{ data: NansenScreenerRow[] }>(
        "/api/v1/token-screener",
        {
          chains: [chain],
          timeframe: tf,
          pagination: { page: 1, per_page: 50 },
          order_by: [{ field: "volume", direction: "DESC" }],
        },
      );
      const rows = json.data ?? [];
      const wanted = opts.tokenAddress?.toLowerCase();
      const symLower = opts.symbol.toLowerCase();
      const match = rows.find(r =>
        (wanted && r.token_address.toLowerCase() === wanted) ||
        r.token_symbol.toLowerCase() === symLower ||
        r.token_symbol.toLowerCase() === symLower.replace(/x$/, ""),
      );
      if (!match) return null;
      return {
        symbol: match.token_symbol,
        tokenAddress: match.token_address,
        chain: match.chain,
        netFlow24h: match.netflow,
        traderCount: match.nof_traders,
        buyVolume: match.buy_volume,
        sellVolume: match.sell_volume,
        marketCapUsd: match.market_cap_usd,
        priceUsd: match.price_usd,
        priceChange: match.price_change,
        verdict: verdictFromFlow(match.netflow),
        asOf: Date.now(),
        source: "nansen",
      };
    } catch {
      return null;
    }
  });
}

/** Flow intelligence for a specific token — richer per-token analytics. */
export async function nansenFlowIntelligence(
  chain: string,
  tokenAddress: string,
  timeframe: TGMTimeframe = "1d",
): Promise<NansenFlowIntelligence | null> {
  const key = `nansen:tgm:flowI:${chain}:${tokenAddress}:${timeframe}`;
  return cachedFetch(key, TTL.SMART_MONEY, async () => {
    try {
      const json = await nansenPost<NansenFlowIntelligence>(
        "/api/v1/tgm/flow-intelligence",
        { chain, token_address: tokenAddress, timeframe },
      );
      return json;
    } catch {
      return null;
    }
  });
}
