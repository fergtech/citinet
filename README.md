# Citizens Internet Project (Citinet)
## Local Community Hub — Web Portal

**Digital infrastructure for hyperlocal communities. Owned by citizens, not corporations.**

---

## What Is Citinet?

Citizens Inter-networking (Citinet) is a community-driven, independent network system composed of many small, locally operated "micro–data centers." These hubs communicate using open, standard Internet protocols but operate outside the control of traditional monopolies, big corporations, and large government agencies.

Citinet provides alternative layers, platforms, and digital resources that ordinary people can run, own, and use — without surveillance, centralized control, or extractive business models.

## Purpose

- Return digital power, data sovereignty, communication tools, and online community spaces back to citizens.
- Build infrastructure at the local level — where it is most effective and most resilient.

Today's Internet is dominated by large corporations, government agencies, massive cloud platforms, and centralized data harvesting. Citinet provides an alternative — not by reinventing the entire Internet, but by building a new layer on top of it: **a layer owned and operated by the people who use it.**

---

## How It Works

### For community members
Open the Citinet web portal in any browser. No installation required. Join a nearby hub by entering its address, or browse the public hub directory. Once connected, access your community's messages, files, and neighbors.

### For hub operators
Run the Citinet hub stack (4 Docker containers) on any machine you own — a spare PC, laptop, mini PC, or Raspberry Pi. The hub is yours: your hardware, your drives, your rules. The web portal connects members to your hub over your local network or via Tailscale for wider reach.

---

## Vision: Modular by Design

Every part of the hub stack is independently replaceable — like lego bricks:

| Layer | Default | Swappable to |
|---|---|---|
| **File storage** | Local MinIO (S3-compatible) | Backblaze B2, Wasabi, Cloudflare R2, any S3 endpoint |
| **Database** | Bundled Postgres 16 | External Postgres, NAS-hosted, managed DB |
| **Cache/sessions** | Bundled Redis | External Redis |
| **Public access** | Tailscale Funnel | Any reverse proxy or VPN |
| **Data location** | `./data` folder | Any drive on any machine (`DATA_DIR` in `.env`) |

Hub operators own and control every layer. No data leaves the machine without an explicit operator decision.

---

## The Hub Stack

Each Citinet hub runs 4 containers via Docker Compose:

```
citinet-api       (port 9090)  — Express/Node.js API: auth, messages, files
citinet-db        (internal)   — PostgreSQL 16: accounts, messages, file metadata
citinet-storage   (internal)   — MinIO: actual file/media storage (S3-compatible)
citinet-redis     (internal)   — Redis: sessions, future real-time pubsub
```

All data is stored in `DATA_DIR` on the operator's chosen drive. DB/storage/cache ports are bound to `127.0.0.1` only — not reachable from outside the machine directly.

### Hub API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Readiness probe |
| GET | `/api/info` | — | Hub identity (name, location, slug) |
| GET | `/api/status` | — | Live stats (uptime, user count) |
| POST | `/api/auth/register` | — | Create account (first user = admin) |
| POST | `/api/auth/login` | — | Authenticate, get token |
| GET | `/api/members` | ✅ | List hub members |
| GET | `/api/conversations` | ✅ | List conversations (DMs + groups) |
| POST | `/api/conversations` | ✅ | Create DM or group conversation |
| GET | `/api/conversations/:id/messages` | ✅ | Load messages (paginated) |
| POST | `/api/conversations/:id/messages` | ✅ | Send a message |
| GET | `/api/atlas/pins` | ✅ | List all community map pins |
| POST | `/api/atlas/pins` | ✅ | Place a new pin |
| DELETE | `/api/atlas/pins/:id` | ✅ | Delete a pin (author or admin) |
| GET | `/api/files` | ✅ | List files (own + public) |
| POST | `/api/files` | ✅ | Upload file (multipart, max 100 MB) |
| GET | `/api/files/:name` | ✅ | Download file |
| DELETE | `/api/files/:name` | ✅ | Delete file |
| PATCH | `/api/files/:name` | ✅ | Toggle public/private visibility |

---

## Current Mission Status

### Mission 1 — Local Hub (Active · March 2026)

**Goal:** Prove the complete community hub experience end-to-end on a single machine before opening to the network. A person should be able to create a hub, invite their neighbors, communicate, share files, explore their community, and discover useful tools — all without touching a cloud service.

**Completed:**

*Hub setup & onboarding*
- ✅ Hub creation wizard (6-step: identity → access mode → admin account → script download → wait → live)
- ✅ OS-aware setup script generator (PowerShell for Windows, Bash for Mac/Linux) — installs Docker + Tailscale, writes `.env` + `docker-compose.yml`, starts stack, polls for health
- ✅ Hub API with real authentication (bcrypt passwords, cryptographically random session tokens, Postgres-backed)
- ✅ First registered user on a hub automatically becomes admin
- ✅ Join flow — probe any hub URL, "Connect Anyway" fallback if probe fails
- ✅ Auth screens — register or log in against the hub's own API
- ✅ Logout — clears local state and subdomain cache, hard-reloads to welcome screen
- ✅ Data sovereignty — `DATA_DIR` in `.env` controls where all hub data lives (any drive, any path)

*Core hub features — hub API backed*
- ✅ Dashboard — sidebar navigation, recent activity feed (mock), featured banner
- ✅ Account screen — view/edit display name, email, location, tags
- ✅ Hub Management (admin-only) — hub info, member list with admin badges
- ✅ Messages — DMs, group conversations, file attachments, 10-second polling
- ✅ Files — upload/download/delete/visibility toggle, backed by MinIO
- ✅ Neighbors / Network screen — live member list from hub API, searchable, member count badge, member list modal

*Community features — hub API backed*
- ✅ Discussions / Feed — fully wired to hub API; post types: discussion, announcement, project, request; compose with optional media upload (images/video → MinIO); threaded replies via PostDetailModal; edit/delete (author or admin); 30-second poll; public file serving via `/api/public/files/:name`

*Community features — localStorage-backed (hub API integration pending)*
- ✅ Atlas — neighborhood community map (OpenStreetMap + Leaflet); pin types: meetup spot, safety alert, avoid area, community space, point of interest; add/delete pins, search, category filter, two-way map↔list sync; dark/light tile switching; pins backed by hub API (`/api/atlas/pins`) — shared across all hub members in real time
- ✅ Discover (Toolkit) — curated directory of open-source, privacy-first tools
  - 24 seed tools across 8 built-in categories (browsers, search, messaging, storage, productivity, creative, dev tools, hardware)
  - Category sidebar (desktop, sticky) + horizontal chip strip (mobile) — click any category to filter
  - Search bar + tag filter panel (11 tags: open-source, encrypted, self-hostable, etc.)
  - Community tool submissions via 5-step wizard modal (name/URL → categories → description → tags → rationale)
  - Admin moderation queue — approve (publishes tool) or reject (with reviewer notes)
  - My Submissions screen — submission history with status tracking per user
  - Admin category creation — inline input in sidebar, persisted to localStorage
  - User category suggestions — propose a new category during submission, reviewed with the tool

*Admin & moderation*
- ✅ Admin detection — hub creator stamped as admin at onboarding; localhost hub fallback grants admin to any logged-in user (dev convenience)
- ✅ Admin-only surfaces: Hub Management, Hub Admin sidebar link, Discover moderation queue, Review Queue button
- ✅ Toolkit moderation queue — approve/reject submissions, reviewer identity from hub context
- ✅ Error handling — 401 clears stale token, HTML errors never surface raw in UI
- ✅ Tailscale same-device limitation surfaced in UI with clear guidance

*Network map*
- ✅ Network screen — OpenStreetMap + React Leaflet v4; hub pin (indigo square) + member pins (blue circles with golden-angle offsets); Nominatim geocoding with sessionStorage cache; click any pin → NodeDetailsModal with real data; 60-second member poll; dark/light CartoDB tile switching

**Known limitations / remaining Mission 1 work:**
- Toolkit submissions/approvals: localStorage only — not synced across clients (seed tool data works for all users regardless)
- Hub registry/discovery (`citinet.xyz`) not yet wired to production domain
- No real-time WebSocket — messages poll every 10 seconds, feed polls every 30 seconds
- Messages stored in plaintext in Postgres (E2E encryption is Mission 3)
- Tailscale Funnel cannot be accessed from the machine serving it — use `localhost:9090` locally

**Remaining to close Mission 1:**
- Resolve hub registry domain for public discovery (`citinet.xyz` → Vercel + registry service)

---

### Mission 2 — Network Access (Planned)

- Production domain (`citinet.xyz`) wired to Vercel/auto-deploy
- Hub registry and public discovery — browse nearby hubs before joining
- External user access via Tailscale working end-to-end (multi-device testing)
- Hub Management: storage location management, drive migration UI
- Smart re-join: "Resume session" when returning to a known hub
- Toolkit, Atlas, Feed backed by hub API (multi-user sync)
- Push notifications for messages (Web Push API)

### Mission 3 — Security & Federation (Planned)

- End-to-end encryption for messages (client-side; server stores ciphertext only)
- File encryption at rest
- ActivityPub / Matrix federation between hubs
- WebSocket real-time messaging
- Offline-capable hub-served PWA
- Multi-hub identity — one account, multiple hubs

---

## For Hub Operators

### What You Need

- **Hardware:** Any computer — desktop, laptop, mini PC, Raspberry Pi 4+
- **OS:** Windows, macOS, or Linux
- **Software:** Docker Desktop (or Docker Engine + Compose v2)
- **Optional:** Tailscale account for access beyond your local network

### Quick Start

**1. Create your hub via the web portal**

Open the portal at `http://localhost:3000` (dev) or `citinet.xyz` (production, coming soon).

- Click **Create Hub**
- Complete the wizard: hub name, location, access mode, admin account
- Download the generated setup script for your OS
- Run the script — it handles everything

**2. What the setup script does**

- Installs Docker (if not present)
- Installs Tailscale (if Tailscale access mode selected)
- Writes your `.env` and `docker-compose.yml` to `~/citinet-hub/`
- Runs `docker compose up -d`
- Polls `localhost:9090/health` until the hub is ready
- Reports your hub's local URL and Tailscale URL

**3. Choosing where your data lives**

By default, all hub data (database, files, sessions) is stored in `~/citinet-hub/data/`. To use a different drive or path, edit `.env`:

```env
# Use any path on any drive
DATA_DIR=D:/my-hub-data          # Windows
DATA_DIR=/mnt/external/citinet   # Linux
```

Then restart the stack:
```bash
docker compose -f ~/citinet-hub/docker-compose.yml down
docker compose -f ~/citinet-hub/docker-compose.yml up -d
```

### Accessing Your Hub

**From the same machine:**
```
http://localhost:9090    ← hub API
http://localhost:9001    ← MinIO file storage console
```

**From devices on your local network:**
```
http://<your-local-ip>:9090
```

**From anywhere (Tailscale required):**
```
https://<machine-name>.<tailnet>.ts.net
```
> Note: Tailscale Funnel cannot be accessed from the machine that's serving it. Use `localhost:9090` locally; the Tailscale URL is for other devices.

### Common Operations

```bash
# View logs
docker compose -f ~/citinet-hub/docker-compose.yml logs -f citinet-api

# Stop hub
docker compose -f ~/citinet-hub/docker-compose.yml down

# Restart just the API (after config change)
docker compose -f ~/citinet-hub/docker-compose.yml up -d --force-recreate citinet-api

# Update to latest API version
docker compose -f ~/citinet-hub/docker-compose.yml pull citinet-api
docker compose -f ~/citinet-hub/docker-compose.yml up -d --force-recreate citinet-api
```

### Troubleshooting

**Health check fails (`curl http://localhost:9090/health` returns nothing):**
- Check `docker compose ps` — all 4 containers should show `running (healthy)`
- Check logs: `docker compose logs citinet-api`
- Postgres may still be initializing — wait 30 seconds and try again

**Login fails with "Invalid or expired token":**
- Your session was cleared (e.g., the DB was reset). Register a new account — the first user becomes admin.

**Files show "Storage not available":**
- `STORAGE_ACCESS_KEY` and `STORAGE_SECRET_KEY` must be set in `.env`
- MinIO container must be healthy: `docker compose ps citinet-storage`

**Port 9090 already in use:**
- Set `API_PORT=9091` in `.env` and restart the stack

---

## For Developers

### Tech Stack

**Web Portal (this repo):**
- React 18 + TypeScript
- Vite
- Tailwind CSS 4
- React Router DOM
- Motion (animations)
- Lucide React (icons)

**Hub API (`api/`):**
- Node.js + Express
- PostgreSQL (`pg`) — accounts, sessions, messages, file metadata
- MinIO (`minio`) — file/media object storage
- Redis — sessions and future real-time pubsub
- `bcryptjs` — password hashing
- `multer` — multipart file upload handling

**Hub Stack:**
- Docker Compose (4 services)
- `ghcr.io/fergtech/citinet-api:latest` — the built API image
- `postgres:16-alpine`
- `minio/minio:latest`
- `redis:7-alpine`

### Run the Web Portal (dev)

```bash
npm install
npm run dev
# Available at http://localhost:3000
```

### Build & Push Hub API Image

The API image is built automatically for **both `amd64` and `arm64`** (Raspberry Pi) via GitHub
Actions on every push to `master` that touches `api/`. See `.github/workflows/build-api.yml`.

To build and push manually (requires `docker buildx`):

```bash
# One-time setup — create a buildx builder if you don't have one
docker buildx create --use --name citinet-builder

# Build for amd64 + arm64 and push both in one command
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/fergtech/citinet-api:latest \
  --push \
  ./api
```

> **Note:** Plain `docker build` only produces an image for your local machine's architecture.
> Always use `docker buildx` with `--platform` when publishing so Raspberry Pi (ARM64) users
> can pull the image without building it themselves.

### Key Files

| File | Purpose |
|---|---|
| `src/app/App.tsx` | Routing — subdomain detection, hub vs. welcome mode, HubGuard |
| `src/app/context/HubContext.tsx` | Hub state, currentUser, admin flag |
| `src/app/services/hubService.ts` | All hub API calls, localStorage persistence |
| `src/app/components/NodeCreationWizard.tsx` | Hub creation 6-step wizard |
| `src/app/utils/scriptGenerator.ts` | Generates OS-specific setup scripts |
| `src/app/components/NodeDiscoveryScreen.tsx` | /join flow — probe hub URL, auth |
| `src/app/components/Dashboard.tsx` | Main hub dashboard, sidebar nav, admin detection |
| `src/app/components/MessagesScreen.tsx` | DMs, group conversations, file attachments |
| `src/app/components/FilesScreen.tsx` | File upload/download/management |
| `src/app/components/NetworkScreen.tsx` | Neighbors list, member count modal, network map |
| `src/app/components/NetworkMap.tsx` | OpenStreetMap + Leaflet map, geocoding, member pins |
| `src/app/components/AtlasScreen.tsx` | Community neighborhood map, pin CRUD |
| `src/app/services/atlasService.ts` | Atlas pin storage (localStorage per hub) |
| `src/app/components/ToolkitScreen.tsx` | Discover screen — category sidebar, tool grid, admin controls |
| `src/app/services/toolkitService.ts` | Tool/submission/category storage (localStorage) |
| `src/app/components/AddToolModal.tsx` | 5-step tool submission wizard |
| `src/app/components/ModerationQueueScreen.tsx` | Admin: approve/reject tool submissions |
| `src/app/components/HubManagementScreen.tsx` | Admin: hub info, member list |
| `src/app/components/AccountScreen.tsx` | User profile — edit display name, email, location |
| `src/app/types/hub.ts` | Hub, HubUser, HubMember, HubPost types |
| `src/app/types/toolkit.ts` | Tool, ToolSubmission, ToolCategory types |
| `src/app/types/atlas.ts` | AtlasPin, AtlasPinCategory, ATLAS_CATEGORIES |
| `api/server.js` | Hub API (Express + Postgres + MinIO + Redis) |
| `docker-compose.yml` | Hub stack definition (dev — local volume mount) |
| `.env.example` | Hub configuration reference |

---

## Security Notes

**Current state (Mission 1):**
- Passwords: bcrypt-hashed ✅
- Session tokens: cryptographically random 32-byte hex ✅
- DB/storage/cache: bound to `127.0.0.1` only, not internet-exposed ✅
- Transit encryption: active when Tailscale Funnel is used ✅
- Message storage: plaintext in Postgres ⚠️
- File storage: unencrypted in MinIO ⚠️

**Planned (Mission 3):**
- End-to-end encryption for messages (client-side; server stores ciphertext only)
- File encryption at rest
- No third-party auth services — the hub is the auth provider

---

## Why Citinet Matters

Citinet enables:
- Citizen-controlled data and infrastructure
- Community-hosted spaces free from algorithmic manipulation
- Meaningful local digital identity
- Censorship-resistant content
- Organic, decentralized network growth
- Human-centered digital experiences

It transforms:
- Houses → micro data centers
- Neighborhoods → digital communities
- Citizens → owners of their digital world

**A network of citizen-owned networks.**

---

## Physical Infrastructure Vision

A hub can run on almost any hardware you already own:

| Hardware | Suitable for |
|---|---|
| Spare PC or laptop | Full-featured hub, any community size |
| Mini PC (Intel NUC, etc.) | Quiet, low-power permanent hub |
| Raspberry Pi 4/5 | Small community, low traffic |
| Old server | High-capacity hub with large storage |
| Home NAS | Storage-heavy hub |

Citinet node locations: homes, apartments, libraries, community centers, coworking spaces, makerspaces, small businesses, neighborhood hubs.

---

## Related Repositories

- [citinet-client](https://github.com/fergtech/citinet-client) — Hub management desktop app (Windows)
- [citinet-info](https://github.com/fergtech/citinet-info) — Informational companion site
- [citinet-registry](https://github.com/fergtech/citinet-registry) — Hub registry (Cloudflare Worker)

## License

See `ATTRIBUTIONS.md` for third-party licenses and credits.
