/**
 * AltLLM thin client.
 *
 * Wraps the OpenAI-compatible /v1/chat/completions endpoint exposed by
 * https://app.stockpilotai.xyz/api/altllm/ (api keys injected by nginx).
 *
 * AltLLM (`altllm-standard`) natively supports `tools`, `tool_choice`,
 * `json_mode`, `structured_outputs`. We use the standard tool-calling
 * loop: send messages + tool defs → if model returns tool_calls, dispatch
 * them, append the results as role=tool messages, call again.
 */

import { ALTLLM_BASE, ALTLLM_DEFAULT_MODEL, ALTLLM_MIN_MAX_TOKENS } from "./config";
import type {
  AltLLMChatMessage,
  AltLLMResponse,
  AltLLMTool,
} from "./types";

export interface AltLLMRequest {
  model?: string;
  messages: AltLLMChatMessage[];
  tools?: AltLLMTool[];
  tool_choice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  response_format?: { type: "text" | "json_object" };
}

export interface AltLLMCallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function altLLMChat(
  req: AltLLMRequest,
  opts: AltLLMCallOptions = {},
): Promise<AltLLMResponse> {
  const url = `${ALTLLM_BASE()}/v1/chat/completions`;
  const body: AltLLMRequest = {
    model: req.model ?? ALTLLM_DEFAULT_MODEL,
    messages: req.messages,
    tools: req.tools,
    tool_choice: req.tools && req.tools.length > 0 ? (req.tool_choice ?? "auto") : undefined,
    max_tokens: Math.max(ALTLLM_MIN_MAX_TOKENS, req.max_tokens ?? 600),
    temperature: req.temperature ?? 0.4,
    top_p: req.top_p,
    response_format: req.response_format,
  };

  const ac = new AbortController();
  const tid = opts.timeoutMs ? setTimeout(() => ac.abort(), opts.timeoutMs) : null;
  const externalSignal = opts.signal;
  if (externalSignal) {
    if (externalSignal.aborted) ac.abort();
    else externalSignal.addEventListener("abort", () => ac.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } finally {
    if (tid) clearTimeout(tid);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AltLLM HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as AltLLMResponse;
  if (json.error) throw new Error(`AltLLM: ${json.error.message}`);
  return json;
}

/** Helper: extract the message from a successful response. */
export function altLLMMessage(r: AltLLMResponse) {
  return r.choices?.[0]?.message;
}

/** Helper: did the model request any tools? */
export function altLLMToolCalls(r: AltLLMResponse) {
  return altLLMMessage(r)?.tool_calls ?? [];
}
