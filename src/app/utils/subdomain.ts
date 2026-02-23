/**
 * Subdomain utilities for citinet.cloud hub routing.
 *
 * On start.citinet.cloud:      getSubdomain() → null          (onboarding mode)
 * On riverdale.citinet.cloud:  getSubdomain() → 'riverdale'   (hub mode)
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

/** Returns the full citinet.cloud URL for a hub slug. */
export function getHubUrl(slug: string): string {
  return `https://${slug}.citinet.cloud`;
}

/** Hard-navigates to a hub's citinet.cloud subdomain. */
export function navigateToHub(slug: string): void {
  window.location.href = getHubUrl(slug);
}
