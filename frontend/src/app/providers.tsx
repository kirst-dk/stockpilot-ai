"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, http, createConfig } from "wagmi";
import { mantle } from "wagmi/chains";
import type { Chain } from "viem";
import {
  RainbowKitProvider,
  darkTheme,
} from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { RelayKitProvider } from "@reservoir0x/relay-kit-ui";
import "@reservoir0x/relay-kit-ui/styles.css";
import { MAINNET_RELAY_API } from "@reservoir0x/relay-sdk";
import { useRelayChains } from "@reservoir0x/relay-kit-hooks";
import { ReactNode, useState, useEffect, useMemo } from "react";
import { StockyProvider } from "@/components/concierge/StockyContext";

const queryClient = new QueryClient();

const darkRelayTheme = {
  font: "Inter, sans-serif",
  primaryColor: "#3b82f6",
  focusColor: "#3b82f6",
  subtleBackgroundColor: "#111827",
  subtleBorderColor: "rgba(255,255,255,0.1)",
  text: {
    default: "#f1f5f9",
    subtle: "#94a3b8",
    error: "#ef4444",
    success: "#22c55e",
  },
  buttons: {
    primary: {
      color: "#ffffff",
      background: "#3b82f6",
      hover: { color: "#ffffff", background: "#2563eb" },
    },
    secondary: {
      color: "#93c5fd",
      background: "rgba(59,130,246,0.15)",
      hover: { color: "#bfdbfe", background: "rgba(59,130,246,0.25)" },
    },
    tertiary: {
      color: "#cbd5e1",
      background: "rgba(255,255,255,0.05)",
      hover: { color: "#e2e8f0", background: "rgba(255,255,255,0.1)" },
    },
    disabled: {
      color: "#475569",
      background: "#1e293b",
    },
  },
  input: {
    background: "rgba(255,255,255,0.05)",
    borderRadius: "12px",
    color: "#f1f5f9",
  },
  skeleton: {
    background: "rgba(255,255,255,0.06)",
  },
  anchor: {
    color: "#60a5fa",
    hover: { color: "#93c5fd" },
  },
  dropdown: {
    background: "#111827",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  modal: {
    background: "#0f172a",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "16px",
  },
  widget: {
    background: "#0d1220",
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 4px 30px rgba(0,0,0,0.3)",
    card: {
      background: "rgba(255,255,255,0.03)",
      borderRadius: "12px",
      border: "1px solid rgba(255,255,255,0.06)",
    },
    selector: {
      background: "rgba(255,255,255,0.04)",
      hover: { background: "rgba(255,255,255,0.08)" },
    },
    swapCurrencyButtonBorderColor: "rgba(59,130,246,0.3)",
    swapCurrencyButtonBorderWidth: "2px",
    swapCurrencyButtonBorderRadius: "10px",
  },
};

function RelayChainLoader({ children }: { children: ReactNode }) {
  const { data: chainsData, viemChains } = useRelayChains(MAINNET_RELAY_API);
  const [wagmiConfig, setWagmiConfig] = useState<ReturnType<typeof createConfig> | undefined>();

  const relayChains = useMemo(() => {
    if (!chainsData?.chains) return undefined;
    return chainsData.chains.filter(
      (c: any) => !c.disabled && c.vmType === "evm"
    );
  }, [chainsData]);

  useEffect(() => {
    if (!wagmiConfig && viemChains && viemChains.length > 0) {
      const chains = viemChains.length === 0 ? [mantle] : viemChains;
      const transports: Record<number, ReturnType<typeof http>> = {};
      for (const chain of chains) {
        const rpcUrl = (chain as any).rpcUrls?.default?.http?.[0];
        transports[chain.id] = rpcUrl ? http(rpcUrl) : http();
      }
      setWagmiConfig(
        createConfig({
          chains: chains as [Chain, ...Chain[]],
          transports,
        })
      );
    }
  }, [viemChains, wagmiConfig]);

  if (!wagmiConfig || !relayChains) {
    return (
      <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
          <span className="text-white/40 text-xs">Loading networks...</span>
        </div>
      </div>
    );
  }

  return (
    <RelayKitProvider
      options={{
        appName: "StockPilot AI",
        appFees: [],
        duneConfig: {},
        disablePoweredByReservoir: true,
        themeScheme: "dark",
        chains: relayChains as any,
        baseApiUrl: MAINNET_RELAY_API,
      }}
      theme={darkRelayTheme}
    >
      <WagmiProvider config={wagmiConfig}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#3b82f6",
            accentColorForeground: "white",
            borderRadius: "large",
            overlayBlur: "small",
          })}
          initialChain={mantle}
        >
          {children}
        </RainbowKitProvider>
      </WagmiProvider>
    </RelayKitProvider>
  );
}

export default function Web3Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <RelayChainLoader>
        <StockyProvider>{children}</StockyProvider>
      </RelayChainLoader>
    </QueryClientProvider>
  );
}
