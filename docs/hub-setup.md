# Hub Operator Setup Guide

How to get a Citinet hub running on your hardware, what to expect, and how to manage it day-to-day.

---

## What a Hub Is

A hub is several Docker containers running as a single unit:

```
citinet-api       (127.0.0.1:9090) — API, auth, posts, messages, files, atlas
citinet-db        (internal)       — PostgreSQL 16 — all structured data
citinet-storage   (internal)       — MinIO — file and media object storage
citinet-caddy     (port 443/80)    — automatic HTTPS + reverse proxy (the actual LAN/public entry point)
citinet-backup    (internal)       — nightly DB + file backups, rotated (see Backups below)
citinet-ollama    (internal)       — local AI assistant, only if enabled in the wizard
citinet-livekit   (7880/7881/50000-50100 UDP) — self-hosted WebRTC SFU for calls/broadcasts, only if enabled
```

Every container name above is actually suffixed with your hub's own slug (e.g.
`citinet-api-riverside`, not plain `citinet-api`) — this is what lets a second, completely
unrelated hub run on the same machine without any name collisions. See
[Running Multiple Hubs on One Machine](#running-multiple-hubs-on-one-machine) below. Plain
`docker compose ...` commands (used throughout this guide) are unaffected either way — those
address services by their service name, not container name.

`citinet-api` binds to `127.0.0.1` only, deliberately — it's not reachable from the LAN
directly. `citinet-caddy` is the only intended path in from outside the hub machine; see
[Accessing the Hub](#accessing-the-hub) below.

Everything lives in a directory on a drive you choose. Moving the hub to a different drive means changing one line in a file and restarting.

---

## Prerequisites

- Docker Desktop (Windows/macOS) or Docker Engine + Compose v2 (Linux)
- At least 2 GB free RAM and 5 GB disk space
- A machine that stays on while the hub is in use (a Raspberry Pi, mini PC, old laptop — anything works)

---

## Part 1 — Create the Hub

1. Open the Citinet web portal (or `http://localhost:5173` if running locally)
2. Click **Create Hub**
3. Complete the 6-step wizard:
   - Hub name, location, description, visibility
   - Choose where your data lives (default: `./data` next to `docker-compose.yml`)
   - Tailscale URL for public access (optional)
4. Download the generated setup script for your OS

The wizard generates a complete `docker-compose.yml`, a `.env` file with all credentials pre-filled, and a one-shot install script.

---

## Part 2 — Run the Setup Script

### Linux / Raspberry Pi

```bash
chmod +x citinet-setup.sh
./citinet-setup.sh
```

### Windows (PowerShell — run as Administrator)

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\citinet-setup.ps1
```

The script:
- Checks for Docker
- Creates the hub directory (`~/citinet-hub-<hub-slug>/` by default — e.g.
  `~/citinet-hub-riverside/`, unique to this hub so a second hub set up later never
  collides with it)
- Writes `docker-compose.yml` and `.env`
- Creates data directories on the chosen drive
- Pulls all images and starts the hub

When it finishes, the hub is running. Visit `http://localhost:9090/health` to confirm.

---

## Part 3 — First Login

Navigate to `http://localhost:9090` on the hub machine itself, or
`https://<hub-slug>.hub.citinet.cloud` from any other device — see
[Accessing the Hub](#accessing-the-hub) below.

The first account you register on the hub becomes the **admin**. Sign up with whatever username and password you want.

---

## Where Your Data Lives

All hub data is controlled by variables in `~/citinet-hub-<hub-slug>/.env`:

```env
DATA_DIR=./data           # Postgres (DATA_DIR/db) + Caddy's HTTPS certs (DATA_DIR/caddy)
FILES_DIR=./data/storage  # uploaded user files (MinIO)
BACKUP_DIR=./data/backups # nightly DB + file backups (see Backups below)
OLLAMA_DIR=./data/ollama  # local AI model cache, only if AI was enabled
```

By default all point to subdirectories under `~/citinet-hub-<hub-slug>/data/`. You can point any of
them to a different path — a different drive, an external HDD, a network share —
independently of the others.

**To move your database to a new drive:**

```bash
docker compose -f ~/citinet-hub-<hub-slug>/docker-compose.yml down
sudo rsync -aHAX ~/citinet-hub-<hub-slug>/data/db /mnt/new-drive/citinet/db
nano ~/citinet-hub-<hub-slug>/.env   # set DATA_DIR=/mnt/new-drive/citinet
docker compose -f ~/citinet-hub-<hub-slug>/docker-compose.yml up -d
```

**To move file storage to a different drive (or a network share):**

See [remote-file-storage.md](./remote-file-storage.md) for the full guide.

---

## Running Multiple Hubs on One Machine

Nothing about a hub ties it to any other hub — each is a fully independent stack (its own
database, its own storage, its own admin account, its own secrets). The only thing that
used to stop two of them sharing one machine was naming: every hub's containers used the
same fixed names and every hub wanted the same host ports. Both are solved automatically
or with one `.env` edit:

- **Install directory and container names** — automatic, nothing to do. The setup script
  installs into `~/citinet-hub-<hub-slug>/` (unique per hub by construction, since slugs
  are unique across all of Citinet), and every container name is suffixed with that same
  slug (`citinet-api-riverside`, `citinet-db-riverside`, …).
- **Host ports** — the *second* hub's `.env` needs different values for whichever of these
  it actually uses, before its first `docker compose up`:

  | Variable | Default | Used by |
  |---|---|---|
  | `API_PORT` | `9090` | citinet-api (loopback-only) |
  | `HTTPS_PORT` | `443` | citinet-caddy |
  | `HTTP_PORT` | `80` | citinet-caddy |
  | `STORAGE_CONSOLE_PORT` | `9001` | citinet-storage (MinIO console, loopback-only) |
  | `LIVEKIT_PORT` | `7880` | citinet-livekit, only if comms is enabled |
  | `LIVEKIT_RTC_TCP_PORT` | `7881` | citinet-livekit, only if comms is enabled |
  | `LIVEKIT_UDP_PORT_START` / `LIVEKIT_UDP_PORT_END` | `50000` / `50100` | citinet-livekit media, only if comms is enabled (keep the same 101-port span if you move it) |

  All of these are already written into the generated `.env` — just change the values for
  the second (or third, …) hub before running its setup script for the first time.
  Everything else (`DATA_DIR`, `FILES_DIR`, `BACKUP_DIR`, `OLLAMA_DIR`) already defaults to
  a path under that hub's own install directory, so those never collide either.

Moving a hub off the standard HTTPS/HTTP ports does mean its URL needs the port number
(`https://<hub-slug>.hub.citinet.cloud:8443` instead of the plain hostname) for anyone
reaching it directly by port rather than through the registered hostname — a real
trade-off of running two hubs behind one IP, not a bug.

---

## Accessing the Hub

| From | URL |
|---|---|
| Hub machine only | `http://localhost:9090` (loopback-only, doesn't work from other devices) |
| Any device on the LAN, or off it | `https://<hub-slug>.hub.citinet.cloud` |
| Anywhere (Tailscale Funnel, if configured) | `https://<machine>.<tailnet>.ts.net` |

Every hub gets a real, browser-trusted HTTPS certificate for
`<hub-slug>.hub.citinet.cloud` automatically at creation time — no router
configuration, no DNS entry to add, no port number to remember. See
[hub-https-bridge.md](./hub-https-bridge.md) for how this works and why it
also solves plain LAN access with zero setup.

`citinet-api` itself only binds to `127.0.0.1:9090` on the hub machine — it is
never reachable directly from the LAN. `citinet-caddy` (ports 80/443) is the
only intended entry point from any other device.

### If DNS resolution to `.hub.citinet.cloud` isn't an option

For a guest device with no internet access at all (so it can't resolve any
public hostname), see
[hub-wireless-reach-standard.md](./hub-wireless-reach-standard.md) for a
dedicated access point that still serves the same real certificate. A manual
router DNS override to a raw `citinet:9090` address
([router-dns-quick-reference.md](./router-dns-quick-reference.md)) is a
legacy fallback from before the HTTPS bridge shipped — it still works, but
gives you plain HTTP with no certificate (no Web Crypto/E2E encryption), so
prefer the hostname above whenever the hub has any internet access.

---

## Common Commands

All commands assume you're on the hub machine. Prefix paths with the full path if running remotely.

```bash
# View live API logs
docker compose -f ~/citinet-hub-<hub-slug>/docker-compose.yml logs -f citinet-api

# Stop hub
docker compose -f ~/citinet-hub-<hub-slug>/docker-compose.yml down

# Start hub
docker compose -f ~/citinet-hub-<hub-slug>/docker-compose.yml up -d

# Check health
curl -s http://localhost:9090/health

# Update to latest API version
docker compose -f ~/citinet-hub-<hub-slug>/docker-compose.yml pull citinet-api
docker compose -f ~/citinet-hub-<hub-slug>/docker-compose.yml up -d --force-recreate citinet-api

# Check container status
docker compose -f ~/citinet-hub-<hub-slug>/docker-compose.yml ps
```

---

## Troubleshooting

**`citinet-api` shows `unhealthy`**

Check the healthcheck target. On Alpine Linux, `localhost` resolves to IPv6 `[::1]` but Node.js listens on IPv4. The `docker-compose.yml` must use `127.0.0.1` in the healthcheck, not `localhost`.

```bash
docker compose -f ~/citinet-hub-<hub-slug>/docker-compose.yml logs citinet-api
```

**Port 9090 (or 443/80/9001/7880/7881/50000-50100) already in use**

Almost always means another hub is already running on this machine — see
[Running Multiple Hubs on One Machine](#running-multiple-hubs-on-one-machine) below for
which `.env` variable controls each one.

**File uploads fail when using a network share for `FILES_DIR`**

If the remote PC or NAS is offline, uploads and downloads will fail — but login and all other features still work. The API and database are unaffected.

**Services keep restarting**

Check for misconfigured passwords in `.env` (no blank values for `DB_PASSWORD`, `JWT_SECRET`, etc.).

```bash
docker compose -f ~/citinet-hub-<hub-slug>/docker-compose.yml logs
```

---

## Automounting Drives on Boot (Linux)

If your hub data is on an external or secondary drive, add it to `/etc/fstab` so it mounts before Docker starts.

```bash
# Find the drive's UUID
lsblk -o NAME,UUID,FSTYPE,MOUNTPOINT

# Edit fstab
sudo nano /etc/fstab
```

Add a line like:

```
UUID=<your-uuid>  /mnt/citinet-storage  vfat  defaults,nofail,uid=0,gid=0,umask=000  0  0
```

The `nofail` flag means the machine still boots normally if the drive is unplugged.

---

## Raspberry Pi: Static IP via NetworkManager

On Raspberry Pi OS Bookworm, networking is managed by NetworkManager:

```bash
# List connections
nmcli connection show

# Set static IP (replace eth0 and values as needed)
sudo nmcli connection modify "Wired connection 1" \
  ipv4.method manual \
  ipv4.addresses 192.168.1.170/24 \
  ipv4.gateway 192.168.1.1 \
  ipv4.dns 8.8.8.8

sudo nmcli connection up "Wired connection 1"
```

---

## Backups

Every hub runs a `citinet-backup` container automatically (as of 2026-08-05) — no setup
required. Once a day it writes a fresh database dump and a full snapshot of uploaded
files to `BACKUP_DIR`, and deletes anything older than `BACKUP_RETENTION_DAYS` (both
set in `.env`, defaulting to `$DATA_DIR/backups` and 7 days).

**This protects against**: accidental or malicious mass-deletion, a bad update, a
corrupted migration — anything that damages the *data*, not the *machine*.

**This does not protect against**: the machine itself dying, being lost, or its disk
failing — `BACKUP_DIR` defaults to a subfolder of the same `DATA_DIR` the live database
lives in, so a dead disk takes both down together. For real protection against losing
the machine entirely, point `BACKUP_DIR` at a different physical drive or a mounted
external/network volume in `.env`, then restart:

```bash
docker compose -f ~/citinet-hub-<hub-slug>/docker-compose.yml up -d citinet-backup
```

Because it re-packages the entire storage directory every run (not incrementally), a
hub with a large amount of uploaded file content will see backups that take
proportionally longer and use real CPU/disk I/O while running — expected, not a bug,
and why this runs once a day rather than more often.

### Restoring from a backup

`docker exec`/`docker inspect` (unlike `docker compose ...`) address a container by its
actual name, which includes your hub's slug — replace `citinet-db` below with
`citinet-db-<hub-slug>`, e.g. `citinet-db-riverside` (check `docker ps` if unsure).

```bash
# Database
gunzip -c db-YYYYMMDD-HHMMSS.sql.gz | docker exec -i citinet-db-<hub-slug> psql -U citinet citinet

# Files (stop the hub first so nothing writes to storage mid-restore)
docker compose -f ~/citinet-hub-<hub-slug>/docker-compose.yml down
tar -xzf storage-YYYYMMDD-HHMMSS.tar.gz -C "$FILES_DIR"
docker compose -f ~/citinet-hub-<hub-slug>/docker-compose.yml up -d
```

### Manual backup, if you want one outside the daily schedule

```bash
docker compose -f ~/citinet-hub-<hub-slug>/docker-compose.yml down
sudo rsync -aHAX ~/citinet-hub-<hub-slug>/data/ /backup/citinet-$(date +%Y%m%d)/
docker compose -f ~/citinet-hub-<hub-slug>/docker-compose.yml up -d
```

