/**
 * Persistent cache for the lookups behind the Home feed's Atlas/Event card
 * visuals (place photo, Panoramax street-level still, location geocode). Those
 * are third-party network calls (Wikidata/Wikipedia, Panoramax, Nominatim) whose
 * answers for a given coordinate/location essentially never change, so there is
 * no reason to repeat them on every Home load/remount — and Nominatim in
 * particular asks clients to be sparing.
 *
 * A memory layer sits in front of localStorage so a remount within one page
 * session reads synchronously (no flash of the fallback visual); localStorage
 * makes it survive reloads.
 *
 * Misses ("no photo here", "location not found") are cached too, but for a much
 * shorter time: the lookup helpers swallow network errors into null, so a genuine
 * "nothing here" and a transient failure look identical, and a long miss TTL would
 * hide a card's photo/map for a day after one bad request.
 */
const KEY_PREFIX = 'citinet-card-visual:';
const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 2 * 60 * 60 * 1000;

type Entry<T> = { at: number; value: T | null };

const memory = new Map<string, Entry<unknown>>();

const fresh = <T,>(e: Entry<T>) => Date.now() - e.at < (e.value === null ? MISS_TTL_MS : HIT_TTL_MS);

/** Synchronous. `undefined` = not known (yet); `null` = known to have no result. */
export function peekCardVisual<T>(key: string): T | null | undefined {
  const entry = memory.get(key) as Entry<T> | undefined;
  if (entry && fresh(entry)) return entry.value;
  try {
    const raw = localStorage.getItem(KEY_PREFIX + key);
    if (!raw) return undefined;
    const stored = JSON.parse(raw) as Entry<T>;
    if (!fresh(stored)) return undefined;
    memory.set(key, stored);
    return stored.value;
  } catch {
    return undefined;
  }
}

export function writeCardVisual<T>(key: string, value: T | null): void {
  const entry: Entry<T> = { at: Date.now(), value };
  memory.set(key, entry);
  try { localStorage.setItem(KEY_PREFIX + key, JSON.stringify(entry)); } catch { /* quota/private mode */ }
}
