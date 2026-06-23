// Central feature flags. Visibility of optional sections is controlled from
// here so a section can be hidden/restored without touching component code.
//
// POOLS_ENABLED — Liquidity Pools (Fluxion V3 add-liquidity). Temporarily
// hidden in production; the code stays in the repo and is fully restored by
// setting NEXT_PUBLIC_ENABLE_POOLS=true at build time.
export const POOLS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_POOLS === "true";
