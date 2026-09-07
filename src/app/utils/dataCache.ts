// ── Local data cache ─────────────────────────────────────────────────────
// A lightweight, per-hub localStorage cache for "last known good" API
// responses — activity feed, featured items, post lists, etc.
//
// Why this exists: today, every screen fetches fresh on every mount with no
// persisted fallback. That's fine when the hub is reachable, but it means an
// admin restarting the hub machine (a routine, brief interruption — the hub
// itself isn't going anywhere) shows up to users as a blank/error screen
// instead of "here's what I last saw, one moment" — the same experience a
// real app gives you on a subway with spotty signal.
//
// This is deliberately NOT a real expiry cache. Hub content doesn't go stale
// in a way that makes showing nothing better than showing a few-minutes-old
// copy while a fresh fetch is in flight — so there's no TTL/expiration here,
// just a `cachedAt` timestamp callers can use to show a "may be outdated"
// note if they want one. Reading is synchronous (a plain localStorage read),
// so callers can seed initial React state with it before the first network
// request even fires.
//
// Usage pattern for a fetch-on-mount hook/component:
//   const [items, setItems] = useState(() => readCache<Item[]>(hubSlug, 'key')?.data ?? []);
//   ...on a SUCCESSFUL fetch only: setItems(fresh); writeCache(hubSlug, 'key', fresh);
//   ...on failure: leave state (and the cache) alone — don't overwrite good
//   data with an empty/partial result just because the network hiccuped.

export interface CacheEnvelope<T> {
  data: T;
  /** Date.now() when this was written — purely informational (e.g. for a
   * "last updated Xm ago" note); nothing here expires it automatically. */
  cachedAt: number;
}

function cacheKey(hubSlug: string, key: string): string {
  return `citinet-cache:${hubSlug}:${key}`;
}

/** Synchronous read — safe to call inside a useState initializer. Returns
 * null if nothing's cached, storage is unavailable, or the cached value
 * fails to parse (e.g. it was written by an older, incompatible app version). */
export function readCache<T>(hubSlug: string, key: string): CacheEnvelope<T> | null {
  if (!hubSlug) return null;
  try {
    const raw = localStorage.getItem(cacheKey(hubSlug, key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.cachedAt !== 'number' || !('data' in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Persists the latest known-good value. Call this ONLY after a successful
 * fetch — never with partial/empty data from a failed request, or the next
 * cold start would seed from that instead of the last real snapshot. */
export function writeCache<T>(hubSlug: string, key: string, data: T): void {
  if (!hubSlug) return;
  try {
    const envelope: CacheEnvelope<T> = { data, cachedAt: Date.now() };
    localStorage.setItem(cacheKey(hubSlug, key), JSON.stringify(envelope));
  } catch {
    // Quota exceeded, storage disabled (private browsing), etc. — caching is
    // a nice-to-have on top of the real fetch, never let it break anything.
  }
}

export function clearCache(hubSlug: string, key: string): void {
  if (!hubSlug) return;
  try { localStorage.removeItem(cacheKey(hubSlug, key)); } catch { /* non-critical */ }
}
