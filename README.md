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
| GET | `/api/files` | ✅ | List files (own + public) |
| POST | `/api/files` | ✅ | Upload file (multipart, max 100 MB) |
| GET | `/api/files/:name` | ✅ | Download file |
| DELETE | `/api/files/:name` | ✅ | Delete file |
| PATCH | `/api/files/:name` | ✅ | Toggle public/private visibility |

---

## Current Mission Status

### Mission 1 — Local Hub (Active · March 2026)

**Goal:** Prove the complete flow end-to-end on a single machine before opening to the network.

**Completed:**
- ✅ Hub creation wizard (6-step: identity → access mode → admin account → script download → wait → live)
- ✅ OS-aware setup script generator (PowerShell for Windows, Bash for Mac/Linux) — handles Docker install, Tailscale, writes `.env` + `docker-compose.yml`, starts stack, polls for health
- ✅ Hub API with real authentication (bcrypt passwords, random session tokens, Postgres-backed)
- ✅ First registered user on a hub automatically becomes admin
- ✅ Join flow — probe any hub URL, "Connect Anyway" fallback if probe fails
- ✅ Auth screens — register or log in against the hub's own API
- ✅ Dashboard with full sidebar navigation
- ✅ Account screen — view/edit display name, email, location, tags
- ✅ Hub Management screen (admin-only) — hub info, member list with admin badges
- ✅ Messages — DMs, group conversations, file attachments, 10-second polling
- ✅ Files — upload/download/delete/visibility toggle, backed by MinIO
- ✅ Neighbors — live member list from hub API
- ✅ Admin detection — hub creator stamped as admin at onboarding; system admin (`isAdmin`) separate from civic role
- ✅ Leave hub — clears local state, hard-reloads to welcome screen
- ✅ Data sovereignty — `DATA_DIR` in `.env` controls where all hub data lives (any drive, any path)
- ✅ Error handling — 401 clears stale token, HTML errors never surface raw in UI
- ✅ Tailscale same-device limitation surfaced in UI with clear guidance

**Known limitations in Mission 1:**
- Tailscale Funnel cannot be accessed from the same machine serving it (Tailscale limitation) — use `localhost:9090` from the hub machine itself
- Messages are stored in plaintext in Postgres (E2E encryption is a future mission)
- Hub registry/discovery (`citinet.xyz`) not yet wired to production domain
- No real-time WebSocket — messages poll every 10 seconds
- Feed/posts screen is UI-only (no backend yet)

### Mission 2 — Network Access (Planned)

- Production domain (`citinet.xyz`) wired to Vercel/auto-deploy
- Hub registry and public discovery
- External user access via Tailscale working end-to-end
- Hub Management: storage location management, drive migration UI
- Smart re-join: "Resume session" when returning to a known hub

### Mission 3 — Security & Federation (Planned)

- End-to-end encryption for messages (client-side, server cannot read)
- File encryption at rest
- ActivityPub / Matrix federation between hubs
- WebSocket real-time messaging
- Offline-capable hub-served PWA

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

```bash
docker build -t ghcr.io/fergtech/citinet-api:latest \
  --provenance=false --sbom=false \
  ./api

docker push ghcr.io/fergtech/citinet-api:latest
```

### Key Files

| File | Purpose |
|---|---|
| `src/app/App.tsx` | Routing — subdomain detection, hub vs. welcome mode |
| `src/app/context/HubContext.tsx` | Hub state management |
| `src/app/services/hubService.ts` | All hub API calls, localStorage persistence |
| `src/app/components/NodeCreationWizard.tsx` | Hub creation 6-step wizard |
| `src/app/utils/scriptGenerator.ts` | Generates OS setup scripts |
| `src/app/components/NodeDiscoveryScreen.tsx` | /join flow |
| `src/app/components/MessagesScreen.tsx` | DMs, groups, file attachments |
| `src/app/components/FilesScreen.tsx` | File upload/download/management |
| `src/app/components/HubManagementScreen.tsx` | Admin: hub info, members |
| `src/app/components/AccountScreen.tsx` | User profile |
| `api/server.js` | Hub API (Express + Postgres + MinIO) |
| `docker-compose.yml` | Hub stack definition |
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
