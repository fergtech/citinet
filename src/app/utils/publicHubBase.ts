import { hubService } from '../services/hubService';
import { registryService } from '../services/registryService';

/**
 * Public share pages (/share, /share-note, /u, /v, ...) are visited by
 * anonymous people on any network. Fetching a private address (localhost,
 * 192.168.x, 10.x, Tailscale 100.x, *.local) from a public HTTPS page makes
 * Chrome show its "access devices on your local network" permission prompt,
 * and http:// targets are blocked as mixed content anyway. So a share page
 * must only ever talk to the hub's public HTTPS URL.
 */

export function isShellUrl(url: string | null | undefined): boolean {
  return !url || url.trim() === '' || url === 'http://' || url === 'https://';
}

export function isPrivateHostUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return true;
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '[::1]' || host.startsWith('[fc') || host.startsWith('[fd') || host.startsWith('[fe80')) return true;
  const m = host.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    return a === 10 || a === 127 || a === 0
      || (a === 192 && b === 168)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 169 && b === 254)
      || (a === 100 && b >= 64 && b <= 127); // CGNAT / Tailscale
  }
  return !host.includes('.'); // single-label hostnames only resolve on a LAN
}

const clean = (url: string) => url.replace(/\/+$/, '');

function isPublicHttps(url: string | null | undefined): url is string {
  return !isShellUrl(url) && /^https:\/\//i.test(url!) && !isPrivateHostUrl(url!);
}

/**
 * Ordered hub base URLs a share page may try, public internet addresses only:
 *   1. ?src= embedded by the link generator
 *   2. the hub's public registry entry (visitors with no ?src=)
 *   3. the visitor's own stored public URL (an already-joined member)
 * Private addresses are deliberately never returned, so no visitor ever
 * triggers a local-network permission prompt.
 */
export async function getPublicHubBases(hubSlug: string, srcParam?: string | null): Promise<string[]> {
  const bases: string[] = [];
  const add = (u: string | null | undefined) => {
    if (isPublicHttps(u) && !bases.includes(clean(u))) bases.push(clean(u));
  };

  add(srcParam);
  const local = hubService.getHubConnection(hubSlug)?.hub;
  add(local?.publicTunnelUrl);
  add(local?.tunnelUrl);
  try {
    add((await registryService.getHubBySlug(hubSlug))?.tunnel_url);
  } catch { /* registry unreachable — use what we have */ }
  return bases;
}

/**
 * Tries each public base in turn. A definitive HTTP answer (200/403/404)
 * ends the search; only network failures move on to the next base.
 * Returns the base that answered along with its response.
 */
export async function fetchFromPublicHub(
  hubSlug: string,
  srcParam: string | null | undefined,
  path: string,
  timeoutMs = 6000,
): Promise<{ base: string; res: Response } | null> {
  const bases = await getPublicHubBases(hubSlug, srcParam);
  for (const base of bases) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}${path}`, { signal: ctrl.signal });
      return { base, res };
    } catch { /* unreachable — try next */ } finally {
      clearTimeout(t);
    }
  }
  return null;
}
