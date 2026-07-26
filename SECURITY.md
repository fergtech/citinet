# Security Model — Citinet Hub

> Last updated: 2026-07-26. Rewritten after a full audit of `api/server.js` against
> this file's previous claims — several were stale or simply wrong (see "Corrections"
> below). Reflects what is actually implemented, verified by reading the code, not by
> reading commit messages.

---

## Architecture note

The web app (citinet.cloud) is served from Vercel — **not** from the hub. The hub admin controls the API server and database, but never the JavaScript users execute in their browsers. This separation is what makes client-side encryption meaningful: the hub admin cannot modify the code that encrypts/decrypts data.

---

## Corrections from the previous version of this doc

- **"Redis session hijacking" was describing a mechanism that doesn't exist.**
  Sessions are stored in Postgres (`hub_sessions` table), not Redis. `api/server.js`
  has zero Redis references and `api/package.json` has no Redis client dependency —
  the `citinet-redis` container in `docker-compose.yml` is provisioned but **unused**.
  The equivalent risk (see below) is DB access to `hub_sessions`, not `redis-cli KEYS *`.
- **`CORS_ORIGIN` does nothing.** `docker-compose.yml` passes it to the container and
  the old checklist told operators to set it, but `server.js` hardcodes
  `Access-Control-Allow-Origin: *` and never reads `process.env.CORS_ORIGIN`. This is
  not a vulnerability by itself (see CORS reasoning below), but the env var is dead —
  changing it has no effect, and the doc previously implied otherwise.
- **The prior "hardening implemented" commit was never merged.** A commit titled
  "security: implement all SECURITY.md hardening items" exists only on the abandoned
  remote branch `origin/copilot/full-security-audit` and was never part of `master`.
  Some of the same items were later implemented independently (rate limiting, helmet
  headers, session expiration) via a different, unrelated commit. Others were not
  implemented at all until the 2026-07-26 pass described below.

---

## What is genuinely protected (implemented, verified in code)

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

### Upload and file-serving safety (added 2026-07-26)
- **Upload-time extension blocklist** — `BLOCKED_UPLOAD_EXTENSIONS` rejects classic
  executable/script extensions (`.exe`, `.bat`, `.sh`, `.ps1`, `.cmd`, `.msi`, `.dmg`,
  `.scr`, `.com`, `.vbs`, `.js`, `.jar`, `.jse`, `.wsf`) via `multerFileFilter` (both
  multer instances) and an equivalent check in the busboy-based `/api/files` upload path.
- **Serve-time content-type enforcement** — `getSafeInlineContentType()` only allows
  `image/*`, `video/*`, `audio/*`, and `application/pdf` to be served with an `inline`
  disposition. Every other declared MIME type — including a spoofed or
  attacker-controlled one — is forced to `application/octet-stream` + `attachment`,
  applied uniformly across all 5 file-serving routes (`/api/files/:filename`, its
  download-token variant, `/api/public/files/:filename`, and both space-file routes).
  This closes the stored-XSS path that existed when an uploaded HTML/SVG file could be
  rendered inline in the hub's own origin.
- **Content-Disposition filename sanitization** — `sanitizeFilename()`
  (`path.basename` + character whitelist) applied everywhere a stored filename is
  interpolated into a response header.

### Auth hardening
- Rate limiting: `authLimiter` (10 req/15min on `/api/auth/login` and
  `/api/auth/register`), `apiLimiter` (300 req/min general), `aiLimiter` (20 req/min on
  AI endpoints).
- Passwords hashed with `bcryptjs` (cost factor 10).
- **Consistent password minimum** — both `/api/auth/register` and
  `/api/auth/change-password` enforce a shared `MIN_PASSWORD_LENGTH = 8` constant (as of
  2026-07-26; previously change-password only required 4, allowing a downgrade below
  the registration policy).
- Sessions (`hub_sessions` table) carry a 30-day sliding expiration (`expires_at`,
  refreshed on each authenticated request) and are purged server-side every 6 hours.
- `POST /api/auth/logout` deletes the session token server-side (not just a client-side
  `localStorage` clear).
- Bearer token auth — no cookies, so CSRF via `<form>` submission cannot include the
  Authorization header.

### Join approval (added 2026-07-26)
Registration is no longer instant-access. `hub_users.status` (`approved` /
`pending` / `rejected`) gates every protected route via `authenticate()` —
a newly registered account gets a working session token, but every API call
it makes is rejected with 403 until a hub admin approves it via the new
Members-tab queue (`GET/POST /api/admin/pending-users/...`). The hub's
founding admin (first registration ever) is auto-approved, since there's no
one else yet to approve them. This is the direct mitigation for the
"any stranger who joins the Wi-Fi instantly gets a working account" scenario
raised when extending physical/wireless hub reach — see
[`hub-wireless-reach-standard.md`](docs/hub-wireless-reach-standard.md).

### `/api/featured` image_url validation (added 2026-07-26)
`isSafeMediaUrl()` rejects any `image_url` that isn't an `http:`/`https:` URL, applied
to both the create (`POST`) and edit (`PATCH`) routes — blocks `javascript:`/`data:`
payloads from an admin/moderator account (or one that's been compromised).

### Infrastructure hardening
- `trust proxy` enabled for correct IP forwarding behind Tailscale/reverse proxy.
- Security headers via `helmet()` (CSP left off deliberately — see below; CORP/COEP
  relaxed to allow cross-origin `<img>` loads for avatars/banners).
- All DB calls use parameterized queries (`$1, $2`) — SQL injection mitigated.
- React `{variable}` rendering HTML-escapes all output by default.
- CORS is intentionally wildcard (`Access-Control-Allow-Origin: *`) on every route.
  This is safe specifically because auth is Bearer-token-only with no cookies — a
  malicious site making a cross-origin request can't attach a stolen session
  automatically, and reading the response requires already knowing a valid token. Do
  not "fix" this by restricting `Access-Control-Allow-Origin` without also reconsidering
  the auth model; it isn't currently a gap.

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

### Session token access via direct DB access
Sessions live in Postgres (`hub_sessions`), not Redis (see "Corrections" above). A hub
admin with DB access can read a valid session token and impersonate that user via the
API. They still cannot decrypt E2E content (keys never reach the server), but they can
post, delete files, and send messages as that user. The 30-day sliding expiration and
logout endpoint reduce the window somewhat but don't eliminate this — it's inherent to
bearer tokens stored server-side without additional binding.

**Mitigation pending:** binding sessions to user-agent/IP would raise the bar further,
but hasn't been implemented. Not urgent given the threat already requires DB/Docker
access, which implies broader compromise anyway.

### What Docker access gives a hub admin (realistic threat model)

| Container | What admin can access |
|---|---|
| `citinet-db` | All plaintext data (posts, file names, user metadata, session tokens); ciphertext for messages/notes/files |
| `citinet-storage` | UUID-named encrypted blobs — unreadable without user key |
| `citinet-redis` | Provisioned but unused by the API — nothing of value here currently |
| `citinet-api` | Source code (already public on GitHub); cannot intercept E2E data |

---

## Remaining backlog

### Good to have — no longer critical, but still open

#### 1. Encrypt file names client-side before DB storage
The last plaintext metadata gap: `hub_files.file_name` is visible to anyone with DB
access. Encrypting it client-side before upload (and decrypting in the file listing)
would close this gap fully. Impacts search and file references in posts/messages.

#### 2. Input length limits
**Risk:** storage exhaustion / abuse via unbounded fields (e.g. atlas pin title/description, post title have no server-side length cap).
```js
if (title.length > 200) return res.status(400).json({ error: 'Title too long' });
if (description?.length > 1000) return res.status(400).json({ error: 'Description too long' });
```

#### 3. Session/user-agent binding
See "Session token access via direct DB access" above.

#### 4. Raise password minimum from 8 to 10
Current minimum (8, consistent across register/change-password as of 2026-07-26) is
reasonable but the original hardening goal was 10. Low priority — no known active risk
at 8.

#### 5. Resolve the unused Redis container
Either wire `citinet-redis` into actual use (e.g. session cache, rate-limit store
shared across multiple API replicas) or remove it from `docker-compose.yml` to reduce
attack surface and stop the doc/deployment drift that caused the "Redis session
hijacking" confusion in the first place.

---

## Accepted trade-offs

| Issue | Reason |
|---|---|
| Auth token in `localStorage` | Standard SPA pattern; XSS prevention is now actually in place for uploaded content (see "Upload and file-serving safety" above), which is what makes this trade-off acceptable rather than aspirational |
| Conversation existence visible in DB | Unavoidable without zero-knowledge architecture; content is still protected |
| File sizes and timestamps visible | Metadata leakage is a known limitation of E2E systems (Signal has the same trade-off) |
| Username enumeration on register | Minor UX vs security trade-off |
| Hub admin sees member list | Inherent to the model — you're joining someone's community hub |
| Public file enumeration | By design — public files are public |
| CORS wildcard on all routes | Safe under the Bearer-token-only auth model — see "Infrastructure hardening" above |

---

## Deployment checklist

- [x] Rate limiting on `/api/auth/*`
- [x] Password minimum consistent across register and change-password (8 characters)
- [x] Logout endpoint implemented (`POST /api/auth/logout`) and called from `leaveHub()`
- [x] File upload extension blocklist + serve-time content-type/disposition enforcement
- [x] `javascript:` URL blocked in featured `image_url` (create and edit)
- [x] Content-Disposition filenames sanitized
- [x] Token expiration (30-day sliding sessions) + periodic purge
- [x] Join approval — new accounts are `pending` until a hub admin approves them (founding admin auto-approved)
- [ ] `CORS_ORIGIN` env var is currently inert — either wire it up or remove it from `.env.example`/`docker-compose.yml` to stop implying it does something
- [ ] Resolve unused `citinet-redis` container (wire up or remove)
- [ ] Input length limits on posts, pins, descriptions
- [ ] Session binding to user-agent/IP (optional hardening)
- [ ] Encrypt file names client-side (closes last plaintext metadata gap)

**Note:** none of the 2026-07-26 code fixes take effect on a running hub until the
Docker image (`ghcr.io/fergtech/citinet-api:latest`) is rebuilt, pushed, and the
container recreated — see the hub stack docs for the rebuild workflow.
