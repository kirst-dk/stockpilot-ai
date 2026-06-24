"use client";

import { Banknote, Users, Layers, Rocket, ShieldCheck, TrendingUp } from "lucide-react";

const REVENUE = [
  [
    "Management fee",
    "0.50% / yr",
    "Accrued on assets under management (AUM) the agent rebalances. Charged in bps on the rebalanced notional, streamed per cycle — aligned with how robo-advisors monetize.",
  ],
  [
    "Performance fee",
    "10% of gains",
    "Taken only on net new profit above a high-water mark, so we earn when users earn. Computed from the on-chain decision log (verifiable, no opaque accounting).",
  ],
  [
    "Premium Autopilot",
    "subscription",
    "Free tier = manual cycles. Paid tier unlocks autonomous DCA, higher-frequency rebalancing, more signals (Nansen/ELFA) and priority routing. Predictable recurring revenue.",
  ],
  [
    "Routing / execution",
    "optional bps",
    "An optional app-fee on the swap route (Relay supports appFees) — transparently shown in the confirm modal. Off by default; a lever, not a hidden tax.",
  ],
];

const MARKET = [
  ["Tokenized RWA market", "$25B+ on-chain today", "Tokenized treasuries + equities are the fastest-growing RWA segment; xStocks & USDY are live, liquid instruments on Mantle."],
  ["Serviceable users", "Crypto-native RWA investors", "Users who already hold stablecoins on Mantle and want managed, diversified exposure to equities + yield without leaving DeFi."],
  ["Wedge", "Managed xStocks + USDY", "No one offers AI-managed, non-custodial portfolios of tokenized equities + treasuries on Mantle with an on-chain track record. That's the opening."],
];

const GTM = [
  ["Phase 1 — Hackathon & Mantle ecosystem", "Ship live on mainnet, win mindshare in the Mantle/AI×RWA community, integrate Fluxion/Ondo/Relay as co-marketing partners."],
  ["Phase 2 — Track record flywheel", "Every cycle is recorded on-chain. Publish a verifiable performance page — the audit trail itself becomes the marketing (\"don't trust, verify\")."],
  ["Phase 3 — Distribution", "Embed as a managed-portfolio widget in Mantle wallets / xStocks front-ends; partner with RWA issuers who want a managed-allocation surface for their assets."],
  ["Phase 4 — Expansion", "More RWA classes as they tokenize (credit, commodities), Account Abstraction for gasless Web2 onboarding, session-key autopilot."],
];

const MOAT = [
  ["On-chain verifiable track record", "Every decision is written via recordDecision — a tamper-evident, timestamped record competitors can't fake and users can independently audit on Mantlescan."],
  ["Deep RWA integration", "Native, non-cosmetic integration with Fluxion (xStocks/mETH), Ondo (USDY) and Relay routing — not a generic swap wrapper."],
  ["Non-custodial trust", "We never hold funds or the underlying; users sign from their own wallet. Removes custody risk and regulatory surface that custodial robo-advisors carry."],
  ["Compliance posture", "A real pre-trade eligibility gate + sanctioned-address screening + issuer-delegated KYC — defensible positioning in a regulated asset class."],
];

export default function BusinessPage() {
  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Hero */}
      <div className="text-center py-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-medium text-white/50 mb-4 uppercase tracking-widest">
          <Banknote size={12} className="text-emerald-400" /> Business &amp; Economics
        </div>
        <h1 className="text-2xl md:text-3xl font-black tracking-tight mb-3 text-white/90">How StockPilot makes money</h1>
        <p className="text-sm text-white/50 max-w-xl mx-auto leading-relaxed">
          A non-custodial, AI-managed portfolio of tokenized real-world assets on Mantle. We monetize like a
          robo-advisor — fees on the value we manage and the gains we generate — <span className="text-white/70">no
          protocol token required</span>.
        </p>
      </div>

      {/* Revenue model */}
      <div>
        <h2 className="text-base font-bold mb-1 flex items-center gap-2"><TrendingUp size={15} className="text-emerald-400" /> Revenue model</h2>
        <p className="text-[11px] text-white/45 mb-4">Transparent, on-chain-computable fees. Revenue scales with AUM and performance, not with token emissions.</p>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] divide-y divide-white/5 overflow-hidden">
          {REVENUE.map(([name, rate, desc]) => (
            <div key={name} className="px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-[13px] font-bold text-white/85">{name}</span>
                <span className="text-[11px] font-semibold text-emerald-300/90 shrink-0">{rate}</span>
              </div>
              <p className="text-[11px] text-white/45 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 p-3.5 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] text-[11px] text-emerald-100/70 leading-relaxed">
          <span className="font-semibold text-emerald-200/90">Unit economics (illustrative):</span> at $10M AUM, a 0.5%
          management fee = $50k/yr recurring; a 10% performance fee on a 15% gross return adds ~$150k. Margins are high
          because execution is on-chain and the agent is automated — marginal cost per managed account approaches zero.
        </div>
      </div>

      {/* Market */}
      <div>
        <h2 className="text-base font-bold mb-1 flex items-center gap-2"><Users size={15} className="text-blue-400" /> Market &amp; users</h2>
        <p className="text-[11px] text-white/45 mb-4">Why now, who for, and where we win.</p>
        <div className="grid md:grid-cols-3 gap-3">
          {MARKET.map(([title, stat, desc]) => (
            <div key={title} className="p-4 rounded-xl border border-white/8 bg-white/[0.02]">
              <div className="text-[11px] text-white/45">{title}</div>
              <div className="text-[14px] font-bold text-white/90 my-1">{stat}</div>
              <p className="text-[11px] text-white/45 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Why Mantle */}
      <div className="flex gap-3 p-4 rounded-xl border border-white/8 bg-white/[0.02]">
        <Layers size={18} className="text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-[13px] font-bold text-white/85 mb-1">Why Mantle</h3>
          <p className="text-[11.5px] text-white/50 leading-relaxed">
            Mantle has the RWA assets native (xStocks, USDY, mETH) and the low gas fees that make per-cycle rebalancing
            and on-chain decision-recording economically viable — high-frequency <code className="text-indigo-300/80">recordDecision</code>{" "}
            writes would be cost-prohibitive on L1. Mantle is our settlement + execution layer, not just a deploy target.
          </p>
        </div>
      </div>

      {/* GTM */}
      <div>
        <h2 className="text-base font-bold mb-1 flex items-center gap-2"><Rocket size={15} className="text-amber-400" /> Go-to-market</h2>
        <p className="text-[11px] text-white/45 mb-4">From hackathon to distribution.</p>
        <div className="space-y-2.5">
          {GTM.map(([title, desc], i) => (
            <div key={title} className="flex gap-3 p-3.5 rounded-xl border border-white/5 bg-white/[0.015]">
              <span className="w-6 h-6 shrink-0 rounded-lg bg-amber-500/10 text-amber-300 flex items-center justify-center text-[11px] font-bold">{i + 1}</span>
              <div>
                <h3 className="text-[12px] font-semibold text-white/85">{title}</h3>
                <p className="text-[11px] text-white/45 leading-relaxed mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Moat */}
      <div>
        <h2 className="text-base font-bold mb-1 flex items-center gap-2"><ShieldCheck size={15} className="text-emerald-400" /> Moat — why this is hard to copy</h2>
        <div className="grid md:grid-cols-2 gap-3 mt-3">
          {MOAT.map(([title, desc]) => (
            <div key={title} className="p-4 rounded-xl border border-white/8 bg-white/[0.02]">
              <h3 className="text-[12.5px] font-bold text-white/85 mb-1">{title}</h3>
              <p className="text-[11px] text-white/45 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-white/30 leading-relaxed border-t border-white/5 pt-4">
        Figures are illustrative for a hackathon submission, not a financial projection or offer. StockPilot AI is
        non-custodial, experimental software and is not investment advice. There is no protocol token; revenue is
        fee-based. On-chain decision log —{" "}
        <a href="https://mantlescan.xyz/address/0xbbE80ACe5c46b49930ff0229762a1A57BE4CA6F4" target="_blank" rel="noreferrer" className="underline hover:text-white/50">StockPilotAgent on Mantlescan</a>.
      </p>
    </div>
  );
}
