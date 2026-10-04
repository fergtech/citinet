/**
 * Account data export — client half.
 *
 * Builds a single .zip of the signed-in member's own data on one hub. It runs
 * in the browser (not on the server) because notes, DMs and private files are
 * end-to-end encrypted: only this device holds the key, so only this device
 * can write them out as readable content.
 *
 * Parts are independent — a member can export everything, or just their Atlas
 * pins, or just their files. Server-side parts come from
 * GET /api/me/export/:part (api/accountExport.js); encrypted parts reuse the
 * same hubService calls the app itself uses, so decryption stays in one place.
 *
 * Layout of the zip:
 *   manifest.json                 what's inside, counts, anything skipped/failed
 *   profile.json  posts.json  atlas.json  marketplace.json  preferences.json
 *   notes/notes.json              + notes/<title>.txt  (readable copies)
 *   messages/conversations.json   + messages/<name>.json / .txt per conversation
 *   files/files.json              + files/data/<id>-<name> (the real bytes)
 *
 * Private keys are deliberately NOT part of any export. Moving an account to
 * another hub is a separate, explicit flow (see the portable-account package).
 */

import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate';
import { hubService } from '../services/hubService';
import type { HubConversation, HubFolder, HubMessage, HubNote } from '../types/hub';

export type ExportPart =
  | 'profile'
  | 'posts'
  | 'atlas'
  | 'marketplace'
  | 'preferences'
  | 'notes'
  | 'messages'
  | 'files';

export const EXPORT_PARTS: { id: ExportPart; label: string; description: string }[] = [
  { id: 'profile',     label: 'Profile',             description: 'Your username, bio, headline, links and public key' },
  { id: 'posts',       label: 'Posts & replies',      description: 'What you posted and replied to, plus likes, RSVPs and saved posts' },
  { id: 'atlas',       label: 'Atlas',                description: 'Pins you created, your pin replies, and pins you saved' },
  { id: 'marketplace', label: 'Marketplace',          description: 'Your vendor profile, listings, and saved vendors/listings' },
  { id: 'notes',       label: 'Notes',                description: 'All your notes, including archived, decrypted on this device' },
  { id: 'messages',    label: 'Messages',             description: 'Every conversation you are in, decrypted on this device' },
  { id: 'files',       label: 'Files',                description: 'Files you uploaded, with their real contents' },
  { id: 'preferences', label: 'Settings',             description: 'Appearance, navigation layout and other preferences' },
];

export interface ExportProgress {
  phase: string;
  /** 0–1 within the whole export, best effort. */
  fraction: number;
}

export interface ExportOptions {
  parts: ExportPart[];
  onProgress?: (p: ExportProgress) => void;
  signal?: AbortSignal;
  /** Extra entries to put in the zip (used by the portable package for keys.json). */
  extraFiles?: Record<string, Uint8Array>;
  /** Merged over the manifest; `format` here replaces the default (package vs plain export). */
  manifestExtra?: Record<string, unknown>;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  counts: Record<string, number>;
  warnings: string[];
  errors: string[];
}

/** Largest single file pulled into memory. Bigger ones are listed but not bundled. */
const MAX_FILE_BYTES = 150 * 1024 * 1024;
const MESSAGE_PAGE = 100;

function safeName(s: string, fallback = 'item'): string {
  const cleaned = s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80);
  return cleaned || fallback;
}

function json(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value, null, 2));
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
}

/** Minimal streaming zip writer — collects chunks into a Blob without a second full copy. */
class ZipBuilder {
  private chunks: Uint8Array[] = [];
  private zip: Zip;
  private done: Promise<void>;

  constructor() {
    let resolve!: () => void;
    let reject!: (e: unknown) => void;
    this.done = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
    this.zip = new Zip((err, chunk, final) => {
      if (err) return reject(err);
      this.chunks.push(chunk);
      if (final) resolve();
    });
  }

  /** Text/JSON — compressed. */
  addText(path: string, data: Uint8Array) {
    const f = new ZipDeflate(path, { level: 6 });
    this.zip.add(f);
    f.push(data, true);
  }

  /** Already-compressed or binary file bytes — stored as-is. */
  addBinary(path: string, data: Uint8Array) {
    const f = new ZipPassThrough(path);
    this.zip.add(f);
    f.push(data, true);
  }

  async finish(): Promise<Blob> {
    this.zip.end();
    await this.done;
    return new Blob(this.chunks as BlobPart[], { type: 'application/zip' });
  }
}

async function fetchServerPart(hubSlug: string, part: string): Promise<Record<string, unknown>> {
  const conn = hubService.getHubConnection(hubSlug);
  if (!conn?.user?.authToken) throw new Error('Not signed in to this hub');
  const res = await fetch(`${conn.hub.tunnelUrl}/api/me/export/${part}`, {
    headers: { Authorization: `Bearer ${conn.user.authToken}` },
  });
  if (res.status === 404) {
    throw new Error('This hub is running an older version that does not support data export yet.');
  }
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  const body = await res.json();
  return body.data as Record<string, unknown>;
}

function countOf(data: Record<string, unknown>): number {
  return Object.values(data).reduce<number>(
    (n, v) => n + (Array.isArray(v) ? v.length : 0),
    0,
  );
}

function transcript(conv: HubConversation, messages: HubMessage[]): string {
  const title = conv.name || conv.members.map((m) => m.username).join(', ');
  const lines = [`Conversation: ${title}`, `Members: ${conv.members.map((m) => m.username).join(', ')}`, ''];
  for (const m of messages) {
    const att = m.attachments?.length ? `  [attachments: ${m.attachments.map((a) => a.file_name).join(', ')}]` : '';
    lines.push(`[${m.created_at}] ${m.sender_username ?? m.sender_id}: ${m.body}${att}`);
  }
  return lines.join('\n');
}

/**
 * Every folder this account can see, at every depth. The folders endpoint only lists ONE
 * level at a time (top level by default), so a flat call silently drops all nested
 * folders — and files inside them would lose their place in the export.
 */
async function listAllFolders(hubSlug: string): Promise<HubFolder[]> {
  const all: HubFolder[] = [];
  const seen = new Set<string>();
  let level: Array<string | null> = [null];
  for (let depth = 0; level.length && depth < 20; depth++) {
    const next: string[] = [];
    for (const parent of level) {
      const children = await hubService.listFolders(hubSlug, parent).catch(() => [] as HubFolder[]);
      for (const f of children) {
        if (seen.has(f.id)) continue;
        seen.add(f.id);
        all.push(f);
        next.push(f.id);
      }
    }
    level = next;
  }
  return all;
}

const EXT_BY_TYPE: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

/**
 * The avatar and banner live in object storage under the member's id, not in the
 * files table, so they are fetched from their own endpoints. Best effort: a
 * member with no avatar/banner just has none in the export.
 */
async function addProfileImages(
  hubSlug: string,
  userId: string,
  profileData: Record<string, unknown>,
  zip: ZipBuilder,
  warnings: string[],
): Promise<void> {
  const profile = (profileData.profile ?? {}) as Record<string, unknown>;
  const targets: Array<{ name: string; url: string | null; has: boolean }> = [
    { name: 'avatar', url: hubService.getAvatarUrl(hubSlug, userId), has: !!profile.avatar_url },
    { name: 'banner', url: hubService.getProfileBannerUrl(hubSlug, userId, profile.banner_image_file_name as string | null), has: !!profile.banner_image_file_name },
  ];
  for (const t of targets) {
    if (!t.has || !t.url) continue;
    try {
      const res = await fetch(t.url);
      if (!res.ok) continue;
      const type = (res.headers.get('content-type') || '').split(';')[0].trim();
      zip.addBinary(`profile/${t.name}.${EXT_BY_TYPE[type] ?? 'img'}`, new Uint8Array(await res.arrayBuffer()));
    } catch {
      warnings.push(`Your ${t.name} image could not be downloaded.`);
    }
  }
}

/**
 * Build the export zip for the signed-in account on `hubSlug`.
 * Failures in one part never abort the others — they are recorded in the
 * manifest and returned in `errors`, so a partial export is still delivered.
 */
export async function buildAccountExport(hubSlug: string, opts: ExportOptions): Promise<ExportResult> {
  const conn = hubService.getHubConnection(hubSlug);
  if (!conn?.user?.authToken) throw new Error('Not signed in to this hub');
  const me = conn.user;

  const parts = EXPORT_PARTS.map((p) => p.id).filter((id) => opts.parts.includes(id));
  if (parts.length === 0) throw new Error('Choose at least one thing to export');

  const zip = new ZipBuilder();
  const counts: Record<string, number> = {};
  const warnings: string[] = [];
  const errors: string[] = [];
  const report = (phase: string, index: number, within = 0) =>
    opts.onProgress?.({ phase, fraction: Math.min(1, (index + within) / parts.length) });

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    throwIfAborted(opts.signal);
    const label = EXPORT_PARTS.find((p) => p.id === part)!.label;
    report(`Exporting ${label}…`, i);

    try {
      if (part === 'profile' || part === 'posts' || part === 'atlas' || part === 'marketplace' || part === 'preferences') {
        const data = await fetchServerPart(hubSlug, part);
        zip.addText(`${part}.json`, json(data));
        counts[part] = countOf(data) || 1;
        if (part === 'profile') await addProfileImages(hubSlug, me.hubUserId ?? '', data, zip, warnings);
      }

      if (part === 'notes') {
        const [active, archived] = await Promise.all([
          hubService.listNotes(hubSlug, false),
          hubService.listNotes(hubSlug, true),
        ]);
        const seen = new Set<string>();
        const notes: HubNote[] = [...active, ...archived].filter((n) => !seen.has(n.id) && seen.add(n.id));
        zip.addText('notes/notes.json', json(notes));
        for (const n of notes) {
          if (n.decryptFailed) {
            warnings.push(`Note "${n.title || n.id}" is encrypted and this device does not have its key — restore your key backup and export again.`);
            continue;
          }
          zip.addText(`notes/${safeName(n.title, 'Untitled')}-${n.id.slice(0, 8)}.txt`, strToU8(`${n.title}\n\n${n.body_plain}`));
        }
        counts.notes = notes.length;
      }

      if (part === 'messages') {
        const convos = await hubService.listConversations(hubSlug);
        zip.addText('messages/conversations.json', json(convos));
        let total = 0;
        for (let c = 0; c < convos.length; c++) {
          throwIfAborted(opts.signal);
          report(`Exporting messages (${c + 1}/${convos.length})…`, i, c / Math.max(convos.length, 1));
          const conv = convos[c];
          const all: HubMessage[] = [];
          let before: string | undefined;
          for (;;) {
            const page = await hubService.getMessages(hubSlug, conv.id, MESSAGE_PAGE, before, conv.members, true);
            if (page.length === 0) break;
            all.unshift(...page);
            before = page[0].id;
            if (page.length < MESSAGE_PAGE) break;
          }
          const undecryptable = all.filter((m) => /^\[(Encrypted|Message unavailable)/.test(m.body)).length;
          if (undecryptable) {
            warnings.push(`${undecryptable} message(s) in "${conv.name || conv.members.map((m) => m.username).join(', ')}" could not be decrypted on this device.`);
          }
          const base = `messages/${safeName(conv.name || conv.members.map((m) => m.username).join('-'), 'conversation')}-${conv.id.slice(0, 8)}`;
          zip.addText(`${base}.json`, json({ conversation: conv, messages: all }));
          zip.addText(`${base}.txt`, strToU8(transcript(conv, all)));
          total += all.length;
        }
        counts.messages = total;
      }

      if (part === 'files') {
        const [allFiles, folders] = await Promise.all([
          hubService.listFiles(hubSlug),
          listAllFolders(hubSlug),
        ]);
        const mine = allFiles.filter((f) => f.owner_id === me.hubUserId);
        const manifest: Record<string, unknown>[] = [];
        let included = 0;
        for (let f = 0; f < mine.length; f++) {
          throwIfAborted(opts.signal);
          const file = mine[f];
          report(`Exporting files (${f + 1}/${mine.length})…`, i, f / Math.max(mine.length, 1));
          const entry: Record<string, unknown> = { ...file, included: false };
          if (file.size > MAX_FILE_BYTES) {
            entry.skipped = `larger than ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB — download it individually from Files`;
            warnings.push(`"${file.name}" is too large to bundle; download it from Files.`);
          } else {
            try {
              const got = await hubService.fetchFileBytes(hubSlug, file.name);
              if (!got.decrypted) {
                entry.skipped = 'encrypted and this device does not have the key';
                warnings.push(`"${file.name}" is encrypted and this device does not have its key.`);
              } else {
                const path = `files/data/${file.id.slice(0, 8)}-${safeName(file.name)}`;
                zip.addBinary(path, new Uint8Array(got.bytes));
                entry.included = true;
                entry.path = path;
                included++;
              }
            } catch (e) {
              entry.skipped = e instanceof Error ? e.message : 'download failed';
              warnings.push(`"${file.name}" could not be downloaded (${entry.skipped}).`);
            }
          }
          manifest.push(entry);
        }
        zip.addText('files/files.json', json({ files: manifest, folders }));
        counts.files = included;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const exportedAt = new Date().toISOString();
  for (const [path, data] of Object.entries(opts.extraFiles ?? {})) zip.addText(path, data);
  zip.addText('manifest.json', json({
    format: 'citinet-account-export',
    version: 1,
    exportedAt,
    hub: { slug: hubSlug, name: conn.hub.name, url: conn.hub.tunnelUrl },
    account: { id: me.hubUserId, username: me.username },
    parts,
    counts,
    warnings,
    errors,
    notes: [
      'Messages include what other people wrote in conversations you are part of.',
      'Encryption keys are not included in this export.',
    ],
    ...(opts.manifestExtra ?? {}),
  }));

  opts.onProgress?.({ phase: 'Packaging…', fraction: 1 });
  const blob = await zip.finish();
  const stamp = exportedAt.slice(0, 10);
  return {
    blob,
    filename: `citinet-${safeName(hubSlug)}-${safeName(me.username)}-${stamp}.zip`,
    counts,
    warnings,
    errors,
  };
}

/** Trigger a browser download for a built export. */
export function downloadExport(result: ExportResult): void {
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
