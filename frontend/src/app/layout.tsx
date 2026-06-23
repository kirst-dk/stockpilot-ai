import type { Metadata } from "next";
import "./globals.css";
import Web3Providers from "./providers";

export const metadata: Metadata = {
  title: "StockPilot AI — AI Portfolio Manager for xStocks on Mantle",
  description:
    "Autonomous AI agent managing tokenized equity portfolios (xStocks) on Mantle Network with on-chain transparency. Powered by GPT-4o-mini, xStocks Atomic RFQ, and Fluxion DEX.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&f[]=satoshi@400,500,700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Web3Providers>{children}</Web3Providers>
      </body>
    </html>
  );
}
