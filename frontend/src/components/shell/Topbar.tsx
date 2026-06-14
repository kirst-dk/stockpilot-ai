"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { NAV_ITEMS } from "./Sidebar";

const TITLES: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Dashboard", subtitle: "Your tokenized-equity command center" },
  "/market": { title: "Market", subtitle: "All xStocks on Mantle" },
  "/swap": { title: "Swap", subtitle: "Trade xStocks natively on Fluxion" },
  "/bridge": { title: "Bridge", subtitle: "Move assets across chains" },
  "/portfolio": { title: "Portfolio Builder", subtitle: "Design & analyze your allocation" },
  "/strategies": { title: "Strategies", subtitle: "AI-curated RWA strategies" },
  "/education": { title: "Education", subtitle: "Learn xStocks, Mantle & DeFi" },
};

function ConnectWallet() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
        const connected = mounted && account && chain;
        return (
          <button
            onClick={connected ? openAccountModal : openConnectModal}
            className={
              connected
                ? "px-3.5 py-2 rounded-xl text-[12.5px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/15 transition-colors"
                : "px-4 py-2 rounded-xl text-[12.5px] sp-btn-primary"
            }
          >
            {connected ? account.displayName : "Connect Wallet"}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();
  const matched = NAV_ITEMS.find((i) => (i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)));
  const meta = TITLES[matched?.href ?? "/"] ?? TITLES["/"];

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 px-4 sm:px-6 h-16 border-b border-white/[0.06] bg-[#070a12]/85 backdrop-blur-xl">
      <button
        onClick={onOpenMenu}
        className="lg:hidden w-10 h-10 -ml-1 rounded-xl bg-white/5 flex items-center justify-center text-white/70"
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>
      <div className="min-w-0">
        <h1 className="font-display font-semibold text-[17px] sm:text-[19px] text-white leading-tight truncate">{meta.title}</h1>
        <p className="text-[11.5px] text-white/40 truncate hidden sm:block">{meta.subtitle}</p>
      </div>
      <div className="ml-auto flex items-center gap-2.5">
        <a
          href="https://mantlescan.xyz"
          target="_blank"
          rel="noreferrer"
          className="hidden sm:flex items-center gap-1.5 text-[11px] text-emerald-300/80 hover:text-emerald-300 transition-colors px-2.5 py-2 rounded-xl border border-white/[0.07]"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Mainnet
        </a>
        <ConnectWallet />
      </div>
    </header>
  );
}
