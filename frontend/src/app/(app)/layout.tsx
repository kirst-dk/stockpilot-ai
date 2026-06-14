"use client";

import { useState } from "react";
import { AppDataProvider } from "@/components/AppCore";
import { Sidebar, MobileSidebar, MobileBottomNav } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { Ticker } from "@/components/shell/Ticker";
import { StockyFloatingButton } from "@/components/concierge/StockyFloatingButton";
import { LiveAnalyticsBanner } from "@/components/concierge/LiveAnalyticsBanner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <AppDataProvider>
      <div className="min-h-screen text-white">
        <Sidebar />
        <MobileSidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

        <div className="lg:pl-[var(--sp-sidebar-w)]">
          <Topbar onOpenMenu={() => setMenuOpen(true)} />
          <Ticker />
          <main className="px-4 sm:px-6 py-5 pb-24 lg:pb-10 max-w-[1320px] mx-auto w-full">
            <div className="mb-4">
              <LiveAnalyticsBanner />
            </div>
            {children}
          </main>
        </div>

        <MobileBottomNav />
        <StockyFloatingButton />
      </div>
    </AppDataProvider>
  );
}
