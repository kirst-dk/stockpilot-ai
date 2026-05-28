/**
 * Tiny in-memory cache with TTL for API responses.
 * Avoids burning the 1000-req/day ELFA budget on repeat questions.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return e.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): T {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export async function cachedFetch<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const value = await fetcher();
  cacheSet(key, value, ttlMs);
  return value;
}

export const TTL = {
  PRICE: 30 * 1000,
  SENTIMENT: 5 * 60 * 1000,
  MENTIONS: 3 * 60 * 1000,
  SMART_MONEY: 60 * 1000,
  TOKEN_INFO: 60 * 60 * 1000,
  AI_ANALYSIS: 10 * 60 * 1000,
} as const;
