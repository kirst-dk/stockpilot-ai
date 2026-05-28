/**
 * Tool definitions for AltLLM and a dispatcher that executes them
 * against ELFA, Nansen, and our internal helpers.
 *
 * The flow is:
 *   1. We send AltLLM the user's message + the list of TOOLS below.
 *   2. AltLLM either answers directly or returns one or more tool_calls.
 *   3. For each tool_call we run `runTool(name, args)` and feed the
 *      result back to the model as role="tool" messages.
 *   4. We repeat once more — usually that's enough for a final answer.
 */

import { elfaSentiment, elfaTopMentions, elfaTrendingTokens } from "./elfa";
import { nansenTokenFlow, nansenTopNetflow } from "./nansen";
import { getXStockCatalog, resolveXStock } from "./xstocks";
import type { AltLLMTool, ToolName, ToolResult, InlineCard } from "./types";

export const TOOLS: AltLLMTool[] = [
  {
    type: "function",
    function: {
      name: "get_smart_money",
      description:
        "Get smart-money / institutional net flow for a specific xStock or token symbol. " +
        "Returns 24h net buy/sell USD volume, trader count, and a verdict " +
        "(ACCUMULATE / DISTRIBUTE / NEUTRAL / NO_DATA). Call this for any question about " +
        "who is buying, accumulating, dumping, institutional positioning, or 'is X bullish on-chain'.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "xStock symbol like NVDAx, AAPLx, or underlying ticker like NVDA, AAPL" },
          timeframe: { type: "string", enum: ["1h", "24h", "7d"], description: "Lookback window. Default 24h." },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_kol_sentiment",
      description:
        "Aggregated KOL sentiment from crypto Twitter via ELFA AI Entity Graph. " +
        "Returns a 0-100 sentiment score, total mentions, total views, plus the top " +
        "verified KOL mentions. Use this for 'what are people saying about X', 'why is X moving', " +
        "or any narrative / sentiment question.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Ticker (NVDA, AAPL, BTC etc.) — use the underlying ticker, not the wrapped xStock symbol." },
          timeframe: { type: "string", enum: ["1h", "24h", "7d", "30d"], description: "Window. Default 24h." },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_kol_mentions",
      description:
        "Raw list of top KOL mentions for a ticker — engagement-weighted. Use this when the user explicitly asks for quotes, examples, or what specific KOLs are saying.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          limit: { type: "number", description: "Max number of mentions, 1-10. Default 6." },
          timeframe: { type: "string", enum: ["1h", "24h", "7d", "30d"] },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_xstock_info",
      description:
        "Static metadata about an xStock: full name, underlying ticker, Mantle contract address. " +
        "Use this for definitional questions or when you need the on-chain address.",
      parameters: {
        type: "object",
        properties: { symbol: { type: "string" } },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_xstocks",
      description:
        "Return a short listing of available xStocks (symbol + name). Useful for 'what's available', 'show me all xStocks' style questions. Returns up to 30 entries.",
      parameters: {
        type: "object",
        properties: {
          filter: { type: "string", description: "Optional substring to filter by symbol or name" },
          limit: { type: "number", description: "Max entries, default 20" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_market_pulse",
      description:
        "Top tokens by smart-money 24h net flow and trending Twitter tickers. Use this for " +
        "general market questions like 'what's hot', 'live market brief', 'opportunities now'.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number", description: "Top N items per category, default 5" } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_xstocks",
      description:
        "Compare 2-4 xStocks side-by-side on smart money flow and KOL sentiment.",
      parameters: {
        type: "object",
        properties: {
          symbols: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
        },
        required: ["symbols"],
      },
    },
  },
];

export interface ToolDispatchOutput {
  result: ToolResult;
  card?: InlineCard;
}

export async function runTool(
  name: ToolName | string,
  argsRaw: unknown,
): Promise<ToolDispatchOutput> {
  const args = (argsRaw && typeof argsRaw === "object" ? argsRaw : {}) as Record<string, unknown>;
  try {
    switch (name) {
      case "get_smart_money": {
        const symbol = String(args.symbol ?? "");
        if (!symbol) return { result: { ok: false, error: "symbol required" } };
        const meta = resolveXStock(symbol);
        const flow = await nansenTokenFlow({
          symbol: meta?.symbol ?? symbol,
          tokenAddress: meta?.mantleAddress,
          chain: "mantle",
        });
        if (!flow) {
          // Fallback: maybe smart money tracks it on ethereum (underlying address unknown)
          const top = await nansenTopNetflow(["ethereum", "mantle"], 50);
          const hit = top.find(t =>
            t.symbol.toUpperCase() === symbol.toUpperCase() ||
            (meta && t.symbol.toUpperCase() === meta.baseTicker),
          );
          if (hit) {
            return {
              result: { ok: true, data: hit, meta: { source: "nansen", asOf: hit.asOf } },
              card: { kind: "smart_money", payload: hit },
            };
          }
          return { result: { ok: true, data: { symbol, verdict: "NO_DATA" }, meta: { source: "nansen", asOf: Date.now() } } };
        }
        return {
          result: { ok: true, data: flow, meta: { source: "nansen", asOf: flow.asOf } },
          card: { kind: "smart_money", payload: flow },
        };
      }
      case "get_kol_sentiment": {
        const symbol = String(args.symbol ?? "");
        const tf = (args.timeframe as "1h" | "24h" | "7d" | "30d") ?? "24h";
        const meta = resolveXStock(symbol);
        const ticker = meta?.baseTicker ?? symbol.replace(/x$/i, "").toUpperCase();
        const sentiment = await elfaSentiment(ticker, tf);
        return {
          result: { ok: true, data: sentiment, meta: { source: "elfa", asOf: sentiment.asOf } },
          card: { kind: "kol_sentiment", payload: sentiment },
        };
      }
      case "get_kol_mentions": {
        const symbol = String(args.symbol ?? "");
        const limit = Number(args.limit ?? 6);
        const tf = (args.timeframe as "1h" | "24h" | "7d" | "30d") ?? "24h";
        const meta = resolveXStock(symbol);
        const ticker = meta?.baseTicker ?? symbol.replace(/x$/i, "").toUpperCase();
        const mentions = await elfaTopMentions(ticker, tf, Math.max(1, Math.min(10, limit)));
        return {
          result: { ok: true, data: { ticker, mentions }, meta: { source: "elfa", asOf: Date.now() } },
          card: { kind: "kol_mentions", payload: { ticker, mentions } },
        };
      }
      case "get_xstock_info": {
        const symbol = String(args.symbol ?? "");
        const meta = resolveXStock(symbol);
        if (!meta) return { result: { ok: false, error: `xStock not found: ${symbol}` } };
        return {
          result: { ok: true, data: meta, meta: { source: "catalog", asOf: Date.now() } },
          card: { kind: "token_info", payload: meta },
        };
      }
      case "list_xstocks": {
        const filter = String(args.filter ?? "").toLowerCase();
        const limit = Math.max(1, Math.min(30, Number(args.limit ?? 20)));
        const cat = getXStockCatalog().filter(c =>
          !filter || c.symbol.toLowerCase().includes(filter) || c.name.toLowerCase().includes(filter),
        ).slice(0, limit);
        return { result: { ok: true, data: cat, meta: { source: "catalog", asOf: Date.now() } } };
      }
      case "get_market_pulse": {
        const limit = Math.max(1, Math.min(10, Number(args.limit ?? 5)));
        const [topInflows, trending] = await Promise.all([
          nansenTopNetflow(["mantle", "ethereum"], limit),
          elfaTrendingTokens("24h", limit),
        ]);
        return { result: { ok: true, data: { topInflows, trending }, meta: { source: "nansen+elfa", asOf: Date.now() } } };
      }
      case "compare_xstocks": {
        const symbols = Array.isArray(args.symbols) ? (args.symbols as string[]) : [];
        if (symbols.length < 2) return { result: { ok: false, error: "Need at least 2 symbols" } };
        const rows = await Promise.all(symbols.slice(0, 4).map(async s => {
          const meta = resolveXStock(s);
          const sym = meta?.symbol ?? s;
          const [flow, sent] = await Promise.all([
            nansenTokenFlow({ symbol: sym, tokenAddress: meta?.mantleAddress, chain: "mantle" }),
            elfaSentiment(meta?.baseTicker ?? sym.replace(/x$/i, "").toUpperCase(), "24h").catch(() => null),
          ]);
          return { symbol: sym, flow, sentiment: sent };
        }));
        return {
          result: { ok: true, data: rows, meta: { source: "nansen+elfa", asOf: Date.now() } },
          card: { kind: "compare", payload: rows },
        };
      }
      default:
        return { result: { ok: false, error: `Unknown tool: ${name}` } };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { result: { ok: false, error: msg } };
  }
}
