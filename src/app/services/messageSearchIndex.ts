/**
 * Local, client-side full-history message search index.
 *
 * DM message bodies are end-to-end encrypted (see utils/crypto.ts) — the
 * server only ever stores ciphertext for them and can never search their
 * content, even in principle. So, like Signal/WhatsApp Desktop, "search
 * everything I've ever been sent" has to run client-side against a local
 * history the browser has already fetched and decrypted. hubService.getMessages()
 * already does that decryption per page; this module just persists what it
 * returns (plaintext, post-decryption) into IndexedDB so it survives reloads,
 * and keeps an in-memory mirror for instant, synchronous search-as-you-type.
 *
 * Never stores ciphertext or key material — only what the rest of the UI
 * already renders in plaintext.
 */
import { hubService } from './hubService';
import type { HubConversation, HubMessage } from '../types/hub';

export interface MessageSearchHit {
  conversationId: string;
  messageId: string;
  body: string;
  createdAt: string;
}

interface SyncState {
  oldestSyncedId?: string;
  fullySynced: boolean;
  lastSyncedAt: string;
}

const DB_NAME = 'citinet-message-index';
const DB_VERSION = 1;
const STORE_MESSAGES = 'messages';
const STORE_SYNC = 'sync_state';

const PAGE_LIMIT = 100;
const PAGE_DELAY_MS = 200;
// A pathologically long single conversation just picks up remaining pages on
// the next ensureBackfill() call (e.g. next Messages screen mount) instead of
// spinning indefinitely in one pass.
const MAX_PAGES_PER_CALL = 20;

function msgKey(hubSlug: string, conversationId: string, messageId: string): string {
  return `${hubSlug}:${conversationId}:${messageId}`;
}
function stateKey(hubSlug: string, conversationId: string): string {
  return `${hubSlug}:${conversationId}`;
}
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Highest possible single UTF-16 code unit — used only as the exclusive-ish
// upper bound of a "starts with this prefix" IDBKeyRange scan. Built via
// fromCharCode (rather than embedding the literal character) so the source
// file itself stays plain ASCII.
const KEY_RANGE_MAX_SUFFIX = String.fromCharCode(0xffff);
function hubKeyRange(hubSlug: string): IDBKeyRange {
  return IDBKeyRange.bound(`${hubSlug}:`, `${hubSlug}:${KEY_RANGE_MAX_SUFFIX}`);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) db.createObjectStore(STORE_MESSAGES);
      if (!db.objectStoreNames.contains(STORE_SYNC)) db.createObjectStore(STORE_SYNC);
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = (e) => reject((e.target as IDBOpenDBRequest).error);
  });
}

async function idbPut(store: string, key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).put(value, key);
    req.onsuccess = () => { db.close(); resolve(); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/** Every record whose key starts with `${hubSlug}:` — object store keys sort
 * lexically, so a bound range over that prefix is a plain, index-free scan. */
async function idbGetAllForHub<T>(store: string, hubSlug: string): Promise<T[]> {
  const db = await openDb();
  const range = hubKeyRange(hubSlug);
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll(range);
    req.onsuccess = () => { db.close(); resolve(req.result ?? []); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function idbClearForHub(store: string, hubSlug: string): Promise<void> {
  const db = await openDb();
  const range = hubKeyRange(hubSlug);
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).delete(range);
    req.onsuccess = () => { db.close(); resolve(); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

// hubSlug -> conversationId -> messageId -> message. Nested maps give O(1)
// upsert/dedupe; search flattens on demand (see searchMessages).
const memory = new Map<string, Map<string, Map<string, HubMessage>>>();
const backfillRunning = new Set<string>();

function memoryForHub(hubSlug: string): Map<string, Map<string, HubMessage>> {
  let m = memory.get(hubSlug);
  if (!m) { m = new Map(); memory.set(hubSlug, m); }
  return m;
}

/** Loads this hub's persisted index into memory. Safe to call repeatedly —
 * a no-op once a hub's already loaded this session. */
export async function initForHub(hubSlug: string): Promise<void> {
  if (memory.has(hubSlug)) return;
  const records = await idbGetAllForHub<HubMessage>(STORE_MESSAGES, hubSlug).catch(() => []);
  const byConvo = memoryForHub(hubSlug);
  for (const rec of records) {
    let convoMap = byConvo.get(rec.conversation_id);
    if (!convoMap) { convoMap = new Map(); byConvo.set(rec.conversation_id, convoMap); }
    convoMap.set(rec.id, rec);
  }
}

/** Upserts a page of already-decrypted messages into both the in-memory
 * mirror and IndexedDB. Cheap — call this after any live message fetch/send. */
export async function ingestMessages(hubSlug: string, conversationId: string, messages: HubMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const byConvo = memoryForHub(hubSlug);
  let convoMap = byConvo.get(conversationId);
  if (!convoMap) { convoMap = new Map(); byConvo.set(conversationId, convoMap); }
  await Promise.all(messages.map(m => {
    convoMap!.set(m.id, m);
    return idbPut(STORE_MESSAGES, msgKey(hubSlug, conversationId, m.id), m).catch(() => {});
  }));
}

async function getSyncState(hubSlug: string, conversationId: string): Promise<SyncState | undefined> {
  return idbGet<SyncState>(STORE_SYNC, stateKey(hubSlug, conversationId)).catch(() => undefined);
}

async function setSyncState(hubSlug: string, conversationId: string, state: SyncState): Promise<void> {
  await idbPut(STORE_SYNC, stateKey(hubSlug, conversationId), state).catch(() => {});
}

async function backfillConversation(hubSlug: string, convo: HubConversation): Promise<void> {
  const state = await getSyncState(hubSlug, convo.id);
  if (state?.fullySynced) return;
  let before = state?.oldestSyncedId;

  for (let i = 0; i < MAX_PAGES_PER_CALL; i++) {
    let page: HubMessage[];
    try {
      page = await hubService.getMessages(hubSlug, convo.id, PAGE_LIMIT, before, convo.members);
    } catch {
      return; // network hiccup — next ensureBackfill() call retries from this same cursor
    }
    if (page.length === 0) {
      await setSyncState(hubSlug, convo.id, { oldestSyncedId: before, fullySynced: true, lastSyncedAt: new Date().toISOString() });
      return;
    }

    await ingestMessages(hubSlug, convo.id, page);
    // getMessages returns chronological (oldest→newest) order per page, so
    // index 0 is this page's oldest message — the right cursor for the next,
    // older page.
    before = page[0].id;

    if (page.length < PAGE_LIMIT) {
      await setSyncState(hubSlug, convo.id, { oldestSyncedId: before, fullySynced: true, lastSyncedAt: new Date().toISOString() });
      return;
    }
    await setSyncState(hubSlug, convo.id, { oldestSyncedId: before, fullySynced: false, lastSyncedAt: new Date().toISOString() });
    await delay(PAGE_DELAY_MS);
  }
}

/** Walks every conversation not yet fully synced, paging its history
 * backward into the index. Sequential and throttled on purpose — this never
 * competes with foreground requests. Safe to call on every Messages screen
 * mount; already-synced conversations return immediately. */
export async function ensureBackfill(hubSlug: string, conversations: HubConversation[]): Promise<void> {
  if (backfillRunning.has(hubSlug)) return;
  backfillRunning.add(hubSlug);
  try {
    await initForHub(hubSlug);
    for (const convo of conversations) {
      // Drafts are local-only and don't exist as real conversations yet.
      if (convo.id.startsWith('draft')) continue;
      await backfillConversation(hubSlug, convo);
      await delay(PAGE_DELAY_MS);
    }
  } finally {
    backfillRunning.delete(hubSlug);
  }
}

export function isBackfilling(hubSlug: string): boolean {
  return backfillRunning.has(hubSlug);
}

/** Best (most recent) matching message per conversation, synchronous —
 * reads only the in-memory mirror, safe to call on every keystroke. */
export function searchMessages(hubSlug: string, query: string): MessageSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const byConvo = memory.get(hubSlug);
  if (!byConvo) return [];

  const hits: MessageSearchHit[] = [];
  for (const [conversationId, messages] of byConvo) {
    let best: HubMessage | undefined;
    for (const m of messages.values()) {
      if (!m.body.toLowerCase().includes(q)) continue;
      if (!best || new Date(m.created_at).getTime() > new Date(best.created_at).getTime()) best = m;
    }
    if (best) hits.push({ conversationId, messageId: best.id, body: best.body, createdAt: best.created_at });
  }
  return hits;
}

/** Wipes this hub's index (both IndexedDB and the in-memory mirror) — called
 * on leaveHub(), same privacy hygiene as clearing E2E keys. */
export async function clearIndexForHub(hubSlug: string): Promise<void> {
  memory.delete(hubSlug);
  backfillRunning.delete(hubSlug);
  await Promise.all([
    idbClearForHub(STORE_MESSAGES, hubSlug).catch(() => {}),
    idbClearForHub(STORE_SYNC, hubSlug).catch(() => {}),
  ]);
}
