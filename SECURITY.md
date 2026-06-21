# Security Model — Citinet Hub

> Last updated: 2026-06-20. Reflects what is actually implemented, known gaps, and remaining backlog.

---

## Architecture note

The web app (citinet.cloud) is served from Vercel — **not** from the hub. The hub admin controls the API server and database, but never the JavaScript users execute in their browsers. This separation is what makes client-side encryption meaningful: the hub admin cannot modify the code that encrypts/decrypts data.

---

## What is genuinely protected (implemented)

### End-to-end encryption — client-side AES-GCM + ECDH
**Files:** `src/app/utils/crypto.ts`, `api/server.js`

| Data | Protection |
|---|---|
| Direct messages | ECDH P-256 per-conversation key, encrypted in browser before send |
| Notes | AES-GCM encrypted in browser; server stores `{"_citinet_enc":1,"ct":"..."}` |
| File content | AES-GCM encrypted in browser before upload; server/MinIO receives ciphertext only |
| Private keys | Never leave the browser (IndexedDB only) |
| Key backups | PBKDF2-encrypted with user passphrase before reaching server; server never sees plaintext key |

Even with full database or storage access, a hub admin cannot read encrypted content without the user's browser-side key.

### File storage obfuscation
MinIO object keys use `{userId}/{uuid}` — original filenames never appear in the storage layer. The filename→key mapping exists only in Postgres (`hub_files.file_name`).

### Infrastructure hardening
- `trust proxy` enabled for correct IP forwarding behind Tailscale/reverse proxy
- `helmet` CORP headers set
- CORS configured per `CORS_ORIGIN` env var
- All DB calls use parameterized queries (`$1, $2`) — SQL injection mitigated
- Passwords hashed with `bcryptjs` (not reversible from DB access)
- Bearer token auth — CSRF via `<form>` attacks cannot include Authorization headers
- React `{variable}` rendering HTML-escapes all output by default

---

## What is NOT protected — known gaps, by design or pending

### Metadata visible to hub admin via direct DB access

| Data | Status |
|---|---|
| Usernames, emails, display names | Plaintext in `hub_users` — hub admin knows who joined |
| Feed posts, polls, mod log | Plaintext — public community content by design |
| File names | Plaintext in `hub_files.file_name` — DB query reveals original names even though MinIO keys are UUIDs |
| Conversation metadata | Who is messaging whom, and when — content encrypted but existence is not |
| Message/file timestamps and sizes | Visible in DB and storage; can be used to correlate activity |

### Redis session hijacking risk
`citinet-redis` stores active session tokens. A hub admin with Docker access can:
```
docker exec -it citinet-redis redis-cli KEYS *
```
Extract a valid token and impersonate that user via the API. They still cannot decrypt E2E content (keys never reach the server), but they can post, delete files, and send messages as that user.

**Mitigation pending:** Short session TTLs, session binding to user-agent/IP.

### What Docker access gives a hub admin (realistic threat model)

| Container | What admin can access |
|---|---|
| `citinet-db` | All plaintext data (posts, file names, user metadata); ciphertext for messages/notes/files |
| `citinet-storage` | UUID-named encrypted blobs — unreadable without user key |
| `citinet-redis` | Active session tokens — impersonation risk |
| `citinet-api` | Source code (already public on GitHub); cannot intercept E2E data |

---

## Remaining backlog

### Critical — fix before broad public deployment

#### 1. Rate limit auth endpoints
**Risk:** Brute-force login, spam account creation

```js
const rateLimit = require('express-rate-limit');
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
app.post('/api/auth/login',    authLimiter, ...);
app.post('/api/auth/register', authLimiter, ...);
```

#### 2. Raise password minimum
**File:** `api/server.js`
**Risk:** 4-char passwords are trivially brute-forced offline from bcrypt hashes

Change minimum from 4 to 10 characters. Enforce on frontend registration form too.

#### 3. Logout endpoint + server-side token invalidation
**Risk:** Tokens are long-lived; stolen token = persistent hub access. `leaveHub()` currently only clears localStorage.

```js
app.delete('/api/auth/session', authenticate, async (req, res) => {
  await pool.query('DELETE FROM hub_sessions WHERE token = $1', [req.token]);
  res.sendStatus(204);
});
```

#### 4. Short Redis session TTLs
**Risk:** Active tokens in Redis can be hijacked by hub admin (see above).
Set TTL on session keys so stolen tokens expire quickly.

#### 5. File upload MIME/extension validation
**Risk:** Executable files uploaded and later downloaded by other members

```js
const BLOCKED_EXTENSIONS = new Set(['.exe', '.bat', '.sh', '.ps1', '.cmd', '.msi', '.dmg']);
```

#### 6. Block `javascript:` URLs in featured image_url
**File:** `api/server.js` — `POST /api/featured`
**Risk:** XSS if admin sets `image_url: "javascript:..."`

```js
const parsed = new URL(image_url);
if (!['http:', 'https:'].includes(parsed.protocol)) {
  return res.status(400).json({ error: 'image_url must be http or https' });
}
```

### Medium — good to have

#### 7. Token expiration (30-day sessions)
**File:** `api/server.js` — `hub_sessions` table already has `created_at`

```js
if (new Date() - new Date(session.created_at) > 30 * 24 * 60 * 60 * 1000) {
  return res.status(401).json({ error: 'Session expired — please log in again' });
}
```

#### 8. Encrypt file names client-side before DB storage
The last plaintext metadata gap: `hub_files.file_name` is visible to anyone with DB access. Encrypting it client-side before upload (and decrypting in the file listing) would close this gap fully. Impacts search and file references in posts/messages.

#### 9. Input length limits
**Risk:** Storage exhaustion DoS

```js
if (title.length > 200) return res.status(400).json({ error: 'Title too long' });
if (description?.length > 1000) return res.status(400).json({ error: 'Description too long' });
```

#### 10. Content-Disposition filename sanitization
**Risk:** Filenames with quotes/newlines can break HTTP headers

```js
const safeName = file.file_name.replace(/[^\w.\-]/g, '_');
res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
```

---

## Accepted trade-offs

| Issue | Reason |
|---|---|
| Auth token in localStorage | Standard SPA pattern; acceptable with XSS prevention in place |
| Conversation existence visible in DB | Unavoidable without zero-knowledge architecture; content is still protected |
| File sizes and timestamps visible | Metadata leakage is a known limitation of E2E systems (Signal has the same trade-off) |
| Username enumeration on register | Minor UX vs security trade-off |
| Hub admin sees member list | Inherent to the model — you're joining someone's community hub |
| Public file enumeration | By design — public files are public |

---

## Deployment checklist

- [ ] Rate limiting on `/api/auth/*`
- [ ] Password minimum raised to 10 characters (frontend + backend)
- [ ] Logout endpoint implemented and called on `leaveHub()`
- [ ] File upload MIME/extension validation
- [ ] `javascript:` URL blocked in featured `image_url`
- [ ] `CORS_ORIGIN` set to actual frontend domain in hub `.env`
- [ ] Token expiration (30-day sessions)
- [ ] Redis session TTLs configured
- [ ] Input length limits on posts, pins, descriptions
- [ ] Content-Disposition filename sanitization
