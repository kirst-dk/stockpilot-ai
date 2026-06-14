"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { fetchStockQuotes, REFERENCE_QUOTES, type StockQuote } from "@/lib/marketPrices";

function QuoteItem({ q }: { q: StockQuote }) {
  const up = q.change >= 0;
  return (
    <span className="inline-flex items-center gap-2 px-4 whitespace-nowrap">
      <span className="font-semibold text-[12.5px] text-white/90">{q.symbol}</span>
      <span className="text-[12.5px] text-white/55 tabular-nums">${q.price.toFixed(2)}</span>
      <span
        className="inline-flex items-center gap-0.5 text-[11.5px] font-medium tabular-nums"
        style={{ color: up ? "#34e3b0" : "#ff6b81" }}
      >
        {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        {up ? "+" : ""}{q.change.toFixed(2)}%
      </span>
    </span>
  );
}

/** Horizontal auto-scrolling xStock price ticker (stock tickers, not crypto). */
export function Ticker() {
  const [quotes, setQuotes] = useState<StockQuote[]>(REFERENCE_QUOTES);

  useEffect(() => {
    let alive = true;
    fetchStockQuotes().then((q) => { if (alive && q.length) setQuotes(q); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const row = [...quotes, ...quotes]; // duplicate for seamless loop
  return (
    <div className="relative overflow-hidden border-y border-white/[0.06] bg-white/[0.015]">
      <div className="flex items-center py-2 animate-[scroll_42s_linear_infinite] hover:[animation-play-state:paused]">
        {row.map((q, i) => (
          <QuoteItem key={`${q.symbol}-${i}`} q={q} />
        ))}
      </div>
      {/* edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#070a12] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#070a12] to-transparent" />
    </div>
  );
}
