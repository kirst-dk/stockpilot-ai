"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, LineChart, ArrowLeftRight, Waypoints,
  PieChart, Target, GraduationCap, Droplets, ShieldCheck, X,
} from "lucide-react";
import { POOLS_ENABLED } from "@/lib/flags";

export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/market", label: "Market", icon: LineChart },
  { href: "/swap", label: "Swap", icon: ArrowLeftRight },
  ...(POOLS_ENABLED ? [{ href: "/pools", label: "Liquidity Pools", icon: Droplets }] : []),
  { href: "/bridge", label: "Bridge", icon: Waypoints },
  { href: "/portfolio", label: "Builder", icon: PieChart },
  { href: "/strategies", label: "Strategies", icon: Target },
  { href: "/education", label: "Education", icon: GraduationCap },
  { href: "/compliance", label: "Compliance", icon: ShieldCheck },
] as const;

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 ${className}`}>
      <span className="w-9 h-9 rounded-xl sp-grad-bg flex items-center justify-center shadow-lg shadow-emerald-500/20">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d="M2 12L5 7L8 9L11 4L14 8" stroke="#06110d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="leading-none">
        <span className="font-display font-bold text-[15px] tracking-tight text-white">StockPilot</span>
        <span className="ml-1.5 text-[9px] font-semibold sp-grad-text align-top">AI</span>
        <span className="block text-[9.5px] text-white/35 mt-1">xStocks · Mantle</span>
      </span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link key={href} href={href} onClick={onNavigate} className="sp-nav-link" data-active={active}>
            <Icon size={18} strokeWidth={2} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Desktop sidebar (fixed) */
export function Sidebar() {
  return (
    <aside
      className="hidden lg:flex fixed inset-y-0 left-0 z-40 flex-col gap-6 px-4 py-5 border-r border-white/[0.07] bg-[#070a12]/80 backdrop-blur-xl"
      style={{ width: "var(--sp-sidebar-w)" }}
    >
      <BrandMark className="px-1.5" />
      <NavLinks />
      <div className="mt-auto sp-glass p-3.5">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-emerald-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Mantle Mainnet
        </div>
        <p className="text-[10.5px] text-white/40 mt-1.5 leading-relaxed">
          Tokenized equities, on-chain. Trade &amp; bridge xStocks natively.
        </p>
      </div>
    </aside>
  );
}

/** Mobile slide-over drawer */
export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div className={`lg:hidden fixed inset-0 z-[70] ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`absolute inset-y-0 left-0 w-[260px] flex flex-col gap-6 px-4 py-5 border-r border-white/10 bg-[#070a12] transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between">
          <BrandMark className="px-0.5" />
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/60">
            <X size={16} />
          </button>
        </div>
        <NavLinks onNavigate={onClose} />
      </aside>
    </div>
  );
}

/** Mobile bottom tab bar */
export function MobileBottomNav() {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((i) => ["/", "/market", "/swap", "/bridge", "/portfolio"].includes(i.href));
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 flex items-stretch justify-around border-t border-white/10 bg-[#070a12]/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center justify-center gap-0.5 py-2 flex-1 min-h-[52px]"
            style={{ color: active ? "var(--sp-mint)" : "rgba(255,255,255,0.5)" }}
          >
            <Icon size={20} strokeWidth={active ? 2.4 : 2} />
            <span className="text-[9.5px] font-medium">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
