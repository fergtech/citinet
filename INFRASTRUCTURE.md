# Citinet Infrastructure Overview

This document describes the full infrastructure landscape for the Citinet project — how each component is hosted, how they connect, and what role this repo plays.

---

## Components

### 1. Info Site (`fergtech/citinet-info`)
- **Framework:** Astro 4 + React 19 + Tailwind CSS v4
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
- **Purpose:** The primary browser-based interface for all hub interactions. Community members use this to discover, join, and participate in their hub — no installation required.

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
- **Purpose:** Central directory of active hubs. Stores slug, name, tunnel URL, online status. Hubs auto-register on every tunnel start.

### 4. Hub Management App (`fergtech/citinet-client`)
- **Framework:** Tauri 2 + React 19 desktop app
- **Platform:** Windows (.msi installer via WiX)
- **Distribution:** GitHub Releases — `https://github.com/fergtech/citinet-client/releases`
- **Purpose:** Runs on the hub operator's machine. Manages Docker containers (the hub stack), configures public access (Tailscale Funnel, Cloudflare Tunnel, or custom), exposes a local API on port 9090, and auto-registers the hub with the registry. This is an operator/admin tool — community members use the web portal above.
- **Coming soon:** A simplified one-click launcher for non-technical hub operators.

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
Hub operator sets up their machine:
    → Docker Compose starts the hub stack (storage, API, messaging)
    → Hub API starts on port 9090
    → Operator configures public access via their chosen gateway:
        - Tailscale Funnel → stable https://name.tailXXXX.ts.net (recommended)
        - Cloudflare Tunnel → custom domain at {name}.citinet.cloud
        - Reverse proxy / local-only → operator's choice
    → Tunnel URL auto-registered with registry.citinet.cloud

User visits start.citinet.cloud
    → fetches registry, discovers hub
    → probes hub tunnel → authenticates
    → navigateToHub('riverdale', connection) encodes connection as ?_cc= param
    → navigates to riverdale.citinet.cloud

Web app at riverdale.citinet.cloud loads
    → HubContext bootstraps localStorage from ?_cc= param
    → fetches registry.citinet.cloud to get current tunnel URL
    → connects to hub API
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

- **Wildcard on CF Workers:** `*.citinet.cloud` must stay on Cloudflare Workers (Vercel Free limitation).
- **Registry is CF-only:** `registry.citinet.cloud` cannot move off Cloudflare without migrating the KV store.
- **Registrar transfer lock:** citinet.cloud subject to 60-day ICANN lock from registration (~April 2026).
- **Local-only hubs:** Hubs without a public tunnel won't appear in the registry. Future: hub serves web app itself for offline/local setup.

---

## Deployment Summary

| Component | How to deploy |
|-----------|---------------|
| Info site | `git push` → Vercel auto-deploys |
| Web portal (this repo) | `git push` → Vercel + CF Workers auto-deploy |
| Registry | `npx wrangler deploy` (manual) |
| Hub management app | `npm run tauri build` with signing key env var, upload to GitHub release |
