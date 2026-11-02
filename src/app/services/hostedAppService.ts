import { hubService } from './hubService';

export interface HostedAppVersion {
  version: number;
  fileCount: number;
  totalBytes: number;
  createdAt: string;
}

export interface HostedApp {
  slug: string;
  name: string;
  description: string;
  status: 'published' | 'disabled';
  currentVersion: number | null;
  updatedAt: string;
  versions: HostedAppVersion[];
  /** Path on the hub, e.g. /apps/jobs/ */
  path: string;
  /** Public address on the shared apps domain, once it has been claimed (null = hub-only for now). */
  publicUrl: string | null;
}

export interface HostedAppListing {
  slug: string;
  name: string;
  description: string;
  version: number;
  updatedAt: string;
  path: string;
  publicUrl: string | null;
}

export interface UploadResult {
  slug: string;
  version: number;
  fileCount: number;
  totalBytes: number;
  path: string;
  publicUrl: string | null;
  warnings: string[];
}

/** Static web apps a hub admin hosts on the hub itself. Server rules and design: api/hubApps.js. */
class HostedAppService {
  private auth(hubSlug: string) {
    const conn = hubService.getHubConnection(hubSlug);
    if (!conn?.user?.authToken) return null;
    return {
      baseUrl: conn.hub.tunnelUrl || 'http://localhost:9090',
      token: conn.user.authToken,
    };
  }

  private async call<T>(hubSlug: string, method: string, path: string, body?: unknown): Promise<T> {
    const a = this.auth(hubSlug);
    if (!a) throw new Error('Not connected to hub');
    const res = await fetch(`${a.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${a.token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data as { error?: string } | null)?.error || `Request failed (${res.status})`);
    return data as T;
  }

  /** Absolute URL a visitor opens, on the hub's own address. */
  appUrl(hubSlug: string, path: string): string {
    return `${this.auth(hubSlug)?.baseUrl ?? ''}${path}`;
  }

  listAdmin(hubSlug: string) {
    return this.call<HostedApp[]>(hubSlug, 'GET', '/api/admin/hub-apps');
  }

  /** Published apps, for any signed-in member. */
  listPublished(hubSlug: string) {
    return this.call<HostedAppListing[]>(hubSlug, 'GET', '/api/hub-apps');
  }

  /** Upload a zip of a built app (the contents of dist/). Creates the app on first upload. */
  async upload(hubSlug: string, slug: string, zip: File, meta: { name?: string; description?: string }): Promise<UploadResult> {
    const a = this.auth(hubSlug);
    if (!a) throw new Error('Not connected to hub');
    const qs = new URLSearchParams();
    if (meta.name) qs.set('name', meta.name);
    if (meta.description) qs.set('description', meta.description);
    const res = await fetch(`${a.baseUrl}/api/admin/hub-apps/${encodeURIComponent(slug)}/upload?${qs}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/zip' },
      body: zip,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data as { error?: string } | null)?.error || `Upload failed (${res.status})`);
    return data as UploadResult;
  }

  setStatus(hubSlug: string, slug: string, status: 'published' | 'disabled') {
    return this.call<{ ok: true }>(hubSlug, 'PATCH', `/api/admin/hub-apps/${encodeURIComponent(slug)}`, { status });
  }

  rollback(hubSlug: string, slug: string, version: number) {
    return this.call<{ ok: true }>(hubSlug, 'POST', `/api/admin/hub-apps/${encodeURIComponent(slug)}/rollback`, { version });
  }

  remove(hubSlug: string, slug: string) {
    return this.call<{ ok: true }>(hubSlug, 'DELETE', `/api/admin/hub-apps/${encodeURIComponent(slug)}`);
  }
}

export const hostedAppService = new HostedAppService();
