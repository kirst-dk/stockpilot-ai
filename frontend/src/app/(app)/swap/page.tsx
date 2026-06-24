"use client";

import { useState } from "react";
import { ArrowLeftRight, Droplets } from "lucide-react";
import { SwapTab, PoolsTab, useAppData } from "@/components/AppCore";
import { POOLS_ENABLED } from "@/lib/flags";

export default function SwapPage() {
  const d = useAppData();
  const [view, setView] = useState<"swap" | "pools">("swap");
  const showPools = POOLS_ENABLED && view === "pools";

  // Pools are gated behind NEXT_PUBLIC_ENABLE_POOLS. When disabled, render the
  // Swap UI on its own with no toggle and no path into the pools view.
  if (!POOLS_ENABLED) {
    return (
      <div className="space-y-5">
        <SwapTab
          walletClient={d.walletClient}
          isConnected={d.isConnected}
          address={d.address}
          allXStocks={d.allXStocks}
          publicClient={d.publicClient}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {POOLS_ENABLED && (
        <div className="inline-flex p-1 rounded-xl sp-glass">
          {([
            { id: "swap", label: "Swap", icon: ArrowLeftRight },
            { id: "pools", label: "Liquidity Pools", icon: Droplets },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all"
              data-active={view === id}
              style={
                view === id
                  ? { background: "linear-gradient(110deg,var(--sp-mint),var(--sp-violet-soft))", color: "#06110d" }
                  : { color: "rgba(255,255,255,0.55)" }
              }
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      )}

      {showPools ? (
        <PoolsTab
          walletClient={d.walletClient}
          isConnected={d.isConnected}
          address={d.address}
          allXStocks={d.allXStocks}
        />
      ) : (
        <SwapTab
          walletClient={d.walletClient}
          isConnected={d.isConnected}
          address={d.address}
          allXStocks={d.allXStocks}
          publicClient={d.publicClient}
        />
      )}
    </div>
  );
}
