/**
 * Subdomain utilities for hub routing.
 *
 * Mission 1 (localhost): Uses VITE_FORCE_HUB_SLUG to simulate hub mode
 * Mission 2 (production): Will support actual subdomain routing
 *
 * Dev mode: VITE_FORCE_HUB_SLUG=mytest npm run dev
 */

/** Returns the hub slug from environment variable (Mission 1 localhost-only). */
export function getSubdomain(): string | null {
  // Mission 1: Only use forced slug for testing, no subdomain parsing
  const forced = (import.meta.env.VITE_FORCE_HUB_SLUG as string | undefined) ?? '';
  if (forced) return forced;

  // Mission 1: ?hub= query param is set by navigateToHub() on initial hard-navigation.
  // Cache it in sessionStorage so it survives client-side React Router navigation
  // (navigate('/onboard') strips query params, losing ?hub=slug).
  const hub = new URLSearchParams(window.location.search).get('hub');
  if (hub) {
    sessionStorage.setItem('citinet-active-hub', hub);
    return hub;
  }

  // Survived a client-side navigation — read from session cache
  const cached = sessionStorage.getItem('citinet-active-hub');
  if (cached) return cached;

  return null;
}

/** Call when the user explicitly leaves a hub so the session cache is cleared. */
export function clearSubdomainCache(): void {
  sessionStorage.removeItem('citinet-active-hub');
}

/** Returns the full URL for a hub slug (localhost-only for Mission 1). */
export function getHubUrl(slug: string): string {
  // Mission 1: localhost-only, no production URLs
  return `http://localhost:${window.location.port}?hub=${slug}`;
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
