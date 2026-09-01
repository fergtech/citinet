/**
 * Subdomain utilities for hub routing.
 *
 * Mission 1 (localhost): Uses VITE_FORCE_HUB_SLUG to simulate hub mode
 * Mission 2 (production): Will support actual subdomain routing
 *
 * Dev mode: VITE_FORCE_HUB_SLUG=mytest npm run dev
 */

const HUB_SLUG_KEY = 'citinet-active-hub';
const HUBS_KEY = 'citinet-hubs';
// sessionStorage (not localStorage): tab-scoped on purpose. A genuinely new
// tab/dev-restart should still auto-restore the last hub below -- only an
// explicit "Switch Hub" click in THIS tab should suppress it, and closing
// the tab is exactly when that intent should stop applying too.
const BROWSING_KEY = 'citinet-browsing-hubs';

/** Returns the hub slug from environment variable or URL/storage cache.
 *  Falls back to the most recently connected hub from citinet-hubs if the
 *  active-hub key is missing — handles dev-server restarts and fresh tabs
 *  where Vite opens http://localhost:3001 without a ?hub= param. */
export function getSubdomain(): string | null {
  const forced = (import.meta.env.VITE_FORCE_HUB_SLUG as string | undefined) ?? '';
  if (forced) return forced;

  // ?hub= in URL is the authoritative source — write it to localStorage so it
  // survives client-side React Router navigations that drop query params.
  // Picking a hub this explicitly always wins, even mid-browse.
  const hub = new URLSearchParams(window.location.search).get('hub');
  if (hub) {
    localStorage.setItem(HUB_SLUG_KEY, hub);
    sessionStorage.removeItem(BROWSING_KEY);
    return hub;
  }

  // Explicitly browsing hubs right now (Switch Hub) -- don't auto-restore
  // below, or /join would bounce straight back into the hub just left.
  if (sessionStorage.getItem(BROWSING_KEY)) return null;

  const cached = localStorage.getItem(HUB_SLUG_KEY);
  if (cached) return cached;

  // citinet-active-hub key is missing (fresh tab, cleared key, etc.) but the
  // user may still have hub connections. Auto-restore the most recently used one
  // so a dev-server restart or a new tab doesn't drop you to the WelcomeScreen.
  try {
    const stored = localStorage.getItem(HUBS_KEY);
    if (!stored) return null;
    const hubs = JSON.parse(stored) as Record<string, { hub: { lastConnectedAt?: string } }>;
    const slugs = Object.keys(hubs);
    if (!slugs.length) return null;
    const best = slugs.reduce((a, b) =>
      (hubs[a]?.hub?.lastConnectedAt ?? '') >= (hubs[b]?.hub?.lastConnectedAt ?? '') ? a : b
    );
    localStorage.setItem(HUB_SLUG_KEY, best);
    return best;
  } catch {
    return null;
  }
}

/** Call when the user explicitly leaves a hub so the cache is cleared. */
export function clearSubdomainCache(): void {
  localStorage.removeItem(HUB_SLUG_KEY);
}

/** Call right before navigating to the hub picker (Switch Hub) so
 * getSubdomain()'s auto-restore fallback doesn't immediately bounce back
 * into the hub just left -- see BROWSING_KEY above. */
export function beginHubBrowsing(): void {
  sessionStorage.setItem(BROWSING_KEY, '1');
}

/** Returns the full URL for a hub slug, relative to the current origin. */
export function getHubUrl(slug: string): string {
  return `${window.location.origin}?hub=${slug}`;
}

/** Returns a router path with ?hub=slug appended so the slug survives SPA navigation. */
export function hubPath(path: string, slug?: string): string {
  const s = slug ?? getSubdomain();
  return s ? `${path}?hub=${s}` : path;
}

/** Hard-navigates to a hub's subdomain (or query param for localhost).
 *  Pass `connection` to bootstrap the hub's localStorage on first visit
 *  (required because localStorage is origin-scoped). */
export function navigateToHub(slug: string, connection?: object): void {
  const url = new URL(getHubUrl(slug));
  if (connection) {
    url.searchParams.set('_cc', btoa(encodeURIComponent(JSON.stringify(connection))));
  }
  window.location.href = url.toString();
}
