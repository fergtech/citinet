/**
 * Encrypted container for a portable Citinet account package.
 *
 * A package holds a member's decrypted data and their encryption keys, then
 * sits as an ordinary file in Downloads, a USB stick or cloud storage — so it is
 * encrypted at rest under a secret only the member knows (their recovery phrase,
 * or a package password they choose). Pure functions over Blobs and WebCrypto:
 * no IndexedDB, no network, no app state, which is also what makes it testable.
 *
 * File layout
 *   8 bytes   magic "CNTPKG01"
 *   4 bytes   header length N (big-endian)
 *   N bytes   header JSON (UTF-8) — public metadata + KDF parameters, never secret
 *   repeated  [4 bytes ciphertext length][ciphertext + 16-byte GCM tag]
 *
 * Crypto
 *   key   = Argon2id(secret, salt, m=64 MiB, t=3, p=1)  -> AES-256-GCM key
 *   chunk = plaintext sliced into CHUNK_BYTES pieces (so multi-GB packages never
 *           need one giant WebCrypto call), each sealed separately with
 *           iv  = noncePrefix(8 random bytes) || chunkIndex(4, big-endian)
 *           aad = headerBytes || isLast(1) || chunkIndex(4)
 *   The header is bound into every chunk's AAD (tampering with KDF params or
 *   metadata fails decryption), the index stops reordering, and the isLast flag
 *   stops silent truncation: a stream that ends without a "last" chunk is
 *   rejected.
 */

const MAGIC = new TextEncoder().encode('CNTPKG01');
const CHUNK_BYTES = 4 * 1024 * 1024;
const VERSION = 1;

// Stronger than the 19 MiB used for server-side key backups: this file leaves the
// hub's custody, so an attacker with a copy can attack it offline at leisure.
const KDF = { alg: 'argon2id', memorySize: 65_536, iterations: 3, parallelism: 1 } as const;
// Upper bounds accepted when OPENING a file, so a hostile file can't ask for
// gigabytes of memory or hours of hashing.
const MAX_KDF = { memorySize: 262_144, iterations: 10, parallelism: 4 };
const MAX_HEADER_BYTES = 16 * 1024;

export type SecretKind = 'recovery-phrase' | 'password';

export interface ContainerMeta {
  /** How the secret was produced — tells the importer which prompt to show. */
  hint: SecretKind;
  createdAt: string;
  /** Display only (the source hub's name); not trusted for anything. */
  hubName?: string;
}

interface Header extends ContainerMeta {
  v: number;
  kdf: { alg: 'argon2id'; salt: string; memorySize: number; iterations: number; parallelism: number };
  noncePrefix: string;
  chunkBytes: number;
}

export class WrongSecretError extends Error {
  constructor() {
    super('That recovery phrase / password does not unlock this file (or the file is damaged).');
    this.name = 'WrongSecretError';
  }
}
export class CorruptContainerError extends Error {
  constructor(detail: string) {
    super(`This file is damaged or incomplete (${detail}).`);
    this.name = 'CorruptContainerError';
  }
}
export class NotAContainerError extends Error {
  constructor() {
    super('This is not a Citinet account package.');
    this.name = 'NotAContainerError';
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const u32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const readU32 = (b: Uint8Array, o = 0) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

async function readBytes(blob: Blob, start: number, end: number): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

/** Phrases are typed by hand ("Apple-Tree  river"); passwords are taken exactly. */
export function normalizeSecret(secret: string, kind: SecretKind): string {
  const s = secret.normalize('NFKC');
  return kind === 'recovery-phrase' ? s.trim().toLowerCase().replace(/[\s_]+/g, '-') : s;
}

async function deriveKey(secret: string, salt: Uint8Array, p: { memorySize: number; iterations: number; parallelism: number }): Promise<CryptoKey> {
  const { argon2id } = await import('hash-wasm');
  const raw = await argon2id({
    password: secret,
    salt,
    memorySize: p.memorySize,
    iterations: p.iterations,
    parallelism: p.parallelism,
    hashLength: 32,
    outputType: 'binary',
  });
  const keyBytes = new Uint8Array(raw.length);
  keyBytes.set(raw);
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function chunkIv(prefix: Uint8Array, index: number): Uint8Array<ArrayBuffer> {
  const iv = new Uint8Array(12);
  iv.set(prefix, 0);
  iv.set(u32(index), 8);
  return iv;
}

function chunkAad(headerBytes: Uint8Array, isLast: boolean, index: number): Uint8Array<ArrayBuffer> {
  const aad = new Uint8Array(headerBytes.length + 5);
  aad.set(headerBytes, 0);
  aad[headerBytes.length] = isLast ? 1 : 0;
  aad.set(u32(index), headerBytes.length + 1);
  return aad;
}

// ── seal ─────────────────────────────────────────────────────────────────────

/** Encrypt `plain` (a zip) into a container Blob. */
export async function sealContainer(
  plain: Blob,
  secret: string,
  meta: ContainerMeta,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  if (!normalizeSecret(secret, meta.hint).trim()) throw new Error('Enter a recovery phrase or password to protect the package.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const noncePrefix = crypto.getRandomValues(new Uint8Array(8));
  const header: Header = {
    v: VERSION,
    ...meta,
    kdf: { alg: KDF.alg, salt: b64(salt), memorySize: KDF.memorySize, iterations: KDF.iterations, parallelism: KDF.parallelism },
    noncePrefix: b64(noncePrefix),
    chunkBytes: CHUNK_BYTES,
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const key = await deriveKey(normalizeSecret(secret, meta.hint), salt, header.kdf);

  const parts: BlobPart[] = [MAGIC, u32(headerBytes.length), headerBytes];
  const total = plain.size;
  const chunkCount = Math.max(1, Math.ceil(total / CHUNK_BYTES)); // an empty plaintext still gets one (last) chunk
  for (let i = 0; i < chunkCount; i++) {
    const start = i * CHUNK_BYTES;
    const data = await readBytes(plain, start, Math.min(total, start + CHUNK_BYTES));
    const ct = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: chunkIv(noncePrefix, i), additionalData: chunkAad(headerBytes, i === chunkCount - 1, i) },
        key,
        data,
      ),
    );
    parts.push(u32(ct.length), ct);
    onProgress?.((i + 1) / chunkCount);
  }
  return new Blob(parts, { type: 'application/octet-stream' });
}

// ── open ─────────────────────────────────────────────────────────────────────

async function parseHeader(file: Blob): Promise<{ header: Header; headerBytes: Uint8Array; bodyStart: number }> {
  if (file.size < MAGIC.length + 4) throw new NotAContainerError();
  const magic = await readBytes(file, 0, MAGIC.length);
  if (!MAGIC.every((b, i) => magic[i] === b)) throw new NotAContainerError();
  const len = readU32(await readBytes(file, MAGIC.length, MAGIC.length + 4));
  if (len < 2 || len > MAX_HEADER_BYTES || MAGIC.length + 4 + len > file.size) throw new CorruptContainerError('bad header');
  const headerBytes = await readBytes(file, MAGIC.length + 4, MAGIC.length + 4 + len);
  let header: Header;
  try {
    header = JSON.parse(new TextDecoder().decode(headerBytes)) as Header;
  } catch {
    throw new CorruptContainerError('unreadable header');
  }
  if (header.v !== VERSION) throw new CorruptContainerError(`unsupported version ${header.v} — update Citinet`);
  const k = header.kdf;
  if (
    !k || k.alg !== 'argon2id' ||
    !Number.isInteger(k.memorySize) || k.memorySize < 8 || k.memorySize > MAX_KDF.memorySize ||
    !Number.isInteger(k.iterations) || k.iterations < 1 || k.iterations > MAX_KDF.iterations ||
    !Number.isInteger(k.parallelism) || k.parallelism < 1 || k.parallelism > MAX_KDF.parallelism ||
    typeof k.salt !== 'string' || typeof header.noncePrefix !== 'string' ||
    !Number.isInteger(header.chunkBytes) || header.chunkBytes < 1024 || header.chunkBytes > 64 * 1024 * 1024
  ) {
    throw new CorruptContainerError('invalid parameters');
  }
  return { header, headerBytes, bodyStart: MAGIC.length + 4 + len };
}

/** Read the public header without a secret (to show "from <hub>, made <date>" and pick the right prompt). */
export async function peekContainer(file: Blob): Promise<ContainerMeta> {
  const { header } = await parseHeader(file);
  return { hint: header.hint === 'password' ? 'password' : 'recovery-phrase', createdAt: header.createdAt, hubName: header.hubName };
}

/**
 * Decrypt a container, handing each plaintext chunk to `onChunk` in order (so the
 * caller can stream it into an unzipper instead of holding the whole thing).
 * Throws WrongSecretError if the very first chunk fails to authenticate;
 * CorruptContainerError for damage or truncation after that.
 */
export async function openContainer(
  file: Blob,
  secret: string,
  onChunk: (chunk: Uint8Array, isLast: boolean) => void | Promise<void>,
  onProgress?: (fraction: number) => void,
): Promise<ContainerMeta> {
  const { header, headerBytes, bodyStart } = await parseHeader(file);
  const kind: SecretKind = header.hint === 'password' ? 'password' : 'recovery-phrase';
  if (!normalizeSecret(secret, kind).trim()) throw new WrongSecretError();
  const salt = unb64(header.kdf.salt);
  const noncePrefix = unb64(header.noncePrefix);
  if (noncePrefix.length !== 8) throw new CorruptContainerError('invalid nonce');
  const key = await deriveKey(normalizeSecret(secret, header.hint === 'password' ? 'password' : 'recovery-phrase'), salt, header.kdf);

  // Largest ciphertext a well-formed chunk can have; anything bigger is damage.
  const maxCt = header.chunkBytes + 16;
  let offset = bodyStart;
  let index = 0;
  let sawLast = false;
  while (offset < file.size) {
    if (offset + 4 > file.size) throw new CorruptContainerError('cut off');
    const ctLen = readU32(await readBytes(file, offset, offset + 4));
    offset += 4;
    if (ctLen < 16 || ctLen > maxCt || offset + ctLen > file.size) throw new CorruptContainerError('cut off');
    const ct = await readBytes(file, offset, offset + ctLen);
    offset += ctLen;
    const isLast = offset >= file.size;

    let plain: Uint8Array;
    try {
      plain = new Uint8Array(
        await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: chunkIv(noncePrefix, index), additionalData: chunkAad(headerBytes, isLast, index) },
          key,
          ct,
        ),
      );
    } catch {
      if (index === 0) throw new WrongSecretError(); // can't tell wrong secret from damage on chunk 0; wrong secret is far likelier
      throw new CorruptContainerError('a section failed its integrity check');
    }
    sawLast = isLast;
    await onChunk(plain, isLast);
    onProgress?.(Math.min(1, offset / file.size));
    index++;
  }
  // A stream that ends on a chunk sealed as "not last" was truncated — decrypting
  // that chunk with isLast=true in its AAD would already have failed above, but an
  // empty body (header only) lands here.
  if (!sawLast) throw new CorruptContainerError('no data');
  return { hint: header.hint === 'password' ? 'password' : 'recovery-phrase', createdAt: header.createdAt, hubName: header.hubName };
}
