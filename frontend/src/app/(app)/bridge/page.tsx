"use client";

import { BridgeTab, useAppData } from "@/components/AppCore";

export default function BridgePage() {
  const d = useAppData();
  return <BridgeTab walletClient={d.walletClient} onConnectWallet={() => {}} />;
}
