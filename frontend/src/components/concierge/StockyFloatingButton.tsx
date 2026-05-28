"use client";

import { useEffect } from "react";
import { useStocky } from "./StockyContext";
import { StockyPanel } from "./StockyPanel";
import { uiStrings } from "@/lib/intelligence/lang";

export function StockyFloatingButton() {
  const { state, open, close } = useStocky();
  const t = uiStrings(state.lang);

  // Close on Esc
  useEffect(() => {
    if (!state.open || state.view !== "floating") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.open, state.view, close]);

  const showOverlay = state.open && state.view === "floating";

  return (
    <>
      {/* Floating trigger button */}
      {!showOverlay && (
        <button
          onClick={() => open("floating")}
          className="fixed bottom-6 right-6 z-40 group"
          aria-label={`Open ${t.title}`}
        >
          <div className="relative flex items-center gap-2.5 pl-2.5 pr-4 py-2.5 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 shadow-[0_8px_32px_rgba(16,185,129,0.35)] hover:shadow-[0_12px_36px_rgba(16,185,129,0.55)] transition-all border border-emerald-300/30">
            <div className="relative w-7 h-7 rounded-full bg-black/30 flex items-center justify-center text-[12px] font-bold text-white">
              S
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
            </div>
            <div className="text-left">
              <div className="text-[12px] font-bold text-white leading-none">Stocky</div>
              <div className="text-[9px] text-white/80 tracking-wide leading-tight mt-0.5">Ask AI · Live</div>
            </div>
          </div>
          <span className="absolute inset-0 rounded-full bg-emerald-400/30 animate-ping pointer-events-none" />
        </button>
      )}

      {/* Side sheet */}
      <div
        className={`fixed inset-0 z-50 pointer-events-none transition-opacity ${showOverlay ? "opacity-100" : "opacity-0"}`}
        aria-hidden={!showOverlay}
      >
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity ${showOverlay ? "opacity-100 pointer-events-auto" : "opacity-0"}`}
          onClick={close}
        />
        <aside
          className={`absolute top-0 right-0 h-full w-full sm:w-[420px] bg-[#0a0f0c] shadow-2xl border-l border-white/10 transform transition-transform ${showOverlay ? "translate-x-0 pointer-events-auto" : "translate-x-full"}`}
        >
          <StockyPanel variant="panel" onClose={close} />
        </aside>
      </div>
    </>
  );
}
