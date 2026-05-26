"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, http } from "wagmi";
import { mantle, arbitrum, base, mainnet, optimism } from "wagmi/chains";
import {
  RainbowKitProvider,
  darkTheme,
  getDefaultConfig,
} from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { RelayKitProvider } from "@reservoir0x/relay-kit-ui";
import "@reservoir0x/relay-kit-ui/styles.css";
import { convertViemChainToRelayChain, MAINNET_RELAY_API } from "@reservoir0x/relay-sdk";
import { ReactNode, useState } from "react";

const relayChains = [
  convertViemChainToRelayChain(mantle),
  convertViemChainToRelayChain(arbitrum),
  convertViemChainToRelayChain(base),
  convertViemChainToRelayChain(mainnet),
  convertViemChainToRelayChain(optimism),
];

const config = getDefaultConfig({
  appName: "StockPilot AI",
  projectId: "stockpilot-ai-mantle",
  chains: [mantle, arbitrum, base, mainnet, optimism],
  transports: {
    [mantle.id]: http("https://rpc.mantle.xyz"),
    [arbitrum.id]: http("https://arb1.arbitrum.io/rpc"),
    [base.id]: http("https://mainnet.base.org"),
    [mainnet.id]: http("https://eth.llamarpc.com"),
    [optimism.id]: http("https://mainnet.optimism.io"),
  },
  ssr: false,
});

export default function Web3Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <RelayKitProvider
        options={{
          appName: "StockPilot AI",
          appFees: [],
          duneConfig: {},
          disablePoweredByReservoir: true,
          themeScheme: "dark",
          chains: relayChains,
          baseApiUrl: MAINNET_RELAY_API,
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
    </QueryClientProvider>
  );
}
