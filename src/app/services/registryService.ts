/**
 * Registry Service for Citinet
 *
 * Fetches the public hub listing from https://registry.citinet.cloud/hubs.
 * The registry is a Cloudflare Worker backed by KV storage.
 * Hubs self-register via the Tauri desktop client's Admin → Public Access panel.
 *
 * Registry API (registry.citinet.cloud):
 *   GET  /hubs            → { hubs: RegistryHub[], updated_at: string }
 *   POST /hubs            → register / update a hub (called by Tauri client)
 *   DELETE /hubs/:id      → deregister (called by Tauri client)
 */

export interface RegistryHub {
  /** Unique hub ID (node_id from the hub's /api/info) */
  id: string;
  /** Human-readable hub name */
  name: string;
  /** URL-friendly slug */
  slug: string;
  /** City/neighbourhood description */
  location: string;
  /** Optional short description of the community */
  description?: string;
  /** The hub's public tunnel URL (custom domain or trycloudflare) */
  tunnel_url: string;
  /** Approximate member count (refreshed periodically by the hub) */
  member_count?: number;
  /** Whether the hub was reachable on last registry ping */
  online?: boolean;
  /** ISO timestamp of when the hub first registered */
  registered_at: string;
  /** ISO timestamp of last heartbeat / update */
  last_seen?: string;
}

interface RegistryResponse {
  hubs: RegistryHub[];
  updated_at: string;
}

const REGISTRY_URL = 'https://registry.citinet.cloud/hubs';
const FETCH_TIMEOUT_MS = 10_000;

class RegistryService {
  /**
   * Fetch all publicly registered hubs.
   * Returns an empty array if the registry is unreachable (graceful fallback).
   */
  async getHubs(): Promise<RegistryHub[]> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const res = await fetch(REGISTRY_URL, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timer);

      if (!res.ok) {
        console.warn(`[registry] fetch failed: ${res.status}`);
        return [];
      }

      const data: RegistryResponse = await res.json();
      return Array.isArray(data.hubs) ? data.hubs : [];
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.warn('[registry] request timed out');
      } else {
        console.warn('[registry] unreachable:', err);
      }
      return [];
    }
  }

  /**
   * Register or update a hub in the public registry.
   * Called from the Tauri desktop app after a tunnel is set up.
   * Requires the Cloudflare API token to be stored in the hub's SQLite DB.
   *
   * @param apiToken  - Cloudflare API token (passed from Tauri backend)
   * @param hub       - Hub registration payload
   */
  async registerHub(
    apiToken: string,
    hub: Omit<RegistryHub, 'registered_at' | 'last_seen'>,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(REGISTRY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify(hub),
      });

      if (!res.ok) {
        const body = await res.text();
        return { ok: false, error: body || `Registry responded ${res.status}` };
      }

      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  /**
   * Deregister a hub from the public registry.
   */
  async deregisterHub(
    apiToken: string,
    hubId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${REGISTRY_URL}/${encodeURIComponent(hubId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiToken}` },
      });

      if (!res.ok && res.status !== 204) {
        const body = await res.text();
        return { ok: false, error: body || `Registry responded ${res.status}` };
      }

      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }
}

export const registryService = new RegistryService();
