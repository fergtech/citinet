/**
 * Which origin is "the shell" (the Citinet gateway, normally https://citinet.cloud)
 * versus a hub's own origin serving its bundled UI. Kept dependency-free so both
 * subdomain.ts and hubHandoff.ts can use it without an import cycle.
 */

const DEFAULT_SHELL_URL = 'https://citinet.cloud';

/** Hosts only reachable from the same machine/LAN — never treated as a public shell/hub origin. */
const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1\]?$)|\.(local|lan|internal)$/i;

export function isPrivateHost(hostname: string): boolean {
  return PRIVATE_HOST.test(hostname);
}

/** The shell's URL. VITE_SHELL_URL wins; otherwise derived from the baked-in registry API URL. */
export function getShellUrl(): string {
  const explicit = import.meta.env.VITE_SHELL_URL as string | undefined;
  if (explicit) return explicit.replace(/\/$/, '');
  const registryApi = import.meta.env.VITE_REGISTRY_API_URL as string | undefined;
  if (registryApi) {
    try { return new URL(registryApi).origin; } catch { /* fall through */ }
  }
  return DEFAULT_SHELL_URL;
}

/** True when this page is being served by the shell itself. */
export function isShellOrigin(): boolean {
  try {
    return window.location.origin === new URL(getShellUrl()).origin;
  } catch {
    return false;
  }
}

/**
 * True when this page is a hub's own public origin — i.e. not the shell, not
 * localhost/LAN dev. Only then does "switch hub" mean "go back to the shell".
 */
export function isPublicHubOrigin(): boolean {
  return !isShellOrigin() && window.location.protocol === 'https:' && !isPrivateHost(window.location.hostname);
}

/**
 * Navigates to a shell path from a hub origin. `from` identifies the hub the user
 * is leaving (only pass it when they're signed in there): the shell verifies it
 * against that hub's own /api/info before listing it, so the link can't be used
 * to plant arbitrary entries.
 */
export function goToShell(path: string, from?: { slug: string; url: string }): void {
  const url = new URL(getShellUrl() + path);
  if (from) {
    url.searchParams.set('from', from.slug);
    url.searchParams.set('url', from.url);
  }
  window.location.assign(url.toString());
}
