# Citinet Infrastructure Overview

This document describes the full infrastructure landscape for the Citinet project — how each component is hosted, how they connect, and what role this repo plays.

---

## Components

### 1. Info Site (`fergtech/citinet-info`)
- **Framework:** Astro 5 (static output) + React components + Tailwind CSS v4
- **Hosting:** Vercel (auto-deploys on `git push`)
- **Domains:** `citinet.cloud`, `www.citinet.cloud`
- **Purpose:** Public-facing landing/marketing site.

### 2. Web Portal — this repo (`fergtech/citinet`)
- **Framework:** React 18 + Vite SPA + PWA (vite-plugin-pwa)
- **Hosting:** Vercel (primary, auto-deploys on `git push` to `master`)
- **Domains:**
  - `start.citinet.cloud` — onboarding mode (join or create a hub)
  - `*.citinet.cloud` — hub mode (e.g. `riverdale.citinet.cloud`)
- **SPA routing:** `vercel.json` rewrites all paths to `index.html`
- **CF Workers fallback:** `wrangler.jsonc` keeps the app deployed to `citinet-web` Worker, which serves the `*.citinet.cloud` wildcard (Vercel Free does not support wildcard custom domains)
- **Purpose:** Browser-based client for all hub interactions.

#### Routing Logic
- `getSubdomain()` checks `window.location.hostname`:
  - `start.citinet.cloud` → no subdomain → **onboarding mode** (join/create hub)
  - `riverdale.citinet.cloud` → subdomain `riverdale` → **hub mode** (hub interface)
- Dev: set `VITE_FORCE_HUB_SLUG=mytest` to simulate hub mode locally

#### Cross-Origin localStorage Bootstrap
When navigating from `start.citinet.cloud` to `riverdale.citinet.cloud`, connection data is base64-encoded into a `?_cc=` URL param (localStorage is origin-scoped). `HubContext` reads and saves it on first load, then cleans the URL.

### 3. Hub Registry (`fergtech/citinet-registry`)
- **Runtime:** Cloudflare Worker + Workers KV
- **Domain:** `registry.citinet.cloud`
- **Deploy:** `npx wrangler deploy` (manual, requires CF API token with Workers Scripts: Edit)
- **Purpose:** Central directory of active hubs. Stores slug, name, tunnel URL, online status. Hub clients auto-register on every tunnel start.

### 4. Desktop Hub Client (`fergtech/citinet-client`)
- **Framework:** Tauri 2 + React 19 desktop app
- **Platform:** Windows (.msi installer via WiX)
- **Distribution:** GitHub Releases — `https://github.com/fergtech/citinet-client/releases`
- **Auto-update endpoint:** `https://github.com/fergtech/citinet-client/releases/latest/download/update.json`
- **Purpose:** Runs on the hub operator's machine. Manages Docker containers, creates Cloudflare quick tunnels, exposes a local API on port 9090, and auto-registers the hub with the registry on every tunnel start.

---

## DNS Configuration (`citinet.cloud` — Cloudflare nameservers)

| Record | Type | Target | CF Proxy | Purpose |
|--------|------|--------|----------|---------|
| `citinet.cloud` | CNAME | `cname.vercel-dns.com` | OFF | Info site |
| `www` | CNAME | `cname.vercel-dns.com` | OFF | Info site www |
| `start` | CNAME | `cname.vercel-dns.com` | OFF | Web portal onboarding (this app) |
| `*` | CNAME | `citinet-web.tdyfrvr.workers.dev` | ON | Hub subdomains (CF Worker serves this app) |
| `registry` | Worker route | `citinet-registry` Worker | ON | Hub registry API |

> `registry.citinet.cloud` and `*.citinet.cloud` must stay on Cloudflare — CF Workers require the orange cloud proxy.

---

## Hub Connectivity Flow

```
Hub operator starts desktop client
    → Cloudflare quick tunnel starts on port 9090 (something.trycloudflare.com)
    → tunnel URL auto-registered with registry.citinet.cloud

User at start.citinet.cloud discovers hub
    → probes hub tunnel → authenticates
    → navigateToHub('riverdale', connection) encodes connection as ?_cc= param
    → navigates to riverdale.citinet.cloud

Web app at riverdale.citinet.cloud loads
    → HubContext bootstraps localStorage from ?_cc= param
    → fetches registry.citinet.cloud to get current tunnel URL
    → updates stored URL if tunnel rotated since last visit
    → connects to hub API at something.trycloudflare.com
```

---

## Key Services

| File | Purpose |
|------|---------|
| `src/app/services/hubService.ts` | Hub connections, localStorage persistence, onboarding state |
| `src/app/services/registryService.ts` | Fetch/register hubs with registry.citinet.cloud |
| `src/app/context/HubContext.tsx` | Hub state provider, tunnel URL refresh on init, health checks |
| `src/app/utils/subdomain.ts` | `getSubdomain()`, `getHubUrl()`, `navigateToHub()` |

---

## Known Limitations

- **IPv6-only tunnels:** `trycloudflare.com` quick tunnels have no IPv4 A records. Users on IPv4-only connections cannot reach hub APIs.
- **Wildcard on CF Workers:** `*.citinet.cloud` must stay on Cloudflare Workers (Vercel Free limitation).
- **Registry is CF-only:** `registry.citinet.cloud` cannot move off Cloudflare without migrating the KV store.
- **Registrar transfer lock:** citinet.cloud subject to 60-day ICANN lock from registration (~April 2026).

---

## Deployment Summary

| Component | How to deploy |
|-----------|---------------|
| Info site | `git push` → Vercel auto-deploys |
| Web portal (this repo) | `git push` → Vercel + CF Workers auto-deploy |
| Registry | `npx wrangler deploy` (manual) |
| Desktop client | `npm run tauri build` with signing key env var, upload to GitHub release |
