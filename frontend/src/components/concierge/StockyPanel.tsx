"use client";

/**
 * The actual chat surface — used both inside the floating side-sheet
 * and the dedicated Stocky tab. Set `variant` to control sizing.
 */

import { useEffect, useRef, useState } from "react";
import { useStocky } from "./StockyContext";
import { StockyMessage } from "./StockyMessage";
import { StockyToolTrace } from "./StockyToolTrace";
import { suggestedPrompts } from "@/lib/intelligence/prompts";
import { uiStrings } from "@/lib/intelligence/lang";

interface Props {
  variant: "panel" | "page";
  onClose?: () => void;
}

export function StockyPanel({ variant, onClose }: Props) {
  const { state, send, reset } = useStocky();
  const t = uiStrings(state.lang);
  const [input, setInput] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [state.messages.length, state.pending?.trace.length]);

  const submit = async () => {
    const v = input.trim();
    if (!v || state.pending) return;
    setInput("");
    await send(v);
  };

  const empty = state.messages.length === 0;
  const prompts = suggestedPrompts(state.lang);

  return (
    <div className={
      variant === "panel"
        ? "h-full flex flex-col bg-[#0a0f0c]"
        : "flex flex-col h-full max-h-[calc(100vh-140px)] rounded-2xl border border-white/10 bg-[#0a0f0c]"
    }>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-[13px] font-bold text-black">
            S
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0a0f0c] animate-pulse" />
          </div>
          <div>
            <div className="text-[14px] font-semibold text-white/95 leading-tight">{t.title}</div>
            <div className="text-[10px] text-white/40 tracking-wide">{t.subtitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {state.messages.length > 0 && (
            <button
              onClick={reset}
              className="text-[11px] px-2 py-1 rounded-md hover:bg-white/5 text-white/50 hover:text-white/80 transition-colors"
              title={t.newConversation}
            >
              {t.newConversation}
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/5 text-white/50 hover:text-white/90 transition-colors"
              aria-label="Close"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {empty ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20 px-4 py-3">
              <div className="text-[13px] text-white/85 leading-relaxed">
                {t.greeting}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold tracking-wider text-white/40 uppercase mb-2">{t.promptsHeader}</div>
              <div className="space-y-1.5">
                {prompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    disabled={!!state.pending}
                    className="w-full text-left text-[12px] text-white/75 hover:text-white/95 px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.08] hover:border-white/[0.15] transition-all"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          state.messages.map((m) => (
            <StockyMessage key={m.id} message={m} lang={state.lang} />
          ))
        )}
        {state.pending && (
          <div className="flex justify-start gap-2">
            <div className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-[11px] font-bold text-black">S</div>
            <div className="max-w-[92%] space-y-2">
              {state.pending.trace.length > 0 ? (
                <StockyToolTrace trace={state.pending.trace} lang={state.lang} />
              ) : (
                <div className="inline-flex items-center gap-1.5 text-[12px] text-white/50 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/10">
                  <span className="inline-flex gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-emerald-300 animate-pulse" />
                    <span className="w-1 h-1 rounded-full bg-emerald-300 animate-pulse" style={{ animationDelay: "150ms" }} />
                    <span className="w-1 h-1 rounded-full bg-emerald-300 animate-pulse" style={{ animationDelay: "300ms" }} />
                  </span>
                  {t.thinking}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-white/10 px-3 py-3 shrink-0">
        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="flex items-end gap-2 rounded-xl border border-white/15 bg-white/[0.03] focus-within:border-emerald-400/40 px-3 py-2 transition-colors"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            placeholder={t.inputPlaceholder}
            rows={1}
            className="flex-1 resize-none bg-transparent text-[13px] text-white/90 placeholder:text-white/30 outline-none max-h-32"
            disabled={!!state.pending}
          />
          <button
            type="submit"
            disabled={!input.trim() || !!state.pending}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 disabled:opacity-30 disabled:cursor-not-allowed text-black hover:brightness-110 transition-all"
            aria-label={t.send}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 8L14 2L11 8L14 14L2 8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="currentColor"/>
            </svg>
          </button>
        </form>
        <div className="mt-1.5 text-[9px] text-white/30 text-center tracking-wide">
          {t.poweredBy}
        </div>
      </div>
    </div>
  );
}
