/**
 * Citinet E2E Encryption — WebCrypto Module
 *
 * Architecture:
 *   - ECDH P-256 key pair  : per-user identity key, used for future DM envelope encryption
 *   - AES-GCM-256 content key : per-user symmetric key, used for notes (and future files)
 *   - Private keys live ONLY in IndexedDB — never sent to server
 *   - Public ECDH key is uploaded to the hub so others can encrypt to this user
 *   - Passphrase backup: both keys encrypted under PBKDF2-derived key, stored server-side
 *
 * Encrypted content format (stored in body_plain):
 *   {"_citinet_enc":1,"ct":"<base64 AES-GCM ciphertext>","iv":"<base64 IV>"}
 *   body_rich = null when encrypted
 */

// ── IndexedDB helpers ─────────────────────────────────────

const DB_NAME    = 'citinet-keys';
const DB_VERSION = 1;
const STORE      = 'keys';

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror   = (e) => reject((e.target as IDBOpenDBRequest).error);
  });
}

async function idbGet(key: string): Promise<unknown> {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror   = () => { db.close(); reject(req.error); };
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
    req.onsuccess = () => { db.close(); resolve(); };
    req.onerror   = () => { db.close(); reject(req.error); };
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key);
    req.onsuccess = () => { db.close(); resolve(); };
    req.onerror   = () => { db.close(); reject(req.error); };
  });
}

// ── Encoding helpers ──────────────────────────────────────

function b64enc(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  return btoa(String.fromCharCode(...bytes));
}

/** Returns a `Uint8Array<ArrayBuffer>` suitable for WebCrypto APIs. */
function b64dec(str: string): Uint8Array<ArrayBuffer> {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encode a string to a `Uint8Array<ArrayBuffer>` for WebCrypto. */
function encode(s: string): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(s);
  // TextEncoder.encode() returns Uint8Array — copy into a concrete ArrayBuffer-backed one
  const result = new Uint8Array(bytes.length);
  result.set(bytes);
  return result;
}

// ── Slot keys (one set per hub, so multi-hub works) ───────

const slot = (hubSlug: string, name: string) => `${hubSlug}:${name}`;

// ── AES-GCM helpers ───────────────────────────────────────

async function aesEncrypt(key: CryptoKey, plaintext: string): Promise<{ ct: string; iv: string }> {
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encode(plaintext),
  );
  return { ct: b64enc(enc), iv: b64enc(iv) };
}

async function aesDecrypt(key: CryptoKey, ct: string, ivB64: string): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64dec(ivB64) },
    key,
    b64dec(ct),
  );
  return new TextDecoder().decode(plain);
}

// ── Key generation ────────────────────────────────────────

async function generateEcdhPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  );
}

async function generateContentKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

// ── Public API ────────────────────────────────────────────

/**
 * Generate a fresh ECDH key pair + AES content key for a new user.
 * Returns `publicKeyJwk` (JSON string) to upload to the server.
 */
export async function generateUserKeys(hubSlug: string): Promise<{ publicKeyJwk: string }> {
  const [ecdhPair, contentKey] = await Promise.all([generateEcdhPair(), generateContentKey()]);

  const [ecdhPrivJwk, ecdhPubJwk, contentJwk] = await Promise.all([
    crypto.subtle.exportKey('jwk', ecdhPair.privateKey),
    crypto.subtle.exportKey('jwk', ecdhPair.publicKey),
    crypto.subtle.exportKey('jwk', contentKey),
  ]);

  await Promise.all([
    idbSet(slot(hubSlug, 'ecdh_private'), ecdhPrivJwk),
    idbSet(slot(hubSlug, 'ecdh_public'),  ecdhPubJwk),
    idbSet(slot(hubSlug, 'content_key'),  contentJwk),
  ]);

  return { publicKeyJwk: JSON.stringify(ecdhPubJwk) };
}

/** Returns true if this device has keys stored for this hub. */
export async function hasKeys(hubSlug: string): Promise<boolean> {
  const k = await idbGet(slot(hubSlug, 'content_key'));
  return k != null;
}

/** Returns the stored public key JWK string for upload, or null if not found. */
export async function getStoredPublicKeyJwk(hubSlug: string): Promise<string | null> {
  const jwk = await idbGet(slot(hubSlug, 'ecdh_public')) as JsonWebKey | undefined;
  return jwk ? JSON.stringify(jwk) : null;
}

/** Load the AES content key from IndexedDB. Returns null if not found. */
export async function loadContentKey(hubSlug: string): Promise<CryptoKey | null> {
  const jwk = await idbGet(slot(hubSlug, 'content_key')) as JsonWebKey | undefined;
  if (!jwk) return null;
  return crypto.subtle.importKey('jwk', jwk, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

/** Returns the stored content-key JWK for this device/hub, or null if not found. */
export async function getStoredContentKeyJwk(hubSlug: string): Promise<JsonWebKey | null> {
  const jwk = await idbGet(slot(hubSlug, 'content_key')) as JsonWebKey | undefined;
  return jwk ?? null;
}

/**
 * Overwrite just the content key for this hub (leaves the ECDH identity key
 * untouched). Used when reconciling a device whose content key has diverged
 * from the account's canonical backup, without disrupting DM decryption
 * (which depends on the ECDH key) until that's reconciled separately.
 */
export async function setContentKey(hubSlug: string, jwk: JsonWebKey): Promise<void> {
  await idbSet(slot(hubSlug, 'content_key'), jwk);
}

/** Remove all keys for this hub from IndexedDB (on logout / account deletion). */
export async function clearKeys(hubSlug: string): Promise<void> {
  await Promise.all([
    idbDelete(slot(hubSlug, 'ecdh_private')),
    idbDelete(slot(hubSlug, 'ecdh_public')),
    idbDelete(slot(hubSlug, 'content_key')),
  ]);
}

// ── Note encryption ───────────────────────────────────────

/** Sentinel prefix that identifies an encrypted note body. */
const ENC_PREFIX = '{"_citinet_enc":1,';

/** True if body_plain contains an encrypted payload rather than real text. */
export function isNoteEncrypted(bodyPlain: string): boolean {
  return bodyPlain.startsWith(ENC_PREFIX);
}

/**
 * Encrypt note body content.
 * Returns new body_plain (JSON sentinel) and body_rich = null.
 * Falls back to returning original values if no content key is present.
 */
export async function encryptNoteBody(
  hubSlug: string,
  bodyRich: object | null,
  bodyPlain: string,
): Promise<{ body_plain: string; body_rich: null } | null> {
  try {
    const key = await loadContentKey(hubSlug);
    if (!key) return null;

    const payload = JSON.stringify({ rich: bodyRich, plain: bodyPlain });
    const { ct, iv } = await aesEncrypt(key, payload);
    return {
      body_plain: JSON.stringify({ _citinet_enc: 1, ct, iv }),
      body_rich: null,
    };
  } catch {
    return null;
  }
}

/**
 * Decrypt an encrypted note body.
 * Returns { body_rich, body_plain } with original content.
 * Returns null on failure (key missing / wrong device).
 */
export async function decryptNoteBody(
  hubSlug: string,
  bodyPlain: string,
): Promise<{ body_rich: object | null; body_plain: string } | null> {
  try {
    const key = await loadContentKey(hubSlug);
    if (!key) return null;

    const { ct, iv } = JSON.parse(bodyPlain) as { ct: string; iv: string };
    const plaintext = await aesDecrypt(key, ct, iv);
    const { rich, plain } = JSON.parse(plaintext) as { rich: object | null; plain: string };
    return { body_rich: rich, body_plain: plain };
  } catch {
    return null;
  }
}

// ── Message (DM) encryption ───────────────────────────────

/** Sentinel prefix that identifies an encrypted message body. */
const MSG_ENC_PREFIX = '{"_citinet_enc":1,';

/** True if message body contains an encrypted payload. */
export function isMessageEncrypted(body: string): boolean {
  return body.startsWith(MSG_ENC_PREFIX);
}

/**
 * Derive a shared AES-256-GCM key for a DM conversation.
 * Both parties independently derive the same key:
 *   ECDH(myPrivKey, theirPubKey) → raw bits → HKDF(conversationId) → AES-GCM key
 * Returns null if local private key or peer public key is unavailable.
 */
export async function deriveConversationKey(
  hubSlug: string,
  theirPublicKeyJwk: string,
  conversationId: string,
): Promise<CryptoKey | null> {
  try {
    const myPrivJwk = await idbGet(slot(hubSlug, 'ecdh_private')) as JsonWebKey | undefined;
    if (!myPrivJwk) return null;

    const myPrivKey = await crypto.subtle.importKey(
      'jwk', myPrivJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    );

    const theirPubKey = await crypto.subtle.importKey(
      'jwk', JSON.parse(theirPublicKeyJwk) as JsonWebKey,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    );

    // Derive 32 raw bytes from ECDH
    const sharedBits = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: theirPubKey },
      myPrivKey,
      256,
    );

    // HKDF to bind key to this conversation (prevents key reuse across convos)
    const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: encode(conversationId),
        info: encode('citinet-dm-v1'),
      },
      hkdfKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  } catch {
    return null;
  }
}

/**
 * Encrypt a DM message body with the derived conversation key.
 * Returns the encrypted sentinel string, or the original body on failure.
 */
export async function encryptMessage(
  hubSlug: string,
  theirPublicKeyJwk: string,
  conversationId: string,
  body: string,
): Promise<string> {
  try {
    const key = await deriveConversationKey(hubSlug, theirPublicKeyJwk, conversationId);
    if (!key) return body;
    const { ct, iv } = await aesEncrypt(key, body);
    return JSON.stringify({ _citinet_enc: 1, ct, iv });
  } catch {
    return body;
  }
}

/**
 * Decrypt an encrypted DM message body.
 * Returns decrypted text, or a placeholder string if key unavailable / decryption fails.
 */
export async function decryptMessage(
  hubSlug: string,
  theirPublicKeyJwk: string,
  conversationId: string,
  body: string,
): Promise<string> {
  try {
    if (!isMessageEncrypted(body)) return body;
    const key = await deriveConversationKey(hubSlug, theirPublicKeyJwk, conversationId);
    if (!key) return '[Encrypted — open on the device where you set up messages]';
    const { ct, iv } = JSON.parse(body) as { ct: string; iv: string };
    return await aesDecrypt(key, ct, iv);
  } catch {
    return '[Encrypted message]';
  }
}

// ── File encryption ───────────────────────────────────────

/** Marker prepended to an encrypted file stored in MinIO (as a Uint8Array header). */
const FILE_ENC_MAGIC = new Uint8Array([0xC1, 0x7E, 0xE7, 0x01]); // citinet-enc v1

/**
 * Encrypt a File/ArrayBuffer with the user's AES content key.
 * Wire format: [4-byte magic][12-byte IV][16-byte tag (embedded in GCM ct)][...ciphertext]
 * Returned as a Blob with the original MIME type (server stores opaque bytes).
 * Returns null if no content key available.
 */
export async function encryptFileBuffer(
  hubSlug: string,
  data: ArrayBuffer,
): Promise<ArrayBuffer | null> {
  try {
    const key = await loadContentKey(hubSlug);
    if (!key) return null;

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);

    // Concatenate: magic(4) + iv(12) + ciphertext
    const out = new Uint8Array(4 + 12 + ct.byteLength);
    out.set(FILE_ENC_MAGIC, 0);
    out.set(iv, 4);
    out.set(new Uint8Array(ct), 16);
    return out.buffer;
  } catch {
    return null;
  }
}

/**
 * Decrypt a file downloaded from the hub.
 * Returns the original ArrayBuffer, or null if not encrypted / decryption fails.
 */
export async function decryptFileBuffer(
  hubSlug: string,
  data: ArrayBuffer,
): Promise<ArrayBuffer | null> {
  try {
    const bytes = new Uint8Array(data);
    // Check magic header
    if (
      bytes.length < 4 + 12 + 16 ||
      bytes[0] !== FILE_ENC_MAGIC[0] ||
      bytes[1] !== FILE_ENC_MAGIC[1] ||
      bytes[2] !== FILE_ENC_MAGIC[2] ||
      bytes[3] !== FILE_ENC_MAGIC[3]
    ) {
      return null; // not encrypted
    }

    const key = await loadContentKey(hubSlug);
    if (!key) return null;

    const iv = bytes.slice(4, 16);
    const ct = bytes.slice(16);
    return await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  } catch {
    return null;
  }
}

/** True if a raw ArrayBuffer begins with the citinet file-encryption magic bytes. */
export function isFileEncrypted(data: ArrayBuffer): boolean {
  const bytes = new Uint8Array(data);
  return (
    bytes.length >= 4 &&
    bytes[0] === FILE_ENC_MAGIC[0] &&
    bytes[1] === FILE_ENC_MAGIC[1] &&
    bytes[2] === FILE_ENC_MAGIC[2] &&
    bytes[3] === FILE_ENC_MAGIC[3]
  );
}

// ── Passphrase backup ─────────────────────────────────────

async function deriveWrappingKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const mat = await crypto.subtle.importKey(
    'raw', encode(passphrase), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310_000, hash: 'SHA-256' },
    mat,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface KeyBackupPayload {
  encrypted_payload: string;
  salt: string;
  iv: string;
}

/**
 * Encrypt all keys for this hub under a passphrase.
 * Returns the encrypted bundle to POST to the server.
 * Returns null if keys don't exist in IndexedDB.
 */
export async function createKeyBackup(
  hubSlug: string,
  passphrase: string,
): Promise<KeyBackupPayload | null> {
  const [ecdhPrivJwk, contentJwk] = await Promise.all([
    idbGet(slot(hubSlug, 'ecdh_private')) as Promise<JsonWebKey | undefined>,
    idbGet(slot(hubSlug, 'content_key'))  as Promise<JsonWebKey | undefined>,
  ]);
  if (!ecdhPrivJwk || !contentJwk) return null;

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const wk   = await deriveWrappingKey(passphrase, salt);

  const bundle = encode(JSON.stringify({ ecdh_private: ecdhPrivJwk, content_key: contentJwk }));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wk, bundle);

  return { encrypted_payload: b64enc(ct), salt: b64enc(salt), iv: b64enc(iv) };
}

export interface BackedUpKeys {
  ecdh_private: JsonWebKey;
  content_key: JsonWebKey;
}

/**
 * Decrypt a server-stored backup with a passphrase, without touching IndexedDB.
 * Returns the raw key material, or null if the passphrase is wrong / backup is corrupt.
 * Used both by `restoreKeyBackup` (commit to this device) and by callers that
 * need to inspect/compare a backup before deciding whether to adopt it.
 */
export async function decryptKeyBackup(
  backup: KeyBackupPayload,
  passphrase: string,
): Promise<BackedUpKeys | null> {
  try {
    const salt = b64dec(backup.salt);
    const iv   = b64dec(backup.iv);
    const wk   = await deriveWrappingKey(passphrase, salt);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, wk, b64dec(backup.encrypted_payload));
    return JSON.parse(new TextDecoder().decode(plain)) as BackedUpKeys;
  } catch {
    return null;
  }
}

/**
 * Decrypt a server-stored backup with the user's passphrase and load keys into IndexedDB.
 * Returns true on success, false if passphrase is wrong or backup is corrupt.
 */
export async function restoreKeyBackup(
  hubSlug: string,
  backup: KeyBackupPayload,
  passphrase: string,
): Promise<boolean> {
  const keys = await decryptKeyBackup(backup, passphrase);
  if (!keys) return false;
  await Promise.all([
    idbSet(slot(hubSlug, 'ecdh_private'), keys.ecdh_private),
    idbSet(slot(hubSlug, 'content_key'),  keys.content_key),
  ]);
  return true;
}
