# Security Hardening — Backlog

> **Dev note:** None of this is implemented yet intentionally. During active development and local testing, open auth, weak passwords, and permissive CORS keep things friction-free. Revisit before any public-facing deployment.

---

## What's already protected

- **Tailscale Funnel** — no open port to the internet; hub isn't directly reachable by IP
- **React JSX** — all `{variable}` rendering is HTML-escaped by default; no `dangerouslySetInnerHTML` in use
- **Parameterized queries** — all DB calls use `$1, $2` params; SQL injection is well-mitigated
- **Bearer token auth** — CSRF via `<form>` attacks can't include Authorization headers, so fixing CORS largely closes that door too
- **bcryptjs** — passwords hashed with proper cost factor

---

## Critical — fix before public deployment

### 1. Rate limit auth endpoints
**File:** `api/server.js`
**Risk:** Brute-force login, spam account creation

```bash
npm install express-rate-limit
```

```js
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  message: { error: 'Too many attempts — try again later' },
});

app.post('/api/auth/login',    authLimiter, ...);
app.post('/api/auth/register', authLimiter, ...);
```

---

### 2. Raise password minimum
**File:** `api/server.js` ~line 376
**Risk:** 4-char passwords are trivially brute-forced

```js
// Change:
if (password.length < 4) {
// To:
if (password.length < 10) {
```

Also enforce on the frontend registration form.

---

### 3. Logout endpoint + token invalidation
**File:** `api/server.js`
**Risk:** Tokens are valid forever — a stolen token = permanent hub access

```js
// Add route:
app.delete('/api/auth/session', authenticate, async (req, res) => {
  await pool.query('DELETE FROM hub_sessions WHERE token = $1', [req.token]);
  res.sendStatus(204);
});
```

Also call it from `hubService.leaveHub()` — currently only clears localStorage, not the server session.

---

### 4. File upload validation
**File:** `api/server.js` ~line 728
**Risk:** Users can upload executables, disguised files, or oversized payloads

```js
const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'application/pdf',
  'text/plain',
]);

const BLOCKED_EXTENSIONS = new Set(['.exe', '.bat', '.sh', '.ps1', '.cmd', '.msi', '.dmg']);

// Before inserting into DB:
if (!ALLOWED_MIME.has(req.file.mimetype)) {
  return res.status(400).json({ error: 'File type not allowed' });
}
const ext = path.extname(req.file.originalname).toLowerCase();
if (BLOCKED_EXTENSIONS.has(ext)) {
  return res.status(400).json({ error: 'File type not allowed' });
}
```

---

### 5. Block `javascript:` URLs in featured image_url
**File:** `api/server.js` — `POST /api/featured` handler
**Risk:** Admin sets `image_url: "javascript:..."` → XSS when carousel renders it

```js
// Add before INSERT:
if (image_url) {
  const parsed = new URL(image_url);  // throws on invalid URL
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'image_url must be http or https' });
  }
}
```

---

### 6. Restrict CORS origin
**File:** `api/server.js` ~line 66
**Risk:** `CORS_ORIGIN=*` allows any site to read API responses

The env var `CORS_ORIGIN` is already wired — it just defaults to `*` if unset.
Set it in `.env` for local dev and in production `.env`:

```env
# .env (local hub)
CORS_ORIGIN=http://localhost:5173

# production
CORS_ORIGIN=https://your-vercel-app.vercel.app
```

No code change needed — just set the env var.

---

### 7. Add security headers
**File:** `api/server.js` — add after CORS middleware
**Risk:** Clickjacking, MIME-type sniffing, referrer leakage

```js
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
```

---

## Medium — good to have

### 8. Token expiration
**File:** `api/server.js` — `hub_sessions` table
**Risk:** Issued tokens valid forever

Add a `created_at` column and reject tokens older than N days:

```sql
ALTER TABLE hub_sessions ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
```

```js
// In authenticate middleware, add:
if (new Date() - new Date(session.created_at) > 30 * 24 * 60 * 60 * 1000) {
  return res.status(401).json({ error: 'Session expired — please log in again' });
}
```

---

### 9. Input length limits
**File:** `api/server.js` — atlas pins, posts, featured
**Risk:** Storing huge strings → storage exhaustion DoS

```js
// Atlas pins:
if (title.length > 200) return res.status(400).json({ error: 'Title too long' });
if (description?.length > 1000) return res.status(400).json({ error: 'Description too long' });

// Posts (already has DB column limits, but add explicit check):
if (title.trim().length > 500) return res.status(400).json({ error: 'Title too long' });
```

---

### 10. Sanitize Content-Disposition filename
**File:** `api/server.js` ~line 784
**Risk:** Filenames with quotes/newlines can break HTTP headers

```js
// Replace:
res.setHeader('Content-Disposition', `inline; filename="${file.file_name}"`);
// With:
const safeName = file.file_name.replace(/[^\w.\-]/g, '_');
res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
```

---

## Won't fix / accepted risk

| Issue | Reason |
|---|---|
| Auth token in localStorage | Standard SPA pattern; acceptable with XSS prevention in place |
| WebSocket token in URL | Browser limitation — can't send custom headers over WS; Tailscale enforces HTTPS so log exposure is limited |
| Username enumeration on register | Minor UX vs security tradeoff; not worth confusing error messages |
| Race condition on post/reply delete | Causes a harmless 500 → the FK constraint fires, not a security issue |
| Public file enumeration | By design — public files are public |

---

## Deployment checklist

Before going live with real users:

- [ ] Rate limiting on `/api/auth/*`
- [ ] Password minimum raised to 10 chars
- [ ] Logout endpoint implemented and called by frontend
- [ ] File upload MIME/extension validation
- [ ] `javascript:` URL blocked in featured image_url
- [ ] `CORS_ORIGIN` set to actual frontend domain in hub `.env`
- [ ] Security headers added
- [ ] Token expiration implemented (30-day sessions)
- [ ] Input length limits on atlas + posts
