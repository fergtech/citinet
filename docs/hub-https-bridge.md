# Hub HTTPS (automatic)

Every hub gets a real, browser-trusted HTTPS certificate for
`<hubslug>.hub.citinet.cloud` automatically — no domain to buy, no
Cloudflare account, no token to paste anywhere. This is what makes Web
Crypto (`crypto.subtle`, required for E2E notes/message/file encryption)
work for guests connecting over Wi-Fi, including guests reached through a
dedicated access point (see
[`hub-wireless-reach-standard.md`](./hub-wireless-reach-standard.md)).

There is nothing for a hub admin to configure. This doc exists for anyone
curious how it works under the hood.

## How it works

1. When you create a hub, the wizard checks your chosen hub name against
   the central cert broker and claims it, receiving a one-time secret. That
   secret is written to the hub's `.env` as `HUB_CERT_SECRET` — the same way
   `DB_PASSWORD`/`JWT_SECRET` are generated once and stored, never a value
   you type yourself.
2. On startup, and once a day after that, the hub's API container checks its
   local certificate's expiry. If it's missing or within 30 days of expiring,
   it calls the broker (`POST /api/cert-broker` with `{ op: 'issue', slug,
   secret, lanIp }`), proving ownership of its slug via the secret.
3. The broker (a centralized Vercel service, using its own dedicated
   Cloudflare credentials — never distributed to any hub) runs a Let's
   Encrypt ACME DNS-01 challenge for `<slug>.hub.citinet.cloud`, upserts a
   DNS **A record** pointing that hostname at the hub's own LAN IP, and
   returns the certificate and key. It never stores either.
4. The hub writes the cert/key to a shared volume and reloads Caddy (a
   stock `caddy:2` image — no custom Cloudflare-plugin build needed) via
   Caddy's local admin API.

Certificate *issuance* and certificate *use* are different moments: DNS-01
only proves control of a domain's DNS records, not that the server is
reachable from the internet, so issuance/renewal can happen whenever the hub
has internet access, while a device that's already on the hub's LAN can use
the resulting certificate with no connectivity at all.

## Why `<slug>.hub.citinet.cloud → LAN IP` also solves plain local access

Because the A record points at the hub's actual private LAN IP, anyone
already on that same LAN — with completely ordinary internet access, e.g.
cellular data, no hosts-file edits, no AP/hotspot involved — can just type
`https://<slug>.hub.citinet.cloud` and connect. Public DNS resolves the
name; the private IP it resolves to simply isn't routable from outside that
LAN, so this never leaks reachability beyond the LAN it's issued for.

The dedicated access point described in
[`hub-wireless-reach-standard.md`](./hub-wireless-reach-standard.md) solves
a narrower, rarer case: a guest with **zero internet of their own**, who
can't even perform a DNS lookup. That mechanism still uses this same
certificate — it just adds its own local DNS override so a guest device can
resolve the hostname without any internet at all.

## Renewal

Handled entirely by the hub's own cert agent (`api/certAgent.js`) — checked
daily, only actually renews within 30 days of expiry, so routine checks
don't churn Let's Encrypt's rate limits. No cron job or manual step needed,
as long as the hub has internet access at some point during that window.

## Verify it worked

From a device that is **not** the hub machine, on the same LAN, with
ordinary internet access and no special setup:

```bash
curl -vI https://<hubslug>.hub.citinet.cloud
```

Look for a certificate chain issued by Let's Encrypt (`R3`/`E1`/etc.), not a
self-signed one. In an actual browser, confirm there's no security warning
at all, and open DevTools console to check:

```js
window.isSecureContext   // true
typeof crypto.subtle     // "object"
```

That's the real pass/fail signal — a padlock icon alone isn't proof; the
absence of a warning combined with `crypto.subtle` actually being defined is.
