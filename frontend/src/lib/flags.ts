// Build-time feature flags. Toggle these via NEXT_PUBLIC_* env vars at build.
//
// Liquidity Pools (Fluxion V3 add-liquidity) is temporarily hidden. The code and
// contract helpers remain in the repo untouched — flip NEXT_PUBLIC_ENABLE_POOLS
// to "true" at build time to restore the section (Swap sub-tab, /pools route, and
// the sidebar nav entry) with no code changes.
export const POOLS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_POOLS === "true";
