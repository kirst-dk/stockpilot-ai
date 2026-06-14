"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PoolsTab, useAppData } from "@/components/AppCore";
import { POOLS_ENABLED } from "@/lib/flags";

export default function PoolsPage() {
  const router = useRouter();
  const d = useAppData();

  useEffect(() => {
    if (!POOLS_ENABLED) router.replace("/");
  }, [router]);

  if (!POOLS_ENABLED) return null;

  return (
    <PoolsTab
      walletClient={d.walletClient}
      isConnected={d.isConnected}
      address={d.address}
      allXStocks={d.allXStocks}
    />
  );
}
