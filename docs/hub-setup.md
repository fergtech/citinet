# Hub Operator Setup Guide

How to get a CitiNet hub running on your hardware, what to expect, and how to manage it day-to-day.

---

## What a Hub Is

A hub is four Docker containers running as a single unit:

```
citinet-api       (port 9090)  — API, auth, posts, messages, files, atlas
citinet-db        (internal)   — PostgreSQL 16 — all structured data
citinet-storage   (internal)   — MinIO — file and media object storage
citinet-redis     (internal)   — Redis — sessions and cache
```

Everything lives in a directory on a drive you choose. Moving the hub to a different drive means changing one line in a file and restarting.

---

## Prerequisites

- Docker Desktop (Windows/macOS) or Docker Engine + Compose v2 (Linux)
- At least 2 GB free RAM and 5 GB disk space
- A machine that stays on while the hub is in use (a Raspberry Pi, mini PC, old laptop — anything works)

---

## Part 1 — Create the Hub

1. Open the CitiNet web portal (or `http://localhost:5173` if running locally)
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

Navigate to `http://localhost:9090` (or your hub's LAN/tunnel URL).

The first account you register on the hub becomes the **admin**. Sign up with whatever username and password you want.

---

## Where Your Data Lives

All hub data is controlled by two variables in `~/citinet-hub/.env`:

```env
DATA_DIR=./data         # database and cache
FILES_DIR=./data/storage  # uploaded user files (MinIO)
```

By default both point to subdirectories under `~/citinet-hub/data/`. You can point either to any path — a different drive, an external HDD, a network share.

**To move your database to a new drive:**

```bash
docker compose -f ~/citinet-hub/docker-compose.yml down
sudo rsync -aHAX ~/citinet-hub/data/db /mnt/new-drive/citinet/db
sudo rsync -aHAX ~/citinet-hub/data/redis /mnt/new-drive/citinet/redis
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
| LAN hostname (if configured) | `http://citinet:9090` |
| Anywhere (Tailscale Funnel) | `https://<machine>.<tailnet>.ts.net` |

### Making the Hub Reachable at `citinet:9090` on Your LAN

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

The safest backup approach: stop the hub, copy `DATA_DIR` and `FILES_DIR` to a backup location, then restart.

```bash
docker compose -f ~/citinet-hub/docker-compose.yml down
sudo rsync -aHAX ~/citinet-hub/data/ /backup/citinet-$(date +%Y%m%d)/
docker compose -f ~/citinet-hub/docker-compose.yml up -d
```

Database-only backup (without stopping):

```bash
docker exec citinet-db pg_dump -U citinet citinet > backup-$(date +%Y%m%d).sql
```
