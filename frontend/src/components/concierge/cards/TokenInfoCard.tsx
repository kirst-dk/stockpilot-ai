"use client";

import type { XStockMeta } from "@/lib/intelligence/types";

export function TokenInfoCard({ data }: { data: XStockMeta }) {
  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-blue-400" />
        <span className="text-[10px] font-semibold tracking-wider text-white/50 uppercase">xStock Info</span>
      </div>
      <div>
        <div className="text-sm font-semibold text-white/90">{data.symbol}</div>
        <div className="text-[11px] text-white/60">{data.name}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
        <div>
          <div className="text-[9px] text-white/40 uppercase">Underlying</div>
          <div className="text-xs text-white/70">{data.baseTicker}</div>
        </div>
        <div>
          <div className="text-[9px] text-white/40 uppercase">Chain</div>
          <div className="text-xs text-white/70">Mantle</div>
        </div>
      </div>
      {data.mantleAddress && (
        <a
          href={`https://mantlescan.xyz/token/${data.mantleAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-[9px] text-blue-300 hover:text-blue-200 truncate font-mono"
        >
          {data.mantleAddress}
        </a>
      )}
    </div>
  );
}
