/**
 * "Later" for a hub update prompt. Per browser, keyed by the exact published
 * digest being deferred — so a snooze never hides a NEWER release, only the one
 * the admin already saw. Purely a convenience: storage may be unavailable.
 */

const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
const key = (hubSlug: string, service: string) => `citinet-update-snooze:${hubSlug}:${service}`;

export function snoozeUpdate(hubSlug: string, service: string, digest: string | null): void {
  try {
    localStorage.setItem(key(hubSlug, service), JSON.stringify({ digest, until: Date.now() + SNOOZE_MS }));
  } catch { /* storage unavailable */ }
}

export function isUpdateSnoozed(hubSlug: string, service: string, digest: string | null): boolean {
  try {
    const raw = localStorage.getItem(key(hubSlug, service));
    if (!raw) return false;
    const s = JSON.parse(raw) as { digest: string | null; until: number };
    return s.digest === digest && s.until > Date.now();
  } catch {
    return false;
  }
}
