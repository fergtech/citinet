/**
 * Hub-origin handoff.
 *
 * citinet.cloud is the gateway; once someone has signed in, the hub's OWN
 * bundled UI (served from its public HTTPS tunnel_url) should be the app, so
 * that no single shared origin holds every hub's session and E2E keys.
 *
 * Browser storage is origin-scoped, so the session has to cross explicitly. It
 * travels in the URL *fragment* (never sent to any server, never in a Referer),
 * is read once by the hub-origin app, and is wiped from the address bar
 * immediately. E2E key material goes with it: otherwise a user who never saved
 * their recovery phrase would have keys stranded in the shell origin's
 * IndexedDB.
 *
 * Always falls back to the old same-origin navigation (shell hosts the UI) when
 * the hub has no public HTTPS URL, doesn't bundle a UI, or can't be reached — or runs an older UI build that predates the handoff.
 */

import type { HubConnection } from '../types/hub';
import type { KeyMaterial } from './crypto';
import { hubService } from '../services/hubService';
import { navigateToHub } from './subdomain';
import { rememberHub } from './myHubs';

const FRAGMENT_KEY = 'cn_handoff';
const PROBE_TIMEOUT_MS = 4000;

/** Hostnames that are never reachable by anyone but the same machine/LAN. */
const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1\]?$)|\.(local|lan|internal)$/i;

interface HandoffPayload {
  v: 1;
  slug: string;
  connection: HubConnection;
  keys?: KeyMaterial;
}

/** True for a public https:// address (e.g. the registry's Tailscale Funnel URL). */
export function isPublicHttpsUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !PRIVATE_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

function handoffDisabled(): boolean {
  if ((import.meta.env.VITE_HUB_HANDOFF as string | undefined) === 'off') return true;
  // Dev / LAN-served portal: never bounce a developer off localhost to the real hub.
  return PRIVATE_HOST.test(window.location.hostname);
}

/**
 * A hub's bundled UI is frozen at the time its image was built, so being "a hub
 * that serves a UI" is not enough: an older image serves a UI that predates this
 * handoff and would just drop the user on /onboard with a flood of 401s. Builds
 * that can receive a handoff ship /citinet-ui.json ({"handoff":1}). On older
 * images that path falls through to the SPA fallback (HTML), so the JSON parse
 * fails and we correctly stay on the shell.
 */
async function hubUiAcceptsHandoff(tunnelUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${tunnelUrl.replace(/\/$/, '')}/citinet-ui.json`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return false;
    const body = (await res.json()) as { handoff?: number };
    return body?.handoff === 1;
  } catch {
    return false;
  }
}

function encode(payload: HandoffPayload): string {
  // base64 can contain '+', which URLSearchParams would read back as a space.
  return encodeURIComponent(btoa(encodeURIComponent(JSON.stringify(payload))));
}

/**
 * Reads and removes a handoff from the current URL fragment. Returns null when
 * there is none (or it's malformed). Always strips the fragment.
 */
export function consumeHandoff(): HandoffPayload | null {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const raw = params.get(FRAGMENT_KEY);
  if (raw === null) return null;

  // Strip before parsing so a bad payload can never linger in the address bar.
  params.delete(FRAGMENT_KEY);
  const rest = params.toString();
  window.history.replaceState(
    {}, '', window.location.pathname + window.location.search + (rest ? `#${rest}` : ''),
  );

  try {
    const payload = JSON.parse(decodeURIComponent(atob(raw))) as HandoffPayload;
    if (payload?.v !== 1 || !payload.slug || !payload.connection?.hub || !payload.connection?.user) return null;
    // A payload may only be installed on the very origin it claims to be for.
    const claimed = new URL(payload.connection.hub.tunnelUrl).origin;
    if (claimed !== window.location.origin) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Takes the user into a hub they're signed in to. Hands off to the hub's own
 * origin when it has a public HTTPS UI; otherwise navigates same-origin as before.
 * Also records the hub in My Hubs (the shell just watched the sign-in succeed).
 */
export async function enterHub(slug: string, connection: HubConnection | null, fallbackHub?: HubConnection['hub']): Promise<void> {
  const hub = connection?.hub ?? fallbackHub;
  if (hub) {
    rememberHub({ slug, name: hub.name, tunnelUrl: hub.tunnelUrl }, connection?.user?.authToken ? 'signed-in' : 'opened');
  }

  const tunnelUrl = hub?.tunnelUrl;
  const canHandOff =
    !!connection &&
    !handoffDisabled() &&
    isPublicHttpsUrl(tunnelUrl) &&
    new URL(tunnelUrl!).origin !== window.location.origin &&
    !!connection.user?.authToken;

  if (canHandOff && (await hubUiAcceptsHandoff(tunnelUrl!))) {
    const keys = await hubService.getKeyMaterial(slug).catch(() => null);
    const payload: HandoffPayload = { v: 1, slug, connection: connection!, ...(keys ? { keys } : {}) };
    const dest = new URL(tunnelUrl!.replace(/\/$/, '') + '/');
    dest.searchParams.set('hub', slug);
    dest.hash = `${FRAGMENT_KEY}=${encode(payload)}`;
    window.location.assign(dest.toString());
    return;
  }

  navigateToHub(slug, connection ?? (fallbackHub ? { hub: fallbackHub } : undefined));
}
