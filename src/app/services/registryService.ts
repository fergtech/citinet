/**
 * Registry Service for Citinet
 *
 * Fetches the public hub listing from the registry API.
 * The registry is a Cloudflare Worker backed by KV storage.
 * Hubs self-register via their admin panel (Public Access section).
 *
 * Registry API:
 *   GET  /hubs              → { hubs: RegistryHub[], updated_at: string }
 *   GET  /hubs/by-slug/:slug → single hub lookup by slug
 *   POST /hubs              → register / update a hub (called by admin panel)
 *   DELETE /hubs/:id        → deregister (called by admin panel)
 */

import type { HubIconFields } from '../types/hub';

export interface RegistryHub extends HubIconFields {
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
  /** Geocoded latitude, for distance-based sorting (older entries may lack this) */
  lat?: number;
  /** Geocoded longitude, for distance-based sorting (older entries may lack this) */
  lng?: number;
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

// Read URL — static JSON served from GitHub (fast, CDN-cached).
// Set VITE_REGISTRY_URL in Vercel env vars and .env.local.
const REGISTRY_URL: string | null = import.meta.env.VITE_REGISTRY_URL ?? null;
// Write URL — Vercel serverless function that handles GitHub auth.
// Relative /api/registry works in production; gracefully fails in local dev.
const REGISTRY_API_URL: string = import.meta.env.VITE_REGISTRY_API_URL ?? '/api/registry';
const FETCH_TIMEOUT_MS = 10_000;

class RegistryService {
  /**
   * Fetch all publicly registered hubs.
   * Returns an empty array if the registry is unreachable (graceful fallback).
   */
  async getHubs(): Promise<RegistryHub[]> {
    if (!REGISTRY_URL) {
      console.warn('[registry] disabled for local development');
      return [];
    }
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
   * Look up a single hub by its slug.
   * Used by hub-mode pages to resolve the subdomain → tunnel URL.
   * Returns null if not found or registry unreachable.
   */
  async getHubBySlug(slug: string): Promise<RegistryHub | null> {
    const hubs = await this.getHubs();
    return hubs.find(h => h.slug === slug) ?? null;
  }

  /**
   * Register or update a hub in the public registry.
   * The Vercel API function handles GitHub auth — no token needed from the caller.
   * Fires automatically when a hub admin saves a tunnel URL.
   */
  async registerHub(
    hub: Omit<RegistryHub, 'registered_at' | 'last_seen'>,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(REGISTRY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
  async deregisterHub(hubId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${REGISTRY_API_URL}?id=${encodeURIComponent(hubId)}`, {
        method: 'DELETE',
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
