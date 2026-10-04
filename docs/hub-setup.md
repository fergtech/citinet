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

## Moving a member's account to another hub

Nobody is locked in to a hub. A member can take their account with them:

1. **On the old hub** — Account → *Your Data* → **Move to another hub**. Choose what locks the file
   (their recovery phrase — the default — or a package password), keep *Include my encryption keys*
   ticked, and press **Create portable package**. They get one encrypted `.citinet-account` file.
2. **On the new hub** — sign up as usual (the hub's admin approves new members), then
   Account → *Your Data* → **Bring an account from another hub**: pick the file, enter the same
   phrase/password, choose what to bring over, and import.

What comes over, and how:

| Item | On the new hub |
|---|---|
| Encryption identity (keys) | Kept, if the new account has no encrypted content yet — and the *same recovery phrase* keeps working. If the account already has notes/messages/files, its own keys are kept (replacing them would make that content unreadable) and everything imported is re-encrypted with them |
| Profile, notes, files + folders, settings | Restored as **private** |
| Posts | Restored as **private** posts (so old posts don't flood the new feed) — share the ones you want. Polls can't be recreated |
| Old conversations | Saved as one **private note** per conversation (they can't be put back into other people's inboxes) |
| Atlas pins, marketplace page + listings | **Opt-in** (unticked by default) — they would appear on the new hub's public map/market |
| Saved pins/listings/posts, replies, likes, RSVPs, vendor pictures | Not carried — they refer to things on the old hub |

The package is encrypted (Argon2id-derived key, AES-256-GCM, tamper- and truncation-detecting), because it holds
everything about the account: anyone with the file *and* the phrase/password can open it, so treat it like a
password and delete it once the move is confirmed. Nothing is changed or removed on the old hub.
Very large accounts are limited by browser memory (individual files over 150 MB are skipped and listed).

---

## Everyday Commands — the `citinet` helper

Every hub has a small helper in its own folder (next to `docker-compose.yml`) so you never
have to remember Docker flags or paths. Open a terminal **in your hub's folder** and run:

| Windows (PowerShell) | Mac / Linux | When to use it |
|---|---|---|
| `.\citinet.ps1 diagnose` | `./citinet.sh diagnose` | **Start here** when anything seems wrong. Checks settings, every container, the API, ports, disk space and backups, and tells you the next command to run for each problem |
| `.\citinet.ps1 fix` | `./citinet.sh fix` | After a restart or power cut — starts anything that should be running. Never touches your data |
| `.\citinet.ps1 status` | `./citinet.sh status` | What's running, and is it healthy |
| `.\citinet.ps1 logs api` | `./citinet.sh logs api` | What a service is saying. Add `-f` to watch live. Services: `api db storage caddy backup admin livekit ollama` |
| `.\citinet.ps1 update` | `./citinet.sh update` | Install the latest version. **Backs up first**, saves the old version, and rolls back by itself if the new one won't start |
| `.\citinet.ps1 rollback` | `./citinet.sh rollback` | An update made things worse — go back to the version you had before |
| `.\citinet.ps1 backup-now` | `./citinet.sh backup-now` | Take a backup right now (e.g. before moving the hub to a new drive) |
| `.\citinet.ps1 restore-test` | `./citinet.sh restore-test` | Prove the newest backup really restores (into a throwaway database) |
| `.\citinet.ps1 restart [service]` | `./citinet.sh restart [service]` | Restart one service, or everything |
| `.\citinet.ps1 support-bundle` | `./citinet.sh support-bundle` | Need help? Makes one zip of logs and settings with passwords, keys and tokens removed. Skim it before sharing |
| `.\citinet.ps1 info` | `./citinet.sh info` | Where this hub's folder, address and data live |

Hub Management → **System** → *If something goes wrong* shows the same list with copy buttons
and your hub's exact folder filled in. Windows blocking scripts? Run it as
`powershell -ExecutionPolicy Bypass -File .\citinet.ps1 diagnose`.

**Hub created before this helper existed?** Run this once in the hub's folder (it's served by
your own hub — nothing is downloaded from anywhere else), then use the commands above:

```bash
# Mac / Linux
curl -fsSL http://localhost:9090/api/tools/citinet.sh -o citinet.sh && chmod +x citinet.sh
```
```powershell
# Windows
Invoke-WebRequest http://localhost:9090/api/tools/citinet.ps1 -OutFile citinet.ps1
```

(Needs a hub image from after this feature shipped; if it answers "does not include the helper
scripts", update the hub first, or copy `scripts/hub-tools/` from the repository.)

### The raw Docker commands, if you ever want them

The helper is a convenience, not a requirement — these still work, from the hub's folder:

```bash
docker compose logs -f citinet-api                 # live API logs
docker compose ps                                  # container status
docker compose stop   /   docker compose up -d     # stop / start the hub
docker compose pull citinet-api && docker compose up -d --force-recreate citinet-api   # update the API
curl -s http://localhost:9090/health               # health check
```

### For whoever builds the images (not hub owners)

From a checkout of the repository, on the hub machine: `.\scripts\deploy-hub.ps1` builds, pushes
and rolls out **both** images a hub runs (`citinet-api` and the `citinet-admin` sidecar), saves a
rollback tag first, waits for health, and verifies each container is really running the image it
just built. `-Service api|admin`, `-NoPush` and `-DryRun` are available; it warns if you deploy
one image while files belonging to the other have changed. `scripts\rebuild-hub-api.ps1` still
works (API only).

---

## Troubleshooting

**Start with `./citinet.sh diagnose` (Windows: `.\citinet.ps1 diagnose`).** It runs the checks below
for you and prints the exact next command for anything it finds — see
[Everyday Commands](#everyday-commands--the-citinet-helper). The notes here explain what the
common problems mean.

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

**This does not fully protect against**: the machine itself dying, being lost, stolen,
or its disk failing — `BACKUP_DIR` defaults to a subfolder of the same `DATA_DIR` the
live database lives in, so a dead disk takes both down together. Pointing `BACKUP_DIR`
at a different physical drive or a mounted external/network volume in `.env` (then
restart) helps, but a drive on the same machine still dies with it in a fire/theft/
total-machine-loss scenario — for real protection against *losing the machine itself*,
see **Off-site backup** below.

```bash
docker compose -f ~/citinet-hub-<hub-slug>/docker-compose.yml up -d citinet-backup
```

Because it re-packages the entire storage directory every run (not incrementally), a
hub with a large amount of uploaded file content will see backups that take
proportionally longer and use real CPU/disk I/O while running — expected, not a bug,
and why this runs once a day rather than more often.

### Off-site backup (optional, protects against losing the machine itself)

The local backup above (and even a `BACKUP_DIR` on a second local drive) is still on
the same machine — it protects against bad data, not a lost/destroyed/stolen machine.
`citinet-backup` can also push nightly, client-side-*encrypted*, *incremental* backups
to any remote you control, using [restic](https://restic.net). This is opt-in and off
by default; nothing changes for hubs that don't configure it.

**Easiest path**: in the web portal, go to **Hub Management → Off-site Backup**. Pick a
provider, fill in the bucket/keys (or generate a passphrase for you), and it hands you a
small script to download and run once — it only ever touches the off-site-backup lines
in `.env` (never `DB_PASSWORD`, `JWT_SECRET`, or anything else in that file) and
restarts `citinet-backup` for you. Nothing here routes through Citinet's own servers —
the script runs entirely in your browser and on your own machine. The rest of this
section is the manual/advanced path, for anyone who'd rather edit `.env` by hand.

**Setup** — pick any restic-supported destination, then add to `.env`. Two ready-made
examples (either works with the in-app form above too):

```env
# Backblaze B2 -- cheap, simple
RESTIC_REPOSITORY=b2:your-bucket-name:<hub-slug>
RESTIC_PASSWORD=choose-a-strong-passphrase-and-store-it-elsewhere
B2_ACCOUNT_ID=your-b2-key-id
B2_ACCOUNT_KEY=your-b2-application-key
```

```env
# Cloudflare R2 -- free egress, cheaper to restore from. Create a bucket and an
# API token at dash.cloudflare.com -> R2; your account ID is shown on the same page.
# Uses restic's s3 backend under the hood (R2's API is S3-compatible), so the
# credential variable names are the standard AWS_* ones, not R2-specific.
RESTIC_REPOSITORY=s3:<account-id>.r2.cloudflarestorage.com/your-bucket-name/<hub-slug>
RESTIC_PASSWORD=choose-a-strong-passphrase-and-store-it-elsewhere
AWS_ACCESS_KEY_ID=your-r2-access-key-id
AWS_SECRET_ACCESS_KEY=your-r2-secret-access-key
AWS_DEFAULT_REGION=auto
```

S3, Wasabi, SFTP to another machine, Azure, and Google Cloud Storage all work too —
see [restic's backend docs](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html)
for repository string formats.

Then restart the container so it picks up the new variables:

```bash
docker compose -f ~/citinet-hub-<hub-slug>/docker-compose.yml up -d --force-recreate citinet-backup
```

Watch the first run's logs to confirm it connected:

```bash
docker logs -f citinet-backup-<hub-slug>
```

**`RESTIC_PASSWORD` encrypts every backup — restic itself never uploads plaintext, and
your remote (B2, S3, whoever) never sees the actual content.** If you lose this
password, the backups become permanently unreadable — save it in a password manager or
similar, never only in this `.env` file on the same machine you're trying to protect
against losing.

Any other restic backend works the same way — just set `RESTIC_REPOSITORY` to that
backend's URL and whatever credential variables it needs (`AWS_ACCESS_KEY_ID`/
`AWS_SECRET_ACCESS_KEY` for S3, etc.); they reach the container automatically since it
reads the whole `.env` file. See restic's own docs for the full list of backends.

### Restoring from an off-site (restic) backup

Useful when the original machine is gone entirely — run this from any machine with
Docker:

```bash
# Restore the latest snapshot's DB dump + files to a local folder
docker run --rm -it \
  -e RESTIC_REPOSITORY=b2:your-bucket-name:<hub-slug> \
  -e RESTIC_PASSWORD=your-passphrase \
  -e B2_ACCOUNT_ID=your-b2-key-id \
  -e B2_ACCOUNT_KEY=your-b2-application-key \
  -v "$(pwd)/restored:/restored" \
  restic/restic restore latest --target /restored

# Database: /restored/tmp/db-latest.sql
gunzip -c /restored/tmp/db-latest.sql 2>/dev/null || cat /restored/tmp/db-latest.sql | \
  docker exec -i citinet-db-<hub-slug> psql -U citinet citinet

# Files: copy the restored /restored/storage tree into a fresh hub's FILES_DIR
cp -a /restored/storage/. "$FILES_DIR/"
```

Run a fresh `citinet-setup.sh`/`citinet-setup.ps1` on the new machine first (same
hub slug) to get a working stack, stop it, restore into `DATA_DIR`/`FILES_DIR` as
above, then start it back up.

### Self-healing, backup checks and outage alerts

The `citinet-admin` container watches the rest of the stack. Hub Management → **System**
shows what it finds.

**Automatic recovery.** Every minute it checks each service. A service that is stopped
because it *failed* — never started (for example it lost a port-80/443 race during a
reboot), failed to start, ran out of memory, or exited with an error — is started again.
A service you stopped on purpose (`docker stop`, `docker compose stop`) is left alone.
If a service keeps stopping (4 restarts in 30 minutes) it stops retrying and raises a
critical alert instead of looping forever.

**Backup checks.** A backup file existing is not the same as being able to restore it, so:

| Check | How often | What it proves |
|---|---|---|
| Freshness | every 30 min | the newest database + file backup exist, aren't tiny, and are under 36 h old |
| Off-site | every 6 h (if configured) | restic reports a snapshot under 48 h old |
| **Restore test** | weekly, or "Run restore test now" | the newest backup loads into a **throwaway database** (no network, read-only access to the backups, never your live DB) and real tables + accounts come out. With off-site configured it also pulls the dump back from the remote first, so it proves the remote copy restores too |

**Email alerts.** Critical problems (a service down, backups stale, a failed restore test)
are emailed to hub admins who have an address on file. Your hub does not run a mail server —
it hands messages to an SMTP relay you already have (Gmail with an App Password, Brevo,
Resend, Mailgun, Amazon SES, Zoho, your domain host's SMTP…). Set it up in
Hub Management → **System** → **Email alerts**: pick your provider, paste the details, press
**Send test email** (it checks the settings *before* saving), then **Save**. No restart needed.
The password is stored encrypted in the hub's own database and is never shown again.
Hubs configured earlier through `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`
in `.env` keep working; settings saved in the UI take priority over them.

**Outage alert for "the whole machine is off".** A dead machine can't report itself, so the hub
checks in with an outside monitor instead. In Hub Management → **System** → **Outage alert**:

1. Run a monitor that is **not on this hub's machine** — [Uptime Kuma](https://github.com/louislam/uptime-kuma)
   on a Raspberry Pi / second hub / small VPS, or a free [Healthchecks.io](https://healthchecks.io) account.
   (A monitor on the same machine goes down with it and can't warn you.)
2. Create a **Push** monitor (Kuma) or a check (Healthchecks.io), set its interval to ≥ 2 minutes
   (this hub pings every minute), and add your email under its notifications.
3. Paste its ping URL into the card and press **Test & save**.

The hub pings it once a minute while its core services (database, storage, API, HTTPS) are
healthy; when the pings stop, *that service* emails you. The URL is stored encrypted on the hub,
changes apply within about 5 minutes with no restart, and nothing here depends on Citinet.
(`HEALTHCHECK_PING_URL` in `.env` still works as a fallback for hubs set up earlier.)

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

