/**
 * Orchestrates a single user turn for Stocky:
 *   user message → AltLLM with tools → (tool dispatch) → AltLLM → assistant message
 *
 * Streams progress via the `onProgress` callback so the UI can show
 * a live tool trace ("Calling Nansen…").
 */

import { altLLMChat, altLLMMessage, altLLMToolCalls } from "./altllm";
import { TOOLS, runTool } from "./tools";
import { buildSystemPrompt } from "./prompts";
import type { LangCode } from "./lang";
import { detectLang, getLangProfile } from "./lang";
import { perStockAnalysisPrompt } from "./prompts";
import type {
  ConciergeMessage,
  InlineCard,
  ToolCallTrace,
  AltLLMChatMessage,
} from "./types";

export interface StockyTurnInput {
  history: ConciergeMessage[];     // ordered, includes previous user/assistant turns
  userText: string;
  xStockCount: number;
  hasWallet: boolean;
  forcedLang?: LangCode;           // override detection (e.g. user picked a language)
  signal?: AbortSignal;
}

export interface StockyTurnProgress {
  trace: ToolCallTrace[];
  status: "running" | "thinking" | "done" | "error";
}

export interface StockyTurnResult {
  message: ConciergeMessage;
  lang: LangCode;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function historyToAltLLM(history: ConciergeMessage[]): AltLLMChatMessage[] {
  // We only send the recent textual transcript (no tool messages from prior turns).
  return history
    .filter(m => m.role === "user" || m.role === "assistant")
    .slice(-10)
    .map(m => ({ role: m.role as "user" | "assistant", content: m.text }));
}

export async function runStockyTurn(
  input: StockyTurnInput,
  onProgress?: (p: StockyTurnProgress) => void,
): Promise<StockyTurnResult> {
  const lang = input.forcedLang ?? detectLang(input.userText);
  const sys = buildSystemPrompt({
    lang,
    xStockCount: input.xStockCount,
    hasWallet: input.hasWallet,
  });

  const messages: AltLLMChatMessage[] = [
    { role: "system", content: sys },
    ...historyToAltLLM(input.history),
    { role: "user", content: input.userText },
  ];

  const trace: ToolCallTrace[] = [];
  const cards: InlineCard[] = [];

  // up to 4 turns: typically 1 tool round, sometimes 2.
  // On the final round we drop `tools` so the model is forced to write a final answer.
  const MAX_ROUNDS = 4;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    onProgress?.({ trace, status: "thinking" });
    const isFinalRound = round === MAX_ROUNDS - 1;
    // On the final round we (a) drop `tools` to force a text answer, and
    // (b) switch to altllm-basic (non-reasoning) so the whole token budget
    // is spent on the answer instead of internal reasoning_content.
    const resp = await altLLMChat(
      isFinalRound
        ? { model: "altllm-basic", messages, max_tokens: 700, temperature: 0.4 }
        : { messages, tools: TOOLS, tool_choice: "auto", max_tokens: 900 },
      { signal: input.signal, timeoutMs: 60_000 },
    );
    const msg = altLLMMessage(resp);
    const calls = altLLMToolCalls(resp);

    if (!calls || calls.length === 0) {
      // No tool calls requested. Usually means the model produced a final answer.
      // But altllm-standard can also return empty content here (reasoning_content
      // exhausted the token budget). If so, retry once with altllm-basic before
      // giving up — this guarantees the user sees a real answer.
      let finalText = (msg?.content ?? "").trim();
      if (!finalText) {
        const retry = await altLLMChat(
          { model: "altllm-basic", messages, max_tokens: 700, temperature: 0.4 },
          { signal: input.signal, timeoutMs: 60_000 },
        );
        finalText = (altLLMMessage(retry)?.content ?? "").trim();
      }
      return {
        message: {
          id: nextId("a"),
          role: "assistant",
          text: finalText || "(no response)",
          cards: cards.length ? cards : undefined,
          toolTrace: trace.length ? trace : undefined,
          lang,
          ts: Date.now(),
        },
        lang,
      };
    }

    // Add the assistant message that requested tools (must be present for tool replies to be valid).
    messages.push({
      role: "assistant",
      content: msg?.content ?? "",
      tool_calls: calls,
    });

    // Execute tool calls in parallel.
    const local: ToolCallTrace[] = calls.map(c => {
      const args = safeParseJson(c.function.arguments) as Record<string, unknown>;
      return { id: c.id, name: c.function.name as ToolCallTrace["name"], args, status: "running" as const };
    });
    trace.push(...local);
    onProgress?.({ trace, status: "running" });

    const results = await Promise.all(local.map(async (t) => {
      const out = await runTool(t.name, t.args);
      t.status = out.result.ok ? "done" : "error";
      t.result = out.result;
      if (out.card) cards.push(out.card);
      onProgress?.({ trace, status: "running" });
      return { call: t, out };
    }));

    // Feed tool outputs back to the model.
    for (const { call, out } of results) {
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.name,
        content: JSON.stringify(out.result),
      });
    }
  }

  // Hit the round cap — return whatever we have.
  return {
    message: {
      id: nextId("a"),
      role: "assistant",
      text: "I gathered the data but ran out of reasoning rounds. Try a more specific question.",
      cards: cards.length ? cards : undefined,
      toolTrace: trace.length ? trace : undefined,
      lang,
      ts: Date.now(),
    },
    lang,
  };
}

/** Convenience: build the prompt used when the user clicks the "AI" button
 * on a specific xStock card, then run a turn for it. */
export async function runStockyXStockAnalysis(opts: {
  symbol: string;
  history?: ConciergeMessage[];
  xStockCount: number;
  hasWallet: boolean;
  lang?: LangCode;
  signal?: AbortSignal;
}, onProgress?: (p: StockyTurnProgress) => void): Promise<StockyTurnResult> {
  const lang = opts.lang ?? "en";
  const langName = getLangProfile(lang).promptLabel;
  return runStockyTurn({
    history: opts.history ?? [],
    userText: perStockAnalysisPrompt(opts.symbol, lang) + ` (UI lang: ${langName})`,
    xStockCount: opts.xStockCount,
    hasWallet: opts.hasWallet,
    forcedLang: lang,
    signal: opts.signal,
  }, onProgress);
}

function safeParseJson(s: string | undefined): unknown {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
}
