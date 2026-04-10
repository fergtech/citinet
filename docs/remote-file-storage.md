# Remote File Storage for CitiNet Hubs

How to move MinIO file storage off the hub machine onto a remote drive on another PC on your LAN.
Postgres and Redis stay local — only uploaded user files move to the remote machine.

---

## Prerequisites

- CitiNet hub running on a Raspberry Pi (Linux)
- A Windows or Linux PC on the same LAN with a spare HDD
- Both machines on the same subnet (e.g. `192.168.1.x`)

---

## Part 1 — Set up the Windows PC

### 1. Create the folder

On the HDD (e.g. `H:`), create a folder for this hub's files:

```
H:\citinet\<hub-name>-files
```

Use a unique folder per hub if you have multiple hubs.

### 2. Create a dedicated Windows user

- Open **Computer Management** → Local Users and Groups → Users
- Right-click → **New User**
  - Username: `citinet`
  - Password: something strong
  - Uncheck "User must change password at next logon"
  - Check "Password never expires"
- Click **Create**

### 3. Share the folder

- Right-click the folder → **Properties** → **Sharing** → **Advanced Sharing**
- Check **Share this folder**
- Share name: `<hub-name>-files` (e.g. `hub1-files`)
- Click **Permissions** → Add the `citinet` user → grant **Full Control**

### 4. Set NTFS permissions

- Still in folder Properties → **Security** tab → **Edit**
- Add the `citinet` user → grant **Full Control**

### 5. Enable network sharing on Windows

- Settings → Network & Internet → **Advanced sharing settings**
- Turn on **Network discovery**
- Turn on **File and printer sharing**

### 6. Note the PC's LAN IP

Run in cmd:

```cmd
ipconfig
```

Note the `192.168.1.x` address — you'll need it on the Pi.

---

## Part 2 — Set up the Raspberry Pi

### 1. Install CIFS support

```bash
sudo apt install -y cifs-utils
```

### 2. Create a mount point

```bash
sudo mkdir -p /mnt/remote-files
```

### 3. Store credentials securely

```bash
sudo nano /etc/citinet-smb-credentials
```

Paste the following — replace with your actual password:

```
username=citinet
password=YOUR_PASSWORD
domain=DESKTOP-XXXXXXX
```

Lock down the file:

```bash
sudo chmod 600 /etc/citinet-smb-credentials
```

### 4. Test the mount

Replace `192.168.1.X` with the Windows PC's IP and `hub1-files` with your share name:

```bash
sudo mount -t cifs //192.168.1.X/hub1-files /mnt/remote-files \
  -o credentials=/etc/citinet-smb-credentials,uid=0,gid=0,file_mode=0777,dir_mode=0777
```

Confirm it mounted:

```bash
ls /mnt/remote-files
```

### 5. Add to fstab for automount on boot

```bash
sudo nano /etc/fstab
```

Add this line at the bottom (one line, replace values):

```
//192.168.1.X/hub1-files  /mnt/remote-files  cifs  credentials=/etc/citinet-smb-credentials,uid=0,gid=0,file_mode=0777,dir_mode=0777,_netdev,nofail  0  0
```

> `_netdev` — waits for network before mounting (important on boot)
> `nofail` — Pi still boots normally if the Windows PC is off

---

## Part 3 — Migrate the hub

### 1. Stop only the affected containers

```bash
cd ~/citinet-hub
docker compose stop citinet-api citinet-storage
```

### 2. Copy existing MinIO data to the remote share

```bash
sudo rsync -aHAX /mnt/citinet-storage/citinet-hub/data/storage/ /mnt/remote-files/
```

> Adjust the source path if your hub uses a different `DATA_DIR`.
> Check your current MinIO volume path with:
> `docker inspect citinet-storage --format '{{range .Mounts}}{{.Source}}{{end}}'`

### 3. Add FILES_DIR to .env

```bash
nano ~/citinet-hub/.env
```

Add at the bottom:

```env
# Files Directory — MinIO user file storage (remote network share)
FILES_DIR=/mnt/remote-files
```

### 4. Update docker-compose.yml

Find the `citinet-storage` volumes section and change the bind mount to use `FILES_DIR`:

```yaml
citinet-storage:
  ...
  volumes:
    - ${FILES_DIR}:/data
```

### 5. Start everything back up

```bash
docker compose up -d
```

### 6. Verify

```bash
# API should be healthy
curl -s http://localhost:9090/health

# MinIO should be reading from the remote share
docker inspect citinet-storage --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{end}}'
```

Expected output:
```
{"status":"ok","version":"0.2.0"}
/mnt/remote-files -> /data
```

---

## Result

| Service | Data location |
|---|---|
| Postgres (database) | Local Pi — `DATA_DIR/db` |
| Redis (cache) | Local Pi — `DATA_DIR/redis` |
| MinIO (user files) | Remote PC — `FILES_DIR` via SMB |

---

## Changing the remote location later

1. Stop the hub: `docker compose down`
2. Copy data to new location: `sudo rsync -aHAX /mnt/remote-files/ /mnt/new-location/`
3. Update `FILES_DIR=` in `~/citinet-hub/.env`
4. Update `/etc/fstab` to mount the new share
5. Start the hub: `docker compose up -d`

---

## Rollback

If something goes wrong, point FILES_DIR back to the local path:

1. Edit `~/citinet-hub/.env` — set `FILES_DIR` back to the original local path
2. `docker compose up -d`

Data in Postgres (users, posts, file metadata) is untouched — only the raw file objects live on the remote share.

---

## Notes

- If the Windows PC is off, file uploads/downloads will fail — the API and login will still work
- Use one unique share folder per hub to avoid mixing object stores
- For Linux-to-Linux, replace CIFS with NFS — generally faster and more reliable for container workloads
