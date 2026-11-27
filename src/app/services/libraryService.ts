import { hubService } from './hubService';

export type LibrarySourceType = 'pdf' | 'epub' | 'html' | 'kiwix';

export interface LibraryCategory {
  slug: string;
  label: string;
  count: number;
}

export interface LibraryItem {
  id: string;
  category: string;
  type: LibrarySourceType;
  title: string;
  description: string;
  license: string;
  tags: string[];
  size_bytes: number | string;
}

export interface LibraryItemDetail {
  source: {
    id: string;
    category: string;
    type: LibrarySourceType;
    title: string;
    description: string;
    license: string;
    tags: string[];
    sizeBytes: number;
  };
  /** Absolute URL for the file/page (a short-lived capability link); null for Kiwix packs. */
  viewerUrl: string | null;
  /** Archives (.zim) only: base URL the reader searches and browses under (absolute). */
  archiveUrl?: string;
  /** Archives only: false when the hub's optional archive reader container isn't running. */
  readerAvailable?: boolean;
}

/** One book in an archive that is a book collection (medicine, water, post-disaster guides...). */
export interface ArchiveBook {
  id: string;
  title: string;
  author: string;
  description: string;
  /** File names inside the archive, in reading order (almost always one PDF). */
  files: string[];
}

export interface PackItem {
  id: string;
  title: string;
  description: string;
  license: string;
  /** Size and edition come from Kiwix itself; null until looked up (or when offline). */
  size: number | null;
  version: string | null;
  status: 'queued' | 'downloading' | 'verifying' | 'done';
  done: number;
  total: number;
}

export interface Pack {
  id: string;
  title: string;
  description: string;
  category: string;
  items: PackItem[];
  totalBytes: number | null;
  /** available = not installed; paused = partly downloaded, waiting to resume. */
  state: 'available' | 'installing' | 'failed' | 'installed' | 'paused';
  vaultId: string | null;
  error: string;
}

export interface PacksResponse {
  packs: Pack[];
  freeBytes: number | null;
  /** False when this hub has no knowledge folder mounted yet (needs an update). */
  canInstall: boolean;
  /** Set when Kiwix's servers couldn't be reached to look up sizes. */
  resolveError: string;
  busy: boolean;
}

export interface LibraryVault {
  id: string;
  name: string;
  status: 'importing' | 'ready';
  size_bytes: number | string;
  imported_at: string;
  source_count: number;
}

/** A hub that predates the Knowledge Vault answers 404 on these routes. */
export class LibraryUnsupportedError extends Error {
  constructor() {
    super('This hub has not been updated to support the Library yet.');
  }
}

/**
 * Offline reference library imported from a Knowledge Vault drive (see api/knowledgeVault.js).
 * Everything is served by the hub itself, so it keeps working with no internet.
 */
class LibraryService {
  private auth(hubSlug: string) {
    const conn = hubService.getHubConnection(hubSlug);
    if (!conn?.user?.authToken) return null;
    return { baseUrl: conn.hub.tunnelUrl || 'http://localhost:9090', token: conn.user.authToken };
  }

  private async call<T>(hubSlug: string, method: string, path: string): Promise<T> {
    const a = this.auth(hubSlug);
    if (!a) throw new Error('Not connected to hub');
    const res = await fetch(`${a.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${a.token}` },
    });
    const data = await res.json().catch(() => null);
    // An old hub has no such route: it answers 404 with no JSON, or hands back the web app's own
    // index.html with a 200 (its single-page fallback). Every real answer from the Library routes is
    // JSON, so a reply that isn't means "this hub doesn't have the Library yet" -- never "no data".
    if (data === null && (res.ok || res.status === 404)) throw new LibraryUnsupportedError();
    if (!res.ok) throw new Error((data as { error?: string } | null)?.error || `Request failed (${res.status})`);
    return data as T;
  }

  async categories(hubSlug: string): Promise<LibraryCategory[]> {
    return (await this.call<{ categories: LibraryCategory[] }>(hubSlug, 'GET', '/api/knowledge/categories')).categories;
  }

  async search(hubSlug: string, opts: { category?: string; q?: string }): Promise<LibraryItem[]> {
    const qs = new URLSearchParams();
    if (opts.category) qs.set('category', opts.category);
    if (opts.q?.trim()) qs.set('q', opts.q.trim());
    return (await this.call<{ sources: LibraryItem[] }>(hubSlug, 'GET', `/api/knowledge/sources?${qs}`)).sources;
  }

  /** Fetches a fresh viewer link (they expire after 30 minutes) and makes it absolute. */
  async open(hubSlug: string, id: string): Promise<LibraryItemDetail> {
    const a = this.auth(hubSlug);
    const d = await this.call<LibraryItemDetail>(hubSlug, 'GET', `/api/knowledge/sources/${encodeURIComponent(id)}`);
    return {
      ...d,
      viewerUrl: d.viewerUrl && a ? `${a.baseUrl}${d.viewerUrl}` : d.viewerUrl,
      archiveUrl: d.archiveUrl && a ? `${a.baseUrl}${d.archiveUrl}` : d.archiveUrl,
    };
  }

  /** Title search inside one archive. Only entries that are real pages (not full-text hints). */
  async archiveSuggest(archiveUrl: string, term: string): Promise<{ title: string; path: string }[]> {
    const res = await fetch(`${archiveUrl}/__suggest?term=${encodeURIComponent(term)}`);
    if (res.status === 403) throw new Error('This page link has expired. Press Reload at the top.');
    if (!res.ok) throw new Error(res.status === 503 ? 'The archive reader is not running on this hub.' : `Search failed (${res.status})`);
    const rows = (await res.json()) as { value?: string; path?: string; kind?: string }[];
    return rows.filter(r => r.kind === 'path' && r.path).map(r => ({ title: r.value ?? r.path!, path: r.path! }));
  }

  /** The archive's own book list, or null when it is a normal website-style archive. */
  async archiveBooks(archiveUrl: string): Promise<ArchiveBook[] | null> {
    const res = await fetch(`${archiveUrl}/__books`);
    if (res.status === 404) return null;
    if (res.status === 403) throw new Error('This page link has expired. Press Reload at the top.');
    if (!res.ok) throw new Error(res.status === 503 ? 'The archive reader is not running on this hub.' : `Could not load the book list (${res.status})`);
    return ((await res.json()) as { books: ArchiveBook[] }).books;
  }

  /** URL of one file in a book collection (a PDF). */
  archiveFile(archiveUrl: string, fileName: string): string {
    return `${archiveUrl}/files/${fileName.split('/').map(encodeURIComponent).join('/')}`;
  }

  /** URL of one page inside an archive ('' = the archive's main page). */
  archivePage(archiveUrl: string, path: string): string {
    return `${archiveUrl}/${path.split('/').map(encodeURIComponent).join('/')}`;
  }

  /** The pack catalog with each pack's state. `resolve` also asks Kiwix for current sizes (needs internet). */
  packs(hubSlug: string, resolve = false): Promise<PacksResponse> {
    return this.call<PacksResponse>(hubSlug, 'GET', `/api/admin/knowledge/packs${resolve ? '?resolve=1' : ''}`);
  }

  installPack(hubSlug: string, packId: string) {
    return this.call<{ started: true; vaultId: string }>(hubSlug, 'POST', `/api/admin/knowledge/packs/${encodeURIComponent(packId)}/install`);
  }

  /** Stops a download and discards what was fetched so far. */
  cancelPack(hubSlug: string, packId: string) {
    return this.call<{ ok: true }>(hubSlug, 'POST', `/api/admin/knowledge/packs/${encodeURIComponent(packId)}/cancel`);
  }

  async vaults(hubSlug: string): Promise<LibraryVault[]> {
    return (await this.call<{ vaults: LibraryVault[] }>(hubSlug, 'GET', '/api/admin/knowledge/vaults')).vaults;
  }

  removeVault(hubSlug: string, id: string) {
    return this.call<{ ok: true }>(hubSlug, 'DELETE', `/api/admin/knowledge/vaults/${encodeURIComponent(id)}`);
  }
}

export const libraryService = new LibraryService();

export const formatBytes = (n: number | string): string => {
  const v = Number(n) || 0;
  if (v >= 1 << 30) return `${(v / (1 << 30)).toFixed(1)} GB`;
  if (v >= 1 << 20) return `${(v / (1 << 20)).toFixed(1)} MB`;
  if (v >= 1 << 10) return `${Math.round(v / (1 << 10))} KB`;
  return `${v} B`;
};
