import { hubService } from './hubService';

export type ExternalSourceKind = 'rss' | 'mastodon_tag' | 'bluesky_feed' | 'google_news' | 'reddit_search' | 'bluesky_search' | 'lemmy_search' | 'threads_search';

export interface ExternalItem {
  id: string;
  title: string;
  excerpt: string;
  url: string;
  author: string | null;
  published_at: string | null;
  source: { id: string; label: string; kind: ExternalSourceKind };
}

export interface ExternalItemsResponse {
  /** False when this member switched Outside off in Account → Outside. */
  enabled: boolean;
  /** The topics actually used to pick items (their own setting, else profile interests). */
  topics: string[];
  items: ExternalItem[];
}

export interface ExternalSourceSummary {
  id: string;
  kind: ExternalSourceKind;
  label: string;
  topics: string[];
}

export interface ExternalSourceAdmin extends ExternalSourceSummary {
  config: Record<string, unknown>;
  enabled: boolean;
  /** Managed by the hub from its location + members' topics; can be switched off but not removed one by one. */
  auto: boolean;
  created_at: string;
  last_fetched_at: string | null;
  last_ok_at: string | null;
  last_error: string | null;
  item_count?: number;
}

export type ExternalSourceInput =
  | { kind: 'rss'; config: { url: string } }
  | { kind: 'mastodon_tag'; config: { instance: string; tag: string } }
  | { kind: 'bluesky_feed'; config: { actor: string } | { feed: string } }
  | { kind: 'google_news'; config: { q: string; must_mention?: string } }
  | { kind: 'reddit_search' | 'bluesky_search'; config: { q: string; must_word?: string } }
  | { kind: 'threads_search'; config: { q: string; mode?: 'KEYWORD' | 'TAG'; type?: 'TOP' | 'RECENT' } }
  | { kind: 'lemmy_search'; config: { q: string; instance?: string; must_word?: string } };

export interface ExternalSettings {
  /** Hub builds local-news searches from its own location. */
  auto: boolean;
  /** ...and adds a search per topic its members chose. */
  use_member_topics: boolean;
  place: { city: string; county: string; state: string; label: string } | null;
  queries: { q: string; label: string; topics: string[] }[];
  threads_connected?: boolean;
  /** Hub AI relevance. `available` = hub AI is on and the embedding model is installed; `active` = available and not switched off here. */
  ai?: { available: boolean; enabled: boolean; active: boolean; embedded: number; total: number };
}

/** Hub-wide Threads account status. The token itself never leaves the hub. */
export interface ThreadsStatus {
  connected: boolean;
  username?: string | null;
  connected_at?: string | null;
  /** Null = unknown (a short-lived token was pasted, so it will lapse within about an hour). */
  expires_at?: string | null;
  /** True once Meta has approved keyword search for public posts; false = only the account's own posts. */
  public_search?: boolean | null;
  probe_error?: string | null;
  last_ok_at?: string | null;
  last_error?: string | null;
}

/** Public-web content the hub pulls in ("Outside"). Server rules and design: api/externalFeeds.js. */
class ExternalFeedService {
  private auth(hubSlug: string) {
    const conn = hubService.getHubConnection(hubSlug);
    if (!conn?.user?.authToken) return null;
    return { baseUrl: conn.hub.tunnelUrl || 'http://localhost:9090', headers: { Authorization: `Bearer ${conn.user.authToken}`, 'Content-Type': 'application/json' } };
  }

  private async call<T>(hubSlug: string, method: string, path: string, body?: unknown): Promise<T> {
    const a = this.auth(hubSlug);
    if (!a) throw new Error('Not connected to hub');
    const res = await fetch(`${a.baseUrl}${path}`, { method, headers: a.headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error((data as { error?: string } | null)?.error || `Request failed (${res.status})`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    return data as T;
  }

  /**
   * Home feed read. A hub that predates this feature answers 404 — that is "nothing Outside yet",
   * not an outage, so it returns an empty result instead of throwing; real failures still throw.
   */
  async getItems(hubSlug: string, limit = 20): Promise<ExternalItemsResponse> {
    try {
      return await this.call<ExternalItemsResponse>(hubSlug, 'GET', `/api/external/items?limit=${limit}`);
    } catch (err) {
      if ((err as { status?: number }).status === 404) return { enabled: true, topics: [], items: [] };
      throw err;
    }
  }

  getSources(hubSlug: string): Promise<ExternalSourceSummary[]> {
    return this.call(hubSlug, 'GET', '/api/external/sources');
  }

  // ── hub admin ────────────────────────────────────────────────────────────
  adminSettings(hubSlug: string): Promise<ExternalSettings> {
    return this.call(hubSlug, 'GET', '/api/admin/external-sources/settings');
  }
  adminSaveSettings(hubSlug: string, patch: { auto?: boolean; use_member_topics?: boolean; ai?: boolean }): Promise<ExternalSettings> {
    return this.call(hubSlug, 'PUT', '/api/admin/external-sources/settings', patch);
  }
  threadsStatus(hubSlug: string): Promise<ThreadsStatus> {
    return this.call(hubSlug, 'GET', '/api/admin/external-sources/threads');
  }
  threadsConnect(hubSlug: string, token: string): Promise<ThreadsStatus> {
    return this.call(hubSlug, 'PUT', '/api/admin/external-sources/threads', { token });
  }
  threadsTest(hubSlug: string): Promise<ThreadsStatus> {
    return this.call(hubSlug, 'POST', '/api/admin/external-sources/threads/test');
  }
  threadsDisconnect(hubSlug: string): Promise<ThreadsStatus> {
    return this.call(hubSlug, 'DELETE', '/api/admin/external-sources/threads');
  }
  adminList(hubSlug: string): Promise<ExternalSourceAdmin[]> {
    return this.call(hubSlug, 'GET', '/api/admin/external-sources');
  }
  adminAdd(hubSlug: string, input: ExternalSourceInput & { label?: string; topics?: string[] }): Promise<ExternalSourceAdmin> {
    return this.call(hubSlug, 'POST', '/api/admin/external-sources', input);
  }
  adminUpdate(hubSlug: string, id: string, patch: { label?: string; topics?: string[]; enabled?: boolean }): Promise<ExternalSourceAdmin> {
    return this.call(hubSlug, 'PATCH', `/api/admin/external-sources/${id}`, patch);
  }
  adminDelete(hubSlug: string, id: string): Promise<{ ok: true }> {
    return this.call(hubSlug, 'DELETE', `/api/admin/external-sources/${id}`);
  }
  adminRefresh(hubSlug: string, id: string): Promise<{ ok: boolean; count?: number; error?: string }> {
    return this.call(hubSlug, 'POST', `/api/admin/external-sources/${id}/refresh`);
  }
}

export const externalFeedService = new ExternalFeedService();
