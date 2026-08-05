# Hub Operator Setup Guide

How to get a Citinet hub running on your hardware, what to expect, and how to manage it day-to-day.

---

## What a Hub Is

A hub is several Docker containers running as a single unit:

```
citinet-api       (port 9090)  — API, auth, posts, messages, files, atlas
citinet-db        (internal)   — PostgreSQL 16 — all structured data
citinet-storage   (internal)   — MinIO — file and media object storage
```

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
- Creates the hub directory (`~/citinet-hub/` by default)
- Writes `docker-compose.yml` and `.env`
- Creates data directories on the chosen drive
- Pulls all images and starts the hub

When it finishes, the hub is running. Visit `http://localhost:9090/health` to confirm.

---

## Part 3 — First Login

Navigate to `http://localhost:9090` on the hub machine, or use your LAN hostname / tunnel URL from another device.

The first account you register on the hub becomes the **admin**. Sign up with whatever username and password you want.

---

## Where Your Data Lives

All hub data is controlled by two variables in `~/citinet-hub/.env`:

```env
DATA_DIR=./data         # database
FILES_DIR=./data/storage  # uploaded user files (MinIO)
```

By default both point to subdirectories under `~/citinet-hub/data/`. You can point either to any path — a different drive, an external HDD, a network share.

**To move your database to a new drive:**

```bash
docker compose -f ~/citinet-hub/docker-compose.yml down
sudo rsync -aHAX ~/citinet-hub/data/db /mnt/new-drive/citinet/db
nano ~/citinet-hub/.env   # set DATA_DIR=/mnt/new-drive/citinet
docker compose -f ~/citinet-hub/docker-compose.yml up -d
```

**To move file storage to a different drive (or a network share):**

See [remote-file-storage.md](./remote-file-storage.md) for the full guide.

---

## Accessing the Hub

| From | URL |
|---|---|
| Hub machine | `http://localhost:9090` |
| Local network | `http://<hub-ip>:9090` |
| LAN hostname (if configured in router DNS) | `http://citinet:9090` |
| Anywhere (Tailscale Funnel) | `https://<machine>.<tailnet>.ts.net` |

### Making the Hub Reachable at `citinet:9090` on Your LAN

Quick reference: [router-dns-quick-reference.md](./router-dns-quick-reference.md)

1. **Set a static IP on the hub machine** (via NetworkManager, router reservation, or dhcpcd)
2. **Add a DNS entry in your router**: `citinet` → the hub's IP

After this, any device on your LAN can reach the hub at `http://citinet:9090` — no IP address needed.

---

## Common Commands

All commands assume you're on the hub machine. Prefix paths with the full path if running remotely.

```bash
# View live API logs
docker compose -f ~/citinet-hub/docker-compose.yml logs -f citinet-api

# Stop hub
docker compose -f ~/citinet-hub/docker-compose.yml down

# Start hub
docker compose -f ~/citinet-hub/docker-compose.yml up -d

# Check health
curl -s http://localhost:9090/health

# Update to latest API version
docker compose -f ~/citinet-hub/docker-compose.yml pull citinet-api
docker compose -f ~/citinet-hub/docker-compose.yml up -d --force-recreate citinet-api

# Check container status
docker compose -f ~/citinet-hub/docker-compose.yml ps
```

---

## Troubleshooting

**`citinet-api` shows `unhealthy`**

Check the healthcheck target. On Alpine Linux, `localhost` resolves to IPv6 `[::1]` but Node.js listens on IPv4. The `docker-compose.yml` must use `127.0.0.1` in the healthcheck, not `localhost`.

```bash
docker compose -f ~/citinet-hub/docker-compose.yml logs citinet-api
```

**Port 9090 already in use**

Change `API_PORT` in `.env` (e.g. `API_PORT=9091`) and restart.

**File uploads fail when using a network share for `FILES_DIR`**

If the remote PC or NAS is offline, uploads and downloads will fail — but login and all other features still work. The API and database are unaffected.

**Services keep restarting**

Check for misconfigured passwords in `.env` (no blank values for `DB_PASSWORD`, `JWT_SECRET`, etc.).

```bash
docker compose -f ~/citinet-hub/docker-compose.yml logs
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
docker compose -f ~/citinet-hub/docker-compose.yml up -d citinet-backup
```

Because it re-packages the entire storage directory every run (not incrementally), a
hub with a large amount of uploaded file content will see backups that take
proportionally longer and use real CPU/disk I/O while running — expected, not a bug,
and why this runs once a day rather than more often.

### Restoring from a backup

```bash
# Database
gunzip -c db-YYYYMMDD-HHMMSS.sql.gz | docker exec -i citinet-db psql -U citinet citinet

# Files (stop the hub first so nothing writes to storage mid-restore)
docker compose -f ~/citinet-hub/docker-compose.yml down
tar -xzf storage-YYYYMMDD-HHMMSS.tar.gz -C "$FILES_DIR"
docker compose -f ~/citinet-hub/docker-compose.yml up -d
```

### Manual backup, if you want one outside the daily schedule

```bash
docker compose -f ~/citinet-hub/docker-compose.yml down
sudo rsync -aHAX ~/citinet-hub/data/ /backup/citinet-$(date +%Y%m%d)/
docker compose -f ~/citinet-hub/docker-compose.yml up -d
```

