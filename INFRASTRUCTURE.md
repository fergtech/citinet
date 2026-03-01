# Citinet Infrastructure Overview

This document describes the full infrastructure landscape for the Citinet project — how components connect and what role this repo plays in local-first hub operations.

---

## Current Status (March 2026)

**Mission 1 (In Progress):** Validate local hub-to-browser connectivity flow
**Mission 2 (Planned):** Deploy web portal to `citinet.xyz` for public access

This repo is currently focused on proving the local E2E flow: hub operators run a local hub stack, expose it via Tailscale/tunnel, and connect via browser.

---

## Components

### 1. Web Portal — this repo (`fergtech/citinet`)
- **Framework:** React 18 + Vite SPA + PWA (vite-plugin-pwa)
- **Current Deployment:** Local development only (`npm run dev`)
- **Future Deployment:** `citinet.xyz` (domain purchased, not yet connected)
- **Purpose:** Browser-based interface for all hub interactions. Community members use this to discover, join, and participate in their hub — no installation required.

#### Routing Logic
- `getSubdomain()` checks `window.location.hostname`:
  - No subdomain → **onboarding mode** (join/create hub wizard)
  - Has subdomain → **hub mode** (hub interface with slug)
- Dev: set `VITE_FORCE_HUB_SLUG=mytest` to simulate hub mode locally

#### Cross-Origin localStorage Bootstrap
When navigating between different hub subdomains, connection data is base64-encoded into a `?_cc=` URL param (localStorage is origin-scoped). `HubContext` reads and saves it on first load, then cleans the URL.

### 2. Hub Registry (`fergtech/citinet-registry`)
- **Runtime:** Cloudflare Worker + Workers KV
- **Status:** Deployed but not yet integrated with Mission 1
- **Purpose:** Central directory of active hubs (future). Will store slug, name, tunnel URL, online status when hubs auto-register.

### 3. Hub Stack (Docker Compose)
- **Framework:** Docker Compose defining API, database, storage, messaging services
- **Port:** 9090 (local API exposed via tunnel)
- **Setup:** Hub operators download setup package from web portal, run scripts to install Docker/Tailscale, then `docker-compose up`
- **Future:** Web-based admin panel for hub configuration

---

## Hub Operator Setup Flow (Mission 1)

**Phase 1: Hub Setup**
```
Hub operator visits local web app (localhost:3000)
    → Clicks "Create Hub" wizard
    → Enters hub name, location, visibility choice
    → Downloads setup package (docker-compose.yml + scripts + guides)
    → Extracts files, runs setup scripts:
        - Scripts check for Docker (install if missing)
        - Scripts check for Tailscale (install if missing)
        - Scripts verify system prerequisites
    → Operator runs: docker-compose up -d
        - Hub stack starts (API, database, storage, messaging)
        - Hub API listens on localhost:9090
    → Operator configures public access gateway:
        - Tailscale Funnel → https://hubname.tailXXXX.ts.net (recommended)
        - Cloudflare Tunnel → custom domain
        - Reverse proxy / local-only
```

**Phase 2: Browser Connection**
```
Community member visits web app (future: citinet.xyz, current: localhost:3000)
    → Clicks "Join a Hub"
    → Enters hub tunnel URL (e.g., https://myhub.tailXXXX.ts.net)
   Hub Stack Architecture

**Services Defined in docker-compose.yml:**
- `citinet-api` — Hub API (Node.js/Express or Go), port 9090
- `citinet-db` — PostgreSQL database (users, messages, files metadata)
- `citinet-storage` — MinIO object storage (S3-compatible, file uploads)
- `citinet-redis` — Redis (sessions, WebSocket pub/sub, optional)

**Environment Configuration (.env):**
- `HUB_NAME`, `HUB_SLUG`, `HUB_LOCATION`
- `API_PORT=9090`
- `DB_PASSWORD`, `STORAGE_ACCESS_KEY`, `JWT_SECRET`
- Optional: `TAILSCALE_AUTHKEY`, `CLOUDFLARE_TUNNEL_TOKEN`

---

##  → Web app probes hub API (/api/info, /api/status)
    → User authenticates (signup or login)
    → HubContext stores connection in localStorage
    → User lands in hub dashboard → can browse feed, network, marketplace
```

**Phase 3: Multi-Hub Support**
- Users can join multiple hubs (each hub connection stored separately)
- Switch between hubs via sidebar/nav
- LocalStorage key: `citinet-hubs` (JSON object of hub connections)

---

## Key Services (Web App)

| File | Purpose |
|------|---------|
| `src/app/services/hubService.ts` | Hub connections, localStorage persistence, probing, auth |
| `src/app/services/registryService.ts` | Hub registry API client (future integration) |
| `src/app/context/HubContext.tsx` | Hub state provider, connection health checks, multi-hub switching |
| `src/app/utils/subdomain.ts` | Subdomain detection, hub URL construction, navigation helpers |

---

## Development & Testing

**Run locally:**
```bash
npm install
npm run dev
# Vite dev server starts at http://localhost:3000
```

**Build for production:**
```bash
npm run build
# Output: dist/ folder (static SPA assets)
```

**Simulate hub mode:**
```bash
# Set environment variable to force hub slug
VITE_FORCE_HUB_SLUG=mytest npm run dev
```

---

## Future Deployment (Mission 2)

**When citinet.xyz is connected:**
- Deploy static build to hosting provider (Vercel, Netlify, or Cloudflare Pages)
- Configure SPA routing (all paths → index.html)
- Support subdomain routing for hub-specific views
- Integrate with hub registry for automatic hub discovery