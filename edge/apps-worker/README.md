# Citinet apps edge (`<app>.citinet.io`)

A Cloudflare Worker that gives every hosted app a public address on `citinet.io`. It proxies
`https://<app>.citinet.io/*` to `/apps/<app>/*` on the hub that owns the app and caches static files
at the edge, so an app keeps loading for a while if its hub goes offline.

It holds no app files and no user data — only the KV map `app:<name>` → `{ hub, origin }`, written by the
cert broker when a hub admin publishes an app (see `api/cert-broker.js`, ops `sync-app` / `release-app`).

## One-time setup (needs the Cloudflare account that owns citinet.io)

1. **KV namespace** — `npx wrangler kv namespace create APPS`, put the returned id into `wrangler.toml`.
2. **Deploy** — `npx wrangler deploy` from this folder (`npx wrangler login` first).
3. **Wildcard DNS** — in the citinet.io zone add `*` as an **AAAA** record → `100::`, **Proxied** (orange cloud).
   Existing records (MX/SPF for Email Routing, Resend's DKIM, `www`, the apex redirect) are more specific, so
   they keep winning over the wildcard. Leave mail records DNS-only.
4. **Broker env on Vercel** (the project that serves `citinet.cloud/api/cert-broker`):
   - `CF_ACCOUNT_ID` — the Cloudflare account id
   - `CF_KV_NAMESPACE_ID` — the id from step 1
   - `CF_KV_API_TOKEN` — an API token with **Workers KV Storage: Edit** (account scope). The existing
     DNS-only `CF_API_TOKEN` can't write KV; if you'd rather widen it, leave `CF_KV_API_TOKEN` unset.
5. Redeploy the portal so the broker change is live.

After that, publishing an app on a hub whose `.env` has `HUB_SLUG`, `HUB_CERT_SECRET` and a public `TUNNEL_URL`
claims `<app>.citinet.io` automatically.

## Notes

- Free-plan Universal SSL covers `*.citinet.io` (one label deep), which is why app names are single labels.
- Only `GET`/`HEAD` are proxied; hosted apps are static.
- `Set-Cookie` and CORS headers from the hub are stripped, so a hosted app can't plant cookies or poke the
  hub through this host. Apps live on their own origin, separate from the hub UI.
- Tests: `node --test edge/apps-worker/worker.test.mjs`
