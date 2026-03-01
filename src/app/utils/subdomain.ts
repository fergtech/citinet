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

  // Mission 1: Always return null on localhost (no multi-subdomain support yet)
  return null;
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
