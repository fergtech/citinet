/**
 * Subdomain utilities for hub routing.
 *
 * Mission 1 (localhost): Uses VITE_FORCE_HUB_SLUG to simulate hub mode
 * Mission 2 (production): Will support actual subdomain routing
 *
 * Dev mode: VITE_FORCE_HUB_SLUG=mytest npm run dev
 */

const HUB_SLUG_KEY = 'citinet-active-hub';

/** Returns the hub slug from environment variable or URL/storage cache. */
export function getSubdomain(): string | null {
  const forced = (import.meta.env.VITE_FORCE_HUB_SLUG as string | undefined) ?? '';
  if (forced) return forced;

  // ?hub= in URL is the authoritative source — write it to localStorage so it
  // survives client-side React Router navigations that drop query params
  // (iOS Safari PWA treats sessionStorage as ephemeral within SPA navigations).
  const hub = new URLSearchParams(window.location.search).get('hub');
  if (hub) {
    localStorage.setItem(HUB_SLUG_KEY, hub);
    return hub;
  }

  return localStorage.getItem(HUB_SLUG_KEY);
}

/** Call when the user explicitly leaves a hub so the cache is cleared. */
export function clearSubdomainCache(): void {
  localStorage.removeItem(HUB_SLUG_KEY);
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
    url.searchParams.set('_cc', btoa(JSON.stringify(connection)));
  }
  window.location.href = url.toString();
}
