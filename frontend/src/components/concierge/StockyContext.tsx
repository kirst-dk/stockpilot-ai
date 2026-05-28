"use client";

/**
 * Global state for Stocky — chat history, current language, ongoing turn.
 * Wired so the floating button, the "Stocky" tab, and the per-xStock
 * "AI" buttons all talk to the same instance.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { ConciergeMessage, ToolCallTrace } from "@/lib/intelligence/types";
import { detectLang, type LangCode } from "@/lib/intelligence/lang";
import { runStockyTurn, runStockyXStockAnalysis } from "@/lib/intelligence/stocky";

interface PendingTurn {
  id: string;
  userText: string;
  trace: ToolCallTrace[];
  source: "user" | "xstock_button";
}

interface StockyState {
  open: boolean;
  view: "floating" | "tab";
  messages: ConciergeMessage[];
  lang: LangCode;
  pending: PendingTurn | null;
  pendingError: string | null;
  xStockCount: number;
  hasWallet: boolean;
}

type Action =
  | { type: "open"; view: "floating" | "tab" }
  | { type: "close" }
  | { type: "toggle" }
  | { type: "set_view"; view: "floating" | "tab" }
  | { type: "set_lang"; lang: LangCode }
  | { type: "add_message"; message: ConciergeMessage }
  | { type: "begin_turn"; pending: PendingTurn }
  | { type: "progress"; trace: ToolCallTrace[] }
  | { type: "end_turn"; success: boolean; error?: string }
  | { type: "reset" }
  | { type: "set_env"; xStockCount: number; hasWallet: boolean };

function nextId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const initialState: StockyState = {
  open: false,
  view: "floating",
  messages: [],
  lang: "en",
  pending: null,
  pendingError: null,
  xStockCount: 0,
  hasWallet: false,
};

function reducer(state: StockyState, action: Action): StockyState {
  switch (action.type) {
    case "open":      return { ...state, open: true,  view: action.view };
    case "close":     return { ...state, open: false };
    case "toggle":    return { ...state, open: !state.open };
    case "set_view":  return { ...state, view: action.view, open: true };
    case "set_lang":  return { ...state, lang: action.lang };
    case "add_message": return { ...state, messages: [...state.messages, action.message] };
    case "begin_turn":   return { ...state, pending: action.pending, pendingError: null };
    case "progress":     return state.pending
      ? { ...state, pending: { ...state.pending, trace: action.trace } }
      : state;
    case "end_turn":     return { ...state, pending: null, pendingError: action.success ? null : (action.error ?? "Failed") };
    case "reset":        return { ...state, messages: [], pending: null, pendingError: null };
    case "set_env":      return { ...state, xStockCount: action.xStockCount, hasWallet: action.hasWallet };
    default: return state;
  }
}

interface StockyContextValue {
  state: StockyState;
  open: (view?: "floating" | "tab") => void;
  close: () => void;
  setView: (view: "floating" | "tab") => void;
  send: (text: string) => Promise<void>;
  analyzeXStock: (symbol: string) => Promise<void>;
  reset: () => void;
  setEnv: (info: { xStockCount: number; hasWallet: boolean }) => void;
}

const Ctx = createContext<StockyContextValue | null>(null);

export function StockyProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const send = useCallback(async (text: string) => {
    if (!text.trim()) return;
    const cur = stateRef.current;
    if (cur.pending) return;

    // detect language on the user's input — sticky once non-English
    const detected = detectLang(text);
    const lang: LangCode = cur.messages.length === 0 ? detected : (cur.lang !== "en" ? cur.lang : detected);
    if (lang !== cur.lang) dispatch({ type: "set_lang", lang });

    const userMsg: ConciergeMessage = {
      id: nextId("u"),
      role: "user",
      text: text.trim(),
      lang,
      ts: Date.now(),
    };
    dispatch({ type: "add_message", message: userMsg });
    dispatch({ type: "begin_turn", pending: { id: userMsg.id, userText: text, trace: [], source: "user" } });

    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const { message } = await runStockyTurn({
        history: stateRef.current.messages,
        userText: text,
        xStockCount: cur.xStockCount,
        hasWallet: cur.hasWallet,
        forcedLang: lang,
        signal: ac.signal,
      }, (p) => dispatch({ type: "progress", trace: p.trace }));
      dispatch({ type: "add_message", message });
      dispatch({ type: "end_turn", success: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      dispatch({ type: "end_turn", success: false, error: msg });
      const errorMsg: ConciergeMessage = {
        id: nextId("e"),
        role: "assistant",
        text: `⚠️ ${msg}`,
        lang,
        ts: Date.now(),
      };
      dispatch({ type: "add_message", message: errorMsg });
    }
  }, []);

  const analyzeXStock = useCallback(async (symbol: string) => {
    const cur = stateRef.current;
    if (cur.pending) return;
    if (!cur.open) dispatch({ type: "open", view: "floating" });

    const lang = cur.lang === "en" ? cur.lang : cur.lang;
    const userMsg: ConciergeMessage = {
      id: nextId("u"),
      role: "user",
      text: `🔍 Analyze ${symbol}`,
      lang,
      ts: Date.now(),
    };
    dispatch({ type: "add_message", message: userMsg });
    dispatch({ type: "begin_turn", pending: { id: userMsg.id, userText: symbol, trace: [], source: "xstock_button" } });

    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const { message } = await runStockyXStockAnalysis({
        symbol,
        history: [],
        xStockCount: cur.xStockCount,
        hasWallet: cur.hasWallet,
        lang,
        signal: ac.signal,
      }, (p) => dispatch({ type: "progress", trace: p.trace }));
      dispatch({ type: "add_message", message });
      dispatch({ type: "end_turn", success: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      dispatch({ type: "end_turn", success: false, error: msg });
    }
  }, []);

  const value = useMemo<StockyContextValue>(() => ({
    state,
    open: (view: "floating" | "tab" = "floating") => dispatch({ type: "open", view }),
    close: () => dispatch({ type: "close" }),
    setView: (view: "floating" | "tab") => dispatch({ type: "set_view", view }),
    send,
    analyzeXStock,
    reset: () => dispatch({ type: "reset" }),
    setEnv: (info: { xStockCount: number; hasWallet: boolean }) => dispatch({ type: "set_env", ...info }),
  }), [state, send, analyzeXStock]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStocky() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStocky must be used inside StockyProvider");
  return v;
}
