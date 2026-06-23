"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { POOLS_ENABLED } from "@/lib/flags";

// The pools section is gated behind NEXT_PUBLIC_ENABLE_POOLS. While disabled,
// a direct visit to /pools redirects to the dashboard so there is no dead route.
// When enabled, pools live inside the Swap page, so we send users there.
export default function PoolsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(POOLS_ENABLED ? "/swap" : "/");
  }, [router]);
  return (
    <div className="flex items-center justify-center py-24 text-white/40 text-sm">
      Redirecting…
    </div>
  );
}
