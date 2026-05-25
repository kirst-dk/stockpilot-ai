"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, http } from "wagmi";
import { mantle, mantleSepoliaTestnet } from "wagmi/chains";
import {
  RainbowKitProvider,
  darkTheme,
  getDefaultConfig,
} from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { RelayKitProvider } from "@reservoir0x/relay-kit-ui";
import "@reservoir0x/relay-kit-ui/styles.css";
import { ReactNode, useState } from "react";

const config = getDefaultConfig({
  appName: "StockPilot AI",
  projectId: "stockpilot-ai-mantle",
  chains: [mantle, mantleSepoliaTestnet],
  transports: {
    [mantle.id]: http("https://rpc.mantle.xyz"),
    [mantleSepoliaTestnet.id]: http("https://rpc.sepolia.mantle.xyz"),
  },
  ssr: false,
});

export default function Web3Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <RelayKitProvider
      options={{
        appName: "StockPilot AI",
        appFees: [],
        duneConfig: {},
        disablePoweredByReservoir: true,
        themeScheme: "dark",
      }}
      theme={{
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
      }}
    >
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
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
        </QueryClientProvider>
      </WagmiProvider>
    </RelayKitProvider>
  );
}
