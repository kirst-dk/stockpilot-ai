"use client";

import { ShieldCheck, Scale, Globe2, FileCheck2, AlertTriangle, Lock } from "lucide-react";

const RESTRICTED = ["United States persons", "Sanctioned jurisdictions (OFAC)", "Where local law prohibits tokenized securities"];

const GATE_STEPS = [
  ["Asset eligibility flag", "Each tradable asset carries an eligibility tag. If an xStock or USDY is restricted in the connected region, the buy is blocked and surfaced — not silently executed."],
  ["Sanctioned-address screening", "The connected wallet is screened against sanctioned-address lists before any buy is planned."],
  ["Per-asset risk disclosure", "The confirm modal shows that xStocks/USDY are tokenized securities, who enforces KYC, and that StockPilot is non-custodial and not investment advice."],
];

export default function CompliancePage() {
  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Hero */}
      <div className="text-center py-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-medium text-white/50 mb-4 uppercase tracking-widest">
          <ShieldCheck size={12} className="text-emerald-400" /> Compliance &amp; Disclosures
        </div>
        <h1 className="text-2xl md:text-3xl font-black tracking-tight mb-3 text-white/90">Regulatory posture</h1>
        <p className="text-sm text-white/50 max-w-xl mx-auto leading-relaxed">
          StockPilot AI manages <span className="text-white/70">tokenized securities</span> — xStocks (tokenized equities) and USDY (tokenized US Treasuries). We treat these as regulated real-world assets, not generic crypto.
        </p>
      </div>

      {/* Top disclaimer */}
      <div className="flex gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.04]">
        <AlertTriangle size={18} className="text-amber-300 shrink-0 mt-0.5" />
        <p className="text-[12px] text-amber-100/80 leading-relaxed">
          StockPilot AI is experimental hackathon software. Nothing here is investment, legal, or tax advice. Tokenized
          equities and treasuries are securities subject to the rules of their issuer and your jurisdiction — you are
          responsible for your own eligibility.
        </p>
      </div>

      {/* Pillars */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card icon={<Lock size={16} className="text-emerald-400" />} title="Non-custodial by design">
          StockPilot never mints, redeems, or holds the underlying asset and never custodies user funds. Every swap is
          signed from your own wallet. We operate only on the secondary, already-tokenized representation on Mantle.
        </Card>
        <Card icon={<FileCheck2 size={16} className="text-blue-400" />} title="Issuers handle primary KYC/AML">
          xStocks (Backed Finance) and USDY (Ondo) gate primary issuance and redemption behind their own KYC,
          accredited/eligible-investor checks, and jurisdiction screening. That compliance perimeter sits with the
          regulated issuers.
        </Card>
        <Card icon={<Globe2 size={16} className="text-indigo-400" />} title="Jurisdiction posture">
          USDY and several xStocks are restricted for certain users. StockPilot surfaces these restrictions in-app and
          does not solicit restricted users.
          <ul className="mt-2 space-y-1">
            {RESTRICTED.map((r) => (
              <li key={r} className="flex items-center gap-2 text-[11px] text-white/55">
                <span className="w-1 h-1 rounded-full bg-amber-400" />{r}
              </li>
            ))}
          </ul>
        </Card>
        <Card icon={<Scale size={16} className="text-emerald-400" />} title="Auditability for regulators">
          Every agent decision is written on-chain via <code className="text-emerald-300/80">recordDecision</code>,
          creating a permanent, timestamped, tamper-evident audit trail of what the agent did and why — useful for the
          record-keeping obligations that apply to managed-account products.
        </Card>
      </div>

      {/* AI compliance gate */}
      <div>
        <h2 className="text-base font-bold mb-1">AI-assisted pre-trade compliance gate</h2>
        <p className="text-[11px] text-white/45 mb-4">Before any buy, the agent runs a lightweight compliance check. Restricted assets are blocked and surfaced honestly.</p>
        <div className="space-y-2.5">
          {GATE_STEPS.map(([title, desc], i) => (
            <div key={title} className="flex gap-3 p-3.5 rounded-xl border border-white/5 bg-white/[0.015]">
              <span className="w-6 h-6 shrink-0 rounded-lg bg-emerald-500/10 text-emerald-300 flex items-center justify-center text-[11px] font-bold">{i + 1}</span>
              <div>
                <h3 className="text-[12px] font-semibold text-white/85">{title}</h3>
                <p className="text-[11px] text-white/45 leading-relaxed mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Asset class table */}
      <div>
        <h2 className="text-base font-bold mb-4">Asset classes &amp; their regulators</h2>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] divide-y divide-white/5 overflow-hidden">
          {[
            ["xStocks", "Tokenized equities", "Backed Finance", "1:1 backed by custodied shares; Proof of Reserves on-chain"],
            ["USDY", "Tokenized US Treasuries", "Ondo Finance", "Yield-bearing; not available to US persons"],
            ["mETH", "Mantle staked-ETH", "Mantle / mETH Protocol", "Liquid staking token, not a security"],
          ].map(([sym, type, issuer, note]) => (
            <div key={sym} className="grid grid-cols-[64px_1fr] sm:grid-cols-[80px_1fr_1fr] gap-2 px-4 py-3 text-[11px]">
              <span className="font-bold text-white/85">{sym}</span>
              <span className="text-white/55">{type}<span className="block text-white/35 sm:hidden">{issuer}</span></span>
              <span className="hidden sm:block text-white/55">{issuer}<span className="block text-white/35 text-[10px] mt-0.5">{note}</span></span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-white/30 leading-relaxed border-t border-white/5 pt-4">
        References: xStocks legal &amp; eligibility — <a href="https://xstocks.fi" target="_blank" rel="noreferrer" className="underline hover:text-white/50">xstocks.fi</a>;
        USDY documentation &amp; restrictions — <a href="https://ondo.finance" target="_blank" rel="noreferrer" className="underline hover:text-white/50">ondo.finance</a>.
        On-chain decision log — <a href="https://mantlescan.xyz/address/0xbbE80ACe5c46b49930ff0229762a1A57BE4CA6F4" target="_blank" rel="noreferrer" className="underline hover:text-white/50">StockPilotAgent on Mantlescan</a>.
      </p>
    </div>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-xl border border-white/8 bg-white/[0.02]">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center">{icon}</span>
        <h3 className="text-[13px] font-bold text-white/85">{title}</h3>
      </div>
      <div className="text-[11.5px] text-white/50 leading-relaxed">{children}</div>
    </div>
  );
}
