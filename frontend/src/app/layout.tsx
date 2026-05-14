import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StockPilot AI — AI Portfolio Manager for xStocks on Mantle",
  description:
    "Autonomous AI agent managing tokenized equity portfolios (xStocks) on Mantle Network with on-chain transparency.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
