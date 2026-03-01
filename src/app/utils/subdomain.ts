/**
 * Subdomain utilities for hub routing.
 *
 * Local dev:  getSubdomain() → null or forced slug via VITE_FORCE_HUB_SLUG
 * Production: getSubdomain() → subdomain slug when deployed to custom domain
 *
 * Dev escape hatch: VITE_FORCE_HUB_SLUG=mytest npm run dev
 */

/** Returns the hub slug from the current hostname, or null if on start/www/localhost. */
export function getSubdomain(): string | null {
  const forced = (import.meta.env.VITE_FORCE_HUB_SLUG as string | undefined) ?? '';
  if (forced) return forced;

  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return null;

  const parts = host.split('.');
  if (parts.length >= 3) {
    const sub = parts[0];
    if (sub !== 'start' && sub !== 'www' && sub !== 'registry') return sub;
  }
  return null;
}

/** Returns the full URL for a hub slug (localhost for dev, custom domain in production). */
export function getHubUrl(slug: string): string {
  // For local dev, return localhost with slug as query param or path
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `http://localhost:${window.location.port}?hub=${slug}`;
  }
  // Production: construct subdomain URL based on current domain
  const baseDomain = window.location.hostname.split('.').slice(-2).join('.');
  return `https://${slug}.${baseDomain}`;
}

/** Hard-navigates to a hub's citinet.cloud subdomain.
 *  Pass `connection` to bootstrap the hub's localStorage on first visit
 *  (required because localStorage is origin-scoped). */
export function navigateToHub(slug: string, connection?: object): void {
  const url = new URL(getHubUrl(slug));
  if (connection) {
    url.searchParams.set('_cc', btoa(JSON.stringify(connection)));
  }
  window.location.href = url.toString();
}
