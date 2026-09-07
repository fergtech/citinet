/**
 * Offline write queue for post creation, replies, and poll votes.
 *
 * Any of these while the hub is unreachable (e.g. mid-restart) used to just
 * fail with a raw fetch error and leave the user to notice and manually
 * resubmit. This persists the attempt in IndexedDB (so it survives a reload,
 * and can hold a File attachment natively -- no base64 needed) and gets
 * auto-retried once HubContext's own health check reports the hub reachable
 * again. HubContext itself calls flushQueuedWrites and re-broadcasts the
 * outcome as window events (see 'citinet:queued-write-sent'/'-failed'), since
 * it's the one thing guaranteed mounted regardless of which screen the user
 * is on when the hub comes back -- unlike Feed or a post detail view, which
 * may well have been navigated away from by then.
 *
 * Only network-level failures (the request never reached the server) get
 * queued -- each *OrQueue function distinguishes this via `err instanceof
 * TypeError`, which is how a failed fetch() itself always surfaces (DNS/
 * connection-refused/timeout), as opposed to hubService's own parseErrorResponse
 * throwing a plain Error for a real HTTP error response. A real HTTP error
 * (validation, auth, etc.) still surfaces immediately as before, since
 * retrying it later won't fix it.
 */
import { hubService } from './hubService';
import type { HubPost, HubPostReply } from '../types/hub';

export interface QueuedPostPayload {
  category: string; title?: string; body: string; mediaFile?: File;
  eventDate?: string; eventLocation?: string; eventLat?: number; eventLng?: number;
  visibility?: 'inherit' | 'hub' | 'private';
  options?: string[]; closesAt?: string; requestId?: string; quorumPct?: number; passPct?: number;
}

export interface QueuedReplyPayload {
  postId: string;
  body: string;
  replyToReplyId?: string | null;
  replyToUserId?: string | null;
}

export interface QueuedVotePayload {
  postId: string;
  optionIndex: number;
}

type QueuedWrite =
  | { kind: 'post'; payload: QueuedPostPayload }
  | { kind: 'reply'; payload: QueuedReplyPayload }
  | { kind: 'vote'; payload: QueuedVotePayload };

interface QueuedItem {
  id: string;
  hubSlug: string;
  write: QueuedWrite;
  createdAt: number;
}

const DB_NAME = 'citinet-write-queue';
// v2: one generic `queued_writes` store (post/reply/vote) replaces v1's
// post-only `queued_posts` -- nothing shipped depends on v1 data surviving.
const DB_VERSION = 2;
const STORE = 'queued_writes';
const LEGACY_STORE_V1 = 'queued_posts';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (db.objectStoreNames.contains(LEGACY_STORE_V1)) db.deleteObjectStore(LEGACY_STORE_V1);
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueue(hubSlug: string, write: QueuedWrite): Promise<void> {
  const db = await openDb();
  const item: QueuedItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    hubSlug,
    write,
    createdAt: Date.now(),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function listQueued(hubSlug: string): Promise<QueuedItem[]> {
  const db = await openDb();
  const all = await new Promise<QueuedItem[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueuedItem[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return all.filter(i => i.hubSlug === hubSlug).sort((a, b) => a.createdAt - b.createdAt);
}

async function removeQueued(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** How many writes are currently queued for this hub -- for a "N waiting to send" indicator. */
export async function queuedWriteCount(hubSlug: string): Promise<number> {
  try { return (await listQueued(hubSlug)).length; } catch { return 0; }
}

/**
 * Attempts to create a post immediately. If the hub is unreachable, the
 * attempt is persisted instead of thrown. Returns the created post on
 * success, or null if it was queued for later.
 */
export async function createPostOrQueue(hubSlug: string, payload: QueuedPostPayload): Promise<HubPost | null> {
  try {
    return await hubService.createPost(hubSlug, payload);
  } catch (err) {
    if (err instanceof TypeError) {
      await enqueue(hubSlug, { kind: 'post', payload });
      return null;
    }
    throw err;
  }
}

/** Same pattern as createPostOrQueue, for a reply. */
export async function createReplyOrQueue(
  hubSlug: string,
  postId: string,
  body: string,
  replyToReplyId?: string | null,
  replyToUserId?: string | null,
): Promise<HubPostReply | null> {
  try {
    return await hubService.createReply(hubSlug, postId, body, replyToReplyId, replyToUserId);
  } catch (err) {
    if (err instanceof TypeError) {
      await enqueue(hubSlug, { kind: 'reply', payload: { postId, body, replyToReplyId, replyToUserId } });
      return null;
    }
    throw err;
  }
}

/**
 * Same pattern as createPostOrQueue, for a poll vote. Returns true if sent
 * immediately, false if queued -- callers doing an optimistic vote UI (Feed,
 * Dashboard) should keep that optimistic state on a queued (false) result
 * rather than reverting it, since it still reflects what the user did.
 */
export async function voteOrQueue(hubSlug: string, postId: string, optionIndex: number): Promise<boolean> {
  try {
    await hubService.votePoll(hubSlug, postId, optionIndex);
    return true;
  } catch (err) {
    if (err instanceof TypeError) {
      await enqueue(hubSlug, { kind: 'vote', payload: { postId, optionIndex } });
      return false;
    }
    throw err;
  }
}

export interface FlushHandlers {
  onPostSent?: (post: HubPost) => void;
  onPostFailed?: (payload: QueuedPostPayload, error: unknown) => void;
  onReplySent?: (postId: string, reply: HubPostReply) => void;
  onReplyFailed?: (payload: QueuedReplyPayload, error: unknown) => void;
  onVoteSent?: (postId: string, optionIndex: number) => void;
  onVoteFailed?: (payload: QueuedVotePayload, error: unknown) => void;
}

/**
 * Sends every queued write for this hub, in the order they were made. Call
 * once the hub is confirmed reachable again (see HubContext.tsx). Each item
 * is removed from the queue as soon as it's attempted -- a failure here means
 * a real error (we already know the hub is up), not a connectivity blip, so
 * it's surfaced via the matching *Failed handler rather than left to retry
 * forever.
 */
export async function flushQueuedWrites(hubSlug: string, handlers: FlushHandlers): Promise<void> {
  let items: QueuedItem[];
  try { items = await listQueued(hubSlug); } catch { return; }
  for (const item of items) {
    const { write } = item;
    try {
      if (write.kind === 'post') {
        const post = await hubService.createPost(hubSlug, write.payload);
        await removeQueued(item.id);
        handlers.onPostSent?.(post);
      } else if (write.kind === 'reply') {
        const { postId, body, replyToReplyId, replyToUserId } = write.payload;
        const reply = await hubService.createReply(hubSlug, postId, body, replyToReplyId, replyToUserId);
        await removeQueued(item.id);
        handlers.onReplySent?.(postId, reply);
      } else {
        const { postId, optionIndex } = write.payload;
        await hubService.votePoll(hubSlug, postId, optionIndex);
        await removeQueued(item.id);
        handlers.onVoteSent?.(postId, optionIndex);
      }
    } catch (err) {
      await removeQueued(item.id);
      if (write.kind === 'post') handlers.onPostFailed?.(write.payload, err);
      else if (write.kind === 'reply') handlers.onReplyFailed?.(write.payload, err);
      else handlers.onVoteFailed?.(write.payload, err);
    }
  }
}
