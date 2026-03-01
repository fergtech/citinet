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

**Phase 1: Hub Setup via Web App**
```
Hub operator visits web portal (localhost:3000, future: citinet.xyz)
    → Clicks "Create Hub" wizard
    → Step 1: Enters hub name, location, ZIP code, description
    → Step 2: Chooses visibility option:
        - Try Local First (recommended, can enable public access later)
        - Public via Tailscale Funnel (requires Tailscale account)
        - Public via Cloudflare Tunnel (requires Cloudflare account)
        - Local Network Only (no internet exposure)
    → Step 3: Downloads setup package (3 files):
        - docker-compose.yml (hub stack services)
        - .env.example (configuration template)
        - README.txt (setup instructions)
    → Step 4: Reviews quick start guide
```

**Phase 2: Local Hub Installation**
```
Operator extracts downloaded files to folder (e.g., ~/citinet-hub)
    → Copies .env.example to .env
    → Edits .env with hub details:
        HUB_NAME="Highland Park Community"
        HUB_SLUG="highland-park"
        HUB_LOCATION="Los Angeles, CA"
        DB_PASSWORD="<strong_password>"
        JWT_SECRET="<random_64_char_string>"
    → (Optional) Runs setup script: npm run hub:setup
        - Checks for Docker installation
        - Checks for Tailscale installation (if public access desired)
        - Validates network configuration
        - Verifies .env file exists and is configured
    → Starts hub stack: docker-compose up -d
        - Pulls Docker images (first run only, ~2-3 minutes)
        - Starts 4 services: citinet-api, citinet-db, citinet-storage, citinet-redis
        - Hub API listens on localhost:9090
    → Verifies hub is running: curl http://localhost:9090/health
        - Should return 200 OK
```

**Phase 3: Public Access Gateway (Optional)**
```
If operator chose public access in wizard:

Option A: Tailscale Funnel (Recommended)
    → Installs Tailscale: https://tailscale.com/download
    → Authenticates: tailscale login
    → Enables Funnel: tailscale funnel 9090
    → Gets public URL: https://<machine-name>.tail<id>.ts.net
    → Adds TUNNEL_URL=<url> to .env
    → Restarts API: docker-compose restart citinet-api

Option B: Cloudflare Tunnel
    → Installs cloudflared
    → Creates tunnel: cloudflared tunnel create <hub-slug>
    → Configures routing: cloudflared tunnel route dns <hub-slug> <subdomain>
    → Runs tunnel: cloudflared tunnel run <hub-slug>
    → Adds TUNNEL_URL=<url> to .env
    → Restarts API: docker-compose restart citinet-api

Option C: Local-Only
    → No additional setup required
    → Hub only accessible from LAN (e.g., http://192.168.1.x:9090)
```

**Phase 4: Browser Connection**
```
Community member visits web app (future: citinet.xyz, current: localhost:3000)
    → Clicks "Join a Hub"
    → Enters hub tunnel URL (e.g., https://myhub.tailXXXX.ts.net)
    → Web app probes hub API (/api/info, /api/status)
    → User authenticates (signup or login)
    → HubContext stores connection in localStorage
    → User lands in hub dashboard → can browse feed, network, marketplace
```

**Phase 5: Multi-Hub Support**
- Users can join multiple hubs (each hub connection stored separately)
- Switch between hubs via sidebar/nav
- LocalStorage key: `citinet-hubs` (JSON object of hub connections)

---

## Hub Stack Architecture

**Services Defined in docker-compose.yml:**
- `citinet-api` — Hub API (Node.js/Express or Go), port 9090
  - Handles authentication, user management, posts, messages, marketplace
  - Environment variables from .env file
  - Health check endpoint: /health
  - Depends on: citinet-db, citinet-storage, citinet-redis
- `citinet-db` — PostgreSQL database (users, messages, files metadata)
  - Port 5432 (internal), volume: citinet-db-data
  - Migrations: ./hub-api/migrations (run on first start)
- `citinet-storage` — MinIO object storage (S3-compatible, file uploads)
  - API port 9000, Console port 9001
  - Volume: citinet-storage-data
  - Access via S3 SDK (compatible with AWS SDK)
- `citinet-redis` — Redis (sessions, WebSocket pub/sub, optional)
  - Port 6379 (internal), volume: citinet-redis-data
  - Used for real-time features (chat, notifications)

**Environment Configuration (.env):**
- `HUB_NAME`, `HUB_SLUG`, `HUB_LOCATION` — Hub identity
- `HUB_VISIBILITY` — public, community, or private
- `API_PORT=9090` — Hub API port
- `DB_PASSWORD`, `STORAGE_ACCESS_KEY`, `JWT_SECRET` — Security credentials
- `CORS_ORIGIN` — Allowed browser origins (* for development)
- `TUNNEL_URL` — Public URL (optional, for Tailscale/Cloudflare tunnel)
- `REGISTRY_URL` — Hub registry endpoint (optional, for auto-registration)

**Setup Scripts (scripts/ folder):**
- `setup-hub.js` — Main orchestrator, runs all checks and guides setup
- `checks/docker.js` — Verifies Docker and Docker Compose installed
- `checks/tailscale.js` — Verifies Tailscale installed (optional)
- `checks/network.js` — Checks port availability and internet connectivity
- `install/docker.sh`, `install/docker.ps1` — Docker installers (Linux/Mac/Windows)
- `install/tailscale.sh`, `install/tailscale.ps1` — Tailscale installers
- `lib/utils.js` — Shared utilities (command execution, OS detection, formatting)

**NPM Scripts:**
- `npm run hub:setup` — Run setup checks and validation
- `npm run hub:verify` — Re-verify prerequisites after changes
- `npm run hub:package` — Generate setup ZIP for distribution (future)

**Setup File Distribution:**
- Files served from `public/setup/` folder (static assets)
- Deployed to Vercel/hosting provider alongside web app
- Users download directly from: `https://citinet.xyz/setup/docker-compose.yml`
- Alternative: Clone from GitHub (`git clone https://github.com/fergtech/citinet.git`)

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