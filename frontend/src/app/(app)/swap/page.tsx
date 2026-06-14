"use client";

import { useState } from "react";
import { ArrowLeftRight, Droplets } from "lucide-react";
import { SwapTab, PoolsTab, useAppData } from "@/components/AppCore";

export default function SwapPage() {
  const d = useAppData();
  const [view, setView] = useState<"swap" | "pools">("swap");

  return (
    <div className="space-y-5">
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

      {view === "swap" ? (
        <SwapTab
          walletClient={d.walletClient}
          isConnected={d.isConnected}
          address={d.address}
          allXStocks={d.allXStocks}
          publicClient={d.publicClient}
        />
      ) : (
        <PoolsTab
          walletClient={d.walletClient}
          isConnected={d.isConnected}
          address={d.address}
          allXStocks={d.allXStocks}
        />
      )}
    </div>
  );
}
