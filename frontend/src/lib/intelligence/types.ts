/**
 * Shared types for the Stocky intelligence layer.
 */

export interface XStockMeta {
  symbol: string;        // e.g. "NVDAx"
  name: string;          // e.g. "NVIDIA xStock"
  baseTicker: string;    // underlying real-world ticker, e.g. "NVDA"
  mantleAddress?: string;
  wrapperAddress?: string;
  decimals?: number;
  sector?: string;
}

export interface SmartMoneyFlow {
  symbol: string;
  tokenAddress: string;
  chain: string;
  netFlow1h?: number;
  netFlow24h?: number;
  netFlow7d?: number;
  traderCount?: number;
  buyVolume?: number;
  sellVolume?: number;
  marketCapUsd?: number;
  priceUsd?: number;
  priceChange?: number;
  verdict: "ACCUMULATE" | "DISTRIBUTE" | "NEUTRAL" | "NO_DATA";
  asOf: number;
  source: "nansen" | "demo";
}

export interface KolMention {
  username: string;
  isVerified: boolean;
  link: string;
  text?: string;
  likes: number;
  views: number;
  reposts: number;
  smartReposts: number;
  ctReposts: number;
  mentionedAt: string;
}

export interface KolSentiment {
  ticker: string;
  score: number; // 0..100
  change24h?: number;
  totalMentions: number;
  totalViews: number;
  topMentions: KolMention[];
  asOf: number;
  source: "elfa" | "demo";
}

export interface TokenPrice {
  symbol: string;
  priceUsd: number;
  liquidityUsd?: number;
  source: "fluxion" | "nansen" | "demo";
  asOf: number;
}

export type ToolName =
  | "get_smart_money"
  | "get_kol_sentiment"
  | "get_kol_mentions"
  | "get_xstock_price"
  | "get_xstock_info"
  | "list_xstocks"
  | "get_market_pulse"
  | "compare_xstocks";

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  meta?: { source: string; asOf: number };
}

export interface ToolCallPlan {
  id: string;
  name: ToolName;
  args: Record<string, unknown>;
}

export interface ToolCallTrace {
  id: string;
  name: ToolName;
  args: Record<string, unknown>;
  status: "running" | "done" | "error";
  result?: ToolResult;
}

export type CardKind =
  | "smart_money"
  | "kol_sentiment"
  | "kol_mentions"
  | "price"
  | "token_info"
  | "compare";

export interface InlineCard {
  kind: CardKind;
  payload: unknown;
}

export interface QuickAction {
  label: string;
  intent: "swap" | "ask" | "select_xstock" | "open_tab";
  payload?: Record<string, unknown>;
}

export interface ConciergeMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  cards?: InlineCard[];
  quickActions?: QuickAction[];
  toolTrace?: ToolCallTrace[];
  lang?: string;
  ts: number;
}

export interface AltLLMTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AltLLMChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

export interface AltLLMResponse {
  id?: string;
  choices: Array<{
    index: number;
    finish_reason: string;
    message: AltLLMChatMessage & { reasoning_content?: string };
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  error?: { message: string; type: string };
}
