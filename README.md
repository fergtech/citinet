# CitiNet
## Community Hub — Web Portal

**A self-hosted digital commons for hyperlocal communities. Owned by citizens, not corporations.**

---

## What Is CitiNet?

CitiNet gives neighborhoods and communities their own digital home base — independent of Big Tech platforms, corporate algorithms, and centralized data ownership.

A hub runs on hardware your community controls. Your data stays on your machines. Your community sets the rules. No platform can monetize, moderate, or shut it down on your behalf.

See [VISION.md](./VISION.md) for the full picture of where this is headed.

---

## How It Works

**For community members:** Open the CitiNet web portal in any browser. Browse the hub directory or enter a hub's URL directly. Create an account on the hub and start using it — no app install required.

**For hub operators:** Run the CitiNet hub stack (4 Docker containers) on any machine you own — a spare PC, mini PC, or Raspberry Pi. The web portal connects members to your hub over your local network or via Tailscale for public access.

---

## Current Features

| Feature | Status |
|---|---|
| Hub creation wizard (6-step, generates OS setup script) | ✅ |
| Join flow — browse hub directory or enter URL manually | ✅ |
| Hub self-registration in public registry | ✅ |
| Dashboard — activity feed, featured carousel, app tiles | ✅ |
| Discussions / Feed — posts, replies, reply-to-reply, media | ✅ |
| Messages — DMs, group conversations, file attachments | ✅ |
| Files — upload, download, public/private toggle (MinIO) | ✅ |
| Atlas — community map, pins, categories (OpenStreetMap) | ✅ |
| Marketplace / Exchange — vendor profiles and listings | ✅ |
| Toolkit / Discover — curated open-source tool directory | ✅ |
| Network map — live member presence (Leaflet) | ✅ |
| Neighbors — member list, profiles, search | ✅ |
| Hub Management — admin tools, member management, featured content | ✅ |
| Notification badges — unread counts on dashboard tiles | ✅ |
| Profile customization — banner, avatar, headline, bio, links | ✅ |
| Online presence — live "who's here now" count | ✅ |
| Hub app integrations — third-party apps via open contract | ✅ |
| Dark mode | ✅ |

---

## The Hub Stack

Each CitiNet hub runs 4 containers via Docker Compose:

```
citinet-api       (port 9090)  — Node.js/Express: auth, posts, messages, files, atlas
citinet-db        (internal)   — PostgreSQL 16: all structured data
citinet-storage   (internal)   — MinIO: file and media object storage (S3-compatible)
citinet-redis     (internal)   — Redis: sessions, cache
```

The production image is `ghcr.io/fergtech/citinet-api:latest` — built for both `amd64` and `arm64` (Raspberry Pi).

All data is stored in `DATA_DIR` on the operator's chosen drive. DB/storage/cache ports are bound to `127.0.0.1` only.

---

## For Hub Operators

### What You Need

- **Hardware:** Any computer — desktop, laptop, mini PC, Raspberry Pi 4/5
- **OS:** Windows, macOS, or Linux
- **Software:** Docker Desktop (or Docker Engine + Compose v2)
- **Optional:** Tailscale account for access outside your local network

### Quick Start

1. Open the CitiNet web portal
2. Click **Create Hub** and complete the wizard
3. Download the generated setup script for your OS
4. Run it — it installs Docker, writes your config, and starts the hub

### Choosing Where Your Data Lives

```env
# In ~/citinet-hub/.env — use any path on any drive
DATA_DIR=D:/my-hub-data          # Windows
DATA_DIR=/mnt/external/citinet   # Linux
```

Restart the stack after changing:
```bash
docker compose -f ~/citinet-hub/docker-compose.yml down
docker compose -f ~/citinet-hub/docker-compose.yml up -d
```

### Accessing Your Hub

```
Local machine:     http://localhost:9090
Local network:     http://<your-local-ip>:9090
Anywhere (Tailscale): https://<machine>.<tailnet>.ts.net
```

> Tailscale Funnel cannot be accessed from the machine serving it. Use `localhost:9090` locally.

### Common Operations

```bash
# View logs
docker compose -f ~/citinet-hub/docker-compose.yml logs -f citinet-api

# Stop hub
docker compose -f ~/citinet-hub/docker-compose.yml down

# Update to latest API version
docker compose -f ~/citinet-hub/docker-compose.yml pull citinet-api
docker compose -f ~/citinet-hub/docker-compose.yml up -d --force-recreate citinet-api
```

---

## For Developers

### Tech Stack

**Web Portal:**
- React 18 + TypeScript + Vite
- Tailwind CSS 4
- React Router DOM v7
- Motion (Framer Motion successor)
- Lucide React icons

**Hub API (`api/server.js`):**
- Node.js + Express
- PostgreSQL (`pg`) — users, sessions, posts, messages, files, atlas, notifications
- MinIO — file/media object storage
- Redis — sessions
- bcryptjs — password hashing
- multer — file upload handling

### Run the Web Portal (dev)

```bash
npm install
npm run dev
# http://localhost:5173
```

### Environment (`.env.local`)

```env
VITE_REGISTRY_URL=https://raw.githubusercontent.com/fergtech/citinet-registry/main/registry.json
VITE_REGISTRY_API_URL=/api/registry
```

### Build & Push Hub API Image

The API image builds automatically for `amd64` + `arm64` via GitHub Actions on every push to `master` that touches `api/`. To build manually:

```bash
docker build -t ghcr.io/fergtech/citinet-api:latest ./api
docker push ghcr.io/fergtech/citinet-api:latest
```

### Key Files

| File | Purpose |
|---|---|
| `src/app/App.tsx` | Routing — subdomain detection, hub vs. welcome mode |
| `src/app/context/HubContext.tsx` | Hub + user state, health checks |
| `src/app/services/hubService.ts` | All hub API calls, localStorage persistence |
| `src/app/services/registryService.ts` | Hub directory reads + self-registration |
| `src/app/services/notificationsService.ts` | Notification counts + mark-read |
| `src/app/hooks/useNotificationCounts.ts` | Polling hook for dashboard badges |
| `src/app/components/Dashboard.tsx` | Main hub dashboard, app tiles, notification badges |
| `src/app/components/NodeCreationWizard.tsx` | Hub creation wizard |
| `src/app/utils/scriptGenerator.ts` | OS-specific setup script generator |
| `src/app/components/Feed.tsx` | Discussions — posts, compose, replies |
| `src/app/components/PostDetailModal.tsx` | Post detail, reply-to-reply, @mentions |
| `src/app/components/MessagesScreen.tsx` | DMs, group conversations |
| `src/app/components/AtlasScreen.tsx` | Community map, pin CRUD |
| `src/app/components/HubManagementScreen.tsx` | Admin: info, members, featured tabs |
| `src/app/components/FeaturedCarousel.tsx` | Featured content carousel |
| `src/app/components/AccountScreen.tsx` | Profile editing, banner, avatar |
| `src/app/components/ProfileScreen.tsx` | User profile view |
| `api/server.js` | Hub API — Express + Postgres + MinIO |
| `api/registry.js` | Vercel serverless function — hub registry API |
| `src/app/types/hub.ts` | Core type definitions |

---

## Hub API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Readiness probe |
| GET | `/api/info` | — | Hub identity (name, location, slug) |
| GET | `/api/status` | — | Live stats (uptime, user count, online now) |
| POST | `/api/auth/register` | — | Create account (first user = admin) |
| POST | `/api/auth/login` | — | Authenticate, get token |
| GET | `/api/members` | ✅ | List hub members |
| GET | `/api/posts` | ✅ | List posts/discussions |
| POST | `/api/posts` | ✅ | Create post |
| GET | `/api/posts/:id` | ✅ | Get single post |
| GET | `/api/posts/:id/replies` | ✅ | List replies (with reply-to-reply threading) |
| POST | `/api/posts/:id/replies` | ✅ | Add reply |
| GET | `/api/featured` | ✅ | List featured items |
| POST | `/api/featured` | ✅ admin | Pin post or add custom card |
| DELETE | `/api/featured/:id` | ✅ admin | Remove featured item |
| GET | `/api/atlas/pins` | ✅ | List community map pins |
| POST | `/api/atlas/pins` | ✅ | Place a pin |
| DELETE | `/api/atlas/pins/:id` | ✅ | Delete a pin |
| GET | `/api/files` | ✅ | List files (own + public, excludes bg images) |
| POST | `/api/files` | ✅ | Upload file (max 100 MB) |
| GET | `/api/public/files/:name` | — | Serve public file |
| GET | `/api/conversations` | ✅ | List conversations |
| POST | `/api/conversations` | ✅ | Create conversation |
| GET | `/api/conversations/:id/messages` | ✅ | Load messages |
| POST | `/api/conversations/:id/messages` | ✅ | Send message |
| GET | `/api/notifications/counts` | ✅ | Unread counts by feature |
| POST | `/api/notifications/mark-read` | ✅ | Mark feature notifications read |
| PATCH | `/api/hub-info` | ✅ admin | Update hub name/location/description |

---

## Security

| Aspect | Status |
|---|---|
| Passwords | bcrypt-hashed ✅ |
| Session tokens | Cryptographically random 32-byte hex ✅ |
| DB / storage / cache | Bound to `127.0.0.1` only ✅ |
| Transit | Encrypted via Tailscale Funnel ✅ |
| Messages at rest | Plaintext in Postgres ⚠️ (E2E encryption planned Mission 3) |
| Files at rest | Unencrypted in MinIO ⚠️ (encryption planned Mission 3) |

See [SECURITY.md](./SECURITY.md) for the full security backlog.

---

## Related Repositories

- [citinet-registry](https://github.com/fergtech/citinet-registry) — Public hub registry (GitHub-backed JSON, updated via Vercel API)
- [citinet-info](https://github.com/fergtech/citinet-info) — Informational companion site

## License

See [ATTRIBUTIONS.md](./ATTRIBUTIONS.md) for third-party licenses and credits.
