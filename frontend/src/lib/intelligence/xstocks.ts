/**
 * Helpers for the xStock catalog. Resolves user-typed symbols (NVDA / NVDAx)
 * to canonical metadata.
 */

import type { XStockMeta } from "./types";

interface RawXStockAsset {
  symbol: string;
  name: string;
  address?: string;
  decimals?: number;
  deployments?: Array<{ network: string; contract?: string; address?: string }>;
  wrapperAddress?: string;
  description?: string;
}

let catalog: XStockMeta[] = [];

function normalize(s: string): string {
  return s.replace(/x$/i, "").toUpperCase();
}

export function setXStockCatalog(assets: RawXStockAsset[]): void {
  catalog = assets
    .filter(a => a.symbol)
    .map<XStockMeta>(a => {
      const mantle = a.deployments?.find(d => d.network?.toLowerCase() === "mantle");
      return {
        symbol: a.symbol,
        name: a.name ?? a.symbol,
        baseTicker: normalize(a.symbol),
        mantleAddress: mantle?.contract ?? mantle?.address ?? a.address,
        wrapperAddress: a.wrapperAddress,
        decimals: a.decimals,
      };
    });
}

export function getXStockCatalog(): XStockMeta[] {
  return catalog;
}

export function resolveXStock(query: string): XStockMeta | null {
  if (!query) return null;
  const q = query.trim();
  const qUpper = q.toUpperCase();
  // Exact symbol match
  const exact = catalog.find(c => c.symbol.toUpperCase() === qUpper);
  if (exact) return exact;
  // Underlying ticker match (NVDA → NVDAx)
  const base = catalog.find(c => c.baseTicker === qUpper);
  if (base) return base;
  // Add `x` suffix and retry
  const withX = catalog.find(c => c.symbol.toUpperCase() === `${qUpper}X`);
  if (withX) return withX;
  // Name substring
  const byName = catalog.find(c => c.name.toLowerCase().includes(q.toLowerCase()));
  return byName ?? null;
}

export function xStockSummaryLine(meta: XStockMeta): string {
  const parts: string[] = [];
  parts.push(`${meta.symbol} (${meta.name})`);
  if (meta.mantleAddress) parts.push(`Mantle: ${meta.mantleAddress.slice(0, 10)}…`);
  return parts.join(" • ");
}
