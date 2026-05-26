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

const queryClient = new QueryClient();

const darkRelayTheme = {
  font: "Inter, sans-serif",
  primaryColor: "#3b82f6",
  focusColor: "#3b82f6",
  subtleBorderColor: "rgba(255,255,255,0.08)",
  text: {
    default: "rgba(255,255,255,0.9)",
    subtle: "rgba(255,255,255,0.4)",
  },
  buttons: {
    primary: {
      color: "#ffffff",
      background: "#3b82f6",
      hover: { color: "#ffffff", background: "#2563eb" },
    },
  },
  input: {
    background: "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.9)",
  },
  dropdown: {
    background: "#0d1220",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  modal: {
    background: "#0d1220",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  widget: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
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
      <RelayChainLoader>{children}</RelayChainLoader>
    </QueryClientProvider>
  );
}
