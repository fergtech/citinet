#!/usr/bin/env bash
# citinet — one command for looking after this hub.
#
# Lives in the hub's own folder (next to docker-compose.yml), so there are no
# paths to remember:   ./citinet.sh <command>
#
#   status            what is running, and is it healthy
#   diagnose          check everything that commonly goes wrong; says what to run next
#   fix               safe repair: start anything that should be running (never touches data)
#   logs [svc] [-f]   recent logs for one service (or all); -f to follow
#   restart [svc|all] restart a service (default: all)
#   start | stop      start / stop the whole hub
#   update [svc]      update to the latest version: backs up first, can roll back
#   rollback [svc]    go back to the version from before the last update
#   backup-now        take a backup right now
#   restore-test      prove the newest backup can really be restored
#   support-bundle    collect logs + settings (secrets removed) into one zip to send for help
#   info              where things live
#
# Services: api db storage caddy backup admin livekit ollama
set -u

HERE="${CITINET_HUB_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
cd "$HERE" || exit 1

# ── output helpers ──────────────────────────────────────────────────────────
if [ -t 1 ]; then R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; B=$'\033[1m'; D=$'\033[2m'; N=$'\033[0m'; else R=; G=; Y=; B=; D=; N=; fi
die()  { echo "${R}✗ $*${N}" >&2; exit 1; }
say()  { echo "$*"; }
head1() { echo; echo "${B}$*${N}"; }

[ -f docker-compose.yml ] || die "No docker-compose.yml in $HERE — run this from your hub's folder."
command -v docker >/dev/null 2>&1 || die "Docker is not installed or not on PATH."
if docker compose version >/dev/null 2>&1; then DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then DC="docker-compose"
else die "Neither 'docker compose' nor 'docker-compose' is available."; fi

env_get() { [ -f .env ] && grep -E "^$1=" .env | tail -1 | cut -d= -f2- | tr -d '\r' || true; }
HUB_NAME="$(env_get HUB_NAME)"; API_PORT="$(env_get API_PORT)"; API_PORT="${API_PORT:-9090}"

# Accept "api" or "citinet-api".
norm() { case "$1" in citinet-*) echo "$1";; *) echo "citinet-$1";; esac; }
all_services() { $DC config --services 2>/dev/null | sort; }
has_service() { all_services | grep -qx "$1"; }
cid() { $DC ps -aq "$1" 2>/dev/null | head -1; }
state_of() { docker inspect -f '{{.State.Status}}' "$1" 2>/dev/null; }
health_of() { docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$1" 2>/dev/null; }

need_docker() { docker info >/dev/null 2>&1 || die "Docker isn't running. Start Docker Desktop (Windows/Mac) or run: sudo systemctl start docker"; }

# ── address pre-flight ──────────────────────────────────────────────────────
# docker-compose.yml can publish the API on this machine's LAN / Tailscale address (${LAN_IP},
# ${TAILSCALE_IP} from .env). If that address has gone (moved Ethernet→Wi-Fi, DHCP changed it,
# Tailscale logged out) Docker can't bind it and the API never starts, with only a cryptic
# "can't bind on the specified endpoint". Catch it first and say what to do.
local_ips() {
  if command -v ip >/dev/null 2>&1; then ip -4 -o addr show 2>/dev/null | awk '{split($4,a,"/"); print a[1]}'
  elif command -v ifconfig >/dev/null 2>&1; then ifconfig 2>/dev/null | awk '/inet /{sub("addr:","",$2); print $2}'
  elif command -v hostname >/dev/null 2>&1; then hostname -I 2>/dev/null | tr ' ' '\n'; fi
}
# One "FATAL|NAME|value" (compose publishes on it) or "WARN|NAME|value" per stale address.
# Prints nothing when everything is fine, or when the machine's addresses can't be read.
addr_problems() {
  ips="$(local_ips | grep -E '^[0-9]' || true)"; [ -n "$ips" ] || return 0
  for name in LAN_IP TAILSCALE_IP; do
    val="$(env_get "$name")"; val="${val%\"}"; val="${val#\"}"; [ -n "$val" ] || continue
    echo "$ips" | grep -qxF "$val" && continue
    if grep -qF "\${$name}:" docker-compose.yml; then echo "FATAL|$name|$val"; else echo "WARN|$name|$val"; fi
  done
}
addr_hint() {
  case "$1" in
    TAILSCALE_IP) echo "Is Tailscale logged in? Check with: tailscale ip -4 — then set TAILSCALE_IP in .env";;
    *) echo "Check your current address (ip addr, or ifconfig) and set LAN_IP in .env";;
  esac
}
# Gate for commands that (re)create containers. Returns 1 (after explaining) if one can't start.
preflight_addrs() {
  rc=0
  while IFS='|' read -r lvl name val; do
    [ -n "$lvl" ] || continue
    if [ "$lvl" = FATAL ]; then
      rc=1
      echo "${R}✗ $name=$val (in $HERE/.env) is not an address on this machine, and docker-compose.yml publishes the API on it.${N}" >&2
      echo "  Addresses present now: $(local_ips | grep -E '^[0-9]' | grep -v '^127\.' | tr '\n' ' ')" >&2
      echo "  $(addr_hint "$name")" >&2
    else
      say "${Y}!${N} $name=$val is not an address on this machine (not fatal here, but anything using it is stale). $(addr_hint "$name")"
    fi
  done <<EOF
$(addr_problems)
EOF
  [ "$rc" -eq 0 ] || { echo "  Fix that, then re-run this command." >&2; return 1; }
}

# ── status ──────────────────────────────────────────────────────────────────
cmd_status() {
  need_docker
  head1 "${HUB_NAME:-Hub} — containers"
  printf '  %-18s %-11s %-10s %s\n' SERVICE STATE HEALTH SINCE
  for s in $(all_services); do
    c="$(cid "$s")"
    if [ -z "$c" ]; then printf '  %-18s %s\n' "$s" "${R}not created${N}"; continue; fi
    st="$(state_of "$c")"; h="$(health_of "$c")"; since="$(docker inspect -f '{{.State.StartedAt}}' "$c" | cut -c1-19 | tr T ' ')"
    col="$G"; [ "$st" != "running" ] && col="$R"; [ "$h" = "unhealthy" ] && col="$R"
    printf '  %-18s %s%-11s%s %-10s %s\n' "$s" "$col" "$st" "$N" "${h:--}" "$since"
  done
  head1 "Hub API"
  if out="$(curl -fsS -m 5 "http://127.0.0.1:${API_PORT}/health" 2>/dev/null)"; then say "  ${G}✓ answering on port ${API_PORT}${N} ${D}${out:0:80}${N}"
  else say "  ${R}✗ not answering on port ${API_PORT}${N}  → run: ./citinet.sh diagnose"; fi
}

# ── diagnose ────────────────────────────────────────────────────────────────
PASS=0; WARN=0; FAIL=0
ok()   { PASS=$((PASS+1)); say "  ${G}✓${N} $1"; }
warn() { WARN=$((WARN+1)); say "  ${Y}!${N} $1"; [ -n "${2:-}" ] && say "      ${D}→ ${2}${N}"; }
bad()  { FAIL=$((FAIL+1)); say "  ${R}✗${N} $1"; [ -n "${2:-}" ] && say "      ${D}→ ${2}${N}"; }

cmd_diagnose() {
  need_docker
  head1 "Settings"
  if [ ! -f .env ]; then bad ".env is missing" "Re-run your hub's setup script to recreate it"; else
    missing=""; for k in DB_PASSWORD JWT_SECRET STORAGE_ACCESS_KEY STORAGE_SECRET_KEY; do [ -z "$(env_get $k)" ] && missing="$missing $k"; done
    [ -z "$missing" ] && ok ".env has its required secrets" || bad ".env has blank values:$missing" "Blank passwords make services restart forever — restore them from your setup script/password manager"
    while IFS='|' read -r lvl name val; do
      [ -n "$lvl" ] || continue
      if [ "$lvl" = FATAL ]; then bad "$name=$val is not an address on this machine, and the compose file publishes the API on it — the API can't start" "$(addr_hint "$name"), then ./citinet.sh fix"
      else warn "$name=$val is not an address on this machine, so anything using it is stale" "$(addr_hint "$name")"; fi
    done <<EOF
$(addr_problems)
EOF
  fi

  head1 "Containers"
  for s in $(all_services); do
    c="$(cid "$s")"
    if [ -z "$c" ]; then bad "$s was never created" "./citinet.sh fix"; continue; fi
    st="$(state_of "$c")"; h="$(health_of "$c")"
    rc="$(docker inspect -f '{{.RestartCount}}' "$c")"; err="$(docker inspect -f '{{.State.Error}}' "$c")"; code="$(docker inspect -f '{{.State.ExitCode}}' "$c")"
    if [ "$st" = "running" ] && [ "$h" = "unhealthy" ]; then bad "$s is running but failing its health check" "./citinet.sh logs ${s#citinet-}"
    elif [ "$st" = "running" ] && [ "${rc:-0}" -ge 5 ]; then warn "$s has restarted $rc times" "./citinet.sh logs ${s#citinet-}"
    elif [ "$st" = "running" ]; then ok "$s is running"
    elif [ "$st" = "restarting" ]; then bad "$s is stuck restarting" "./citinet.sh logs ${s#citinet-}"
    else bad "$s is $st${err:+ ($err)}${code:+ — exit code $code}" "./citinet.sh fix   (then ./citinet.sh logs ${s#citinet-} if it keeps stopping)"; fi
  done

  head1 "Network"
  if curl -fsS -m 5 "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then ok "API answers on port ${API_PORT}"; else bad "API does not answer on port ${API_PORT}" "./citinet.sh logs api"; fi
  cs="$(state_of "$(cid citinet-caddy)")"
  if [ "$cs" != "running" ] && has_service citinet-caddy; then
    for p in 443 80; do
      holder=""
      if command -v ss >/dev/null 2>&1; then holder="$(ss -ltnp 2>/dev/null | grep -E "[:.]$p " | head -1)"
      elif command -v lsof >/dev/null 2>&1; then holder="$(lsof -nP -iTCP:$p -sTCP:LISTEN 2>/dev/null | sed -n 2p)"
      elif command -v netstat >/dev/null 2>&1; then holder="$(netstat -ano 2>/dev/null | grep -E "[:.]$p .*LISTEN" | head -1)"; fi
      [ -n "$holder" ] && warn "Port $p is already in use by something else: ${holder:0:100}" "Stop that program (or another hub using this port), then: ./citinet.sh fix"
    done
  fi

  head1 "Disk & backups"
  dataroot="$(env_get FILES_DIR)"; dataroot="${dataroot:-./data}"; [ -d "$dataroot" ] || dataroot="."
  use="$(df -Pk "$dataroot" 2>/dev/null | awk 'NR==2{gsub("%","",$5);print $5}')"
  freegb="$(df -Pk "$dataroot" 2>/dev/null | awk 'NR==2{printf "%.0f",$4/1048576}')"
  if [ -n "${use:-}" ]; then
    if [ "$use" -ge 95 ]; then bad "Disk is ${use}% full (${freegb} GB free)" "Free space now — a full disk stops the database and uploads"
    elif [ "$use" -ge 85 ]; then warn "Disk is ${use}% full (${freegb} GB free)" "Plan to free space or move the data folder"
    else ok "Disk has room (${use}% used, ${freegb} GB free)"; fi
  fi
  # Ask the backup container itself — the folder's host path differs between hubs/OSes.
  bc="$(cid citinet-backup)"
  if [ -n "$bc" ] && [ "$(state_of "$bc")" = running ]; then
    n_all="$($DC exec -T citinet-backup sh -c "ls /backups/db-*.sql.gz 2>/dev/null | wc -l" 2>/dev/null | tr -d '\r ')"
    n_new="$($DC exec -T citinet-backup sh -c "find /backups -maxdepth 1 -name 'db-*.sql.gz' -mtime -2 2>/dev/null | wc -l" 2>/dev/null | tr -d '\r ')"
    if [ "${n_new:-0}" -gt 0 ]; then ok "A database backup exists from the last 2 days (${n_all} kept)"
    elif [ "${n_all:-0}" -gt 0 ]; then warn "Newest database backup is older than 2 days" "./citinet.sh backup-now   (then ./citinet.sh logs backup)"
    else warn "No database backups found yet" "./citinet.sh backup-now"; fi
  elif has_service citinet-backup; then bad "Backup service is not running, so nothing is being backed up" "./citinet.sh fix"
  else warn "This hub has no backup service" "Re-run the hub setup script to add one"; fi
  [ -n "$(env_get RESTIC_REPOSITORY)" ] && ok "Off-site backup is configured" || warn "Off-site backup is not set up" "Local backups can't help if this machine is lost — see Hub Management → Off-site Backup"

  head1 "Summary"
  say "  ${G}$PASS ok${N}   ${Y}$WARN to look at${N}   ${R}$FAIL problems${N}"
  if [ "$FAIL" -gt 0 ]; then say; say "  Most problems clear with:  ${B}./citinet.sh fix${N}"; say "  Still stuck? Run ${B}./citinet.sh support-bundle${N} and send the zip to whoever is helping you."; fi
  [ "$FAIL" -eq 0 ]
}

# ── fix ─────────────────────────────────────────────────────────────────────
cmd_fix() {
  need_docker
  preflight_addrs || { echo; cmd_diagnose; exit 1; }
  say "Starting anything that should be running (your data is never touched)…"
  $DC up -d 2>&1 | sed 's/^/  /'
  echo; cmd_diagnose
}

# ── logs / restart / start / stop ───────────────────────────────────────────
cmd_logs() {
  need_docker; svc=""; follow=""; n=150
  while [ $# -gt 0 ]; do case "$1" in -f|--follow) follow="-f";; -n) shift; n="${1:-150}";; *) svc="$(norm "$1")";; esac; shift; done
  if [ -n "$svc" ]; then has_service "$svc" || die "No such service: $svc (try: $(all_services | sed 's/citinet-//' | tr '\n' ' '))"; fi
  $DC logs --tail "$n" $follow ${svc:+$svc}
}
cmd_restart() {
  need_docker; t="${1:-all}"
  if [ "$t" = all ]; then say "Restarting every service…"; $DC restart; else svc="$(norm "$t")"; has_service "$svc" || die "No such service: $svc"; say "Restarting $svc…"; $DC restart "$svc"; fi
}
cmd_start() { need_docker; preflight_addrs || exit 1; $DC up -d; }
cmd_stop() {
  need_docker; read -r -p "Stop the whole hub? Members will be disconnected. [y/N] " a; case "$a" in y|Y|yes) $DC stop;; *) say "Cancelled.";; esac
}

# ── backups ─────────────────────────────────────────────────────────────────
backup_now() {
  has_service citinet-backup || { say "  (no backup service on this hub)"; return 1; }
  say "Taking a backup now (the backup service runs one the moment it starts)…"
  since="$(date -u +%Y-%m-%dT%H:%M:%S)"
  $DC restart citinet-backup >/dev/null 2>&1 || return 1
  for i in $(seq 1 60); do
    sleep 3
    out="$($DC logs --since "$since" citinet-backup 2>&1)"
    if echo "$out" | grep -q "\[backup\] db ok"; then say "  ${G}✓ database backup done${N}"; echo "$out" | grep -q "storage ok" && say "  ${G}✓ file backup done${N}"; echo "$out" | grep -q "off-site (restic) ok" && say "  ${G}✓ off-site copy done${N}"; return 0; fi
    echo "$out" | grep -q "\[backup\] db FAILED" && { say "  ${R}✗ database backup failed:${N}"; echo "$out" | grep -A3 "db FAILED" | sed 's/^/    /'; return 1; }
  done
  say "  ${Y}!${N} Still running after 3 minutes — check: ./citinet.sh logs backup"; return 1
}
cmd_backup_now() { need_docker; backup_now; }

sidecar_call() { # METHOD PATH — through citinet-api, which already holds the sidecar token
  $DC exec -T citinet-api sh -c "wget -qO- --header=\"x-admin-token: \$ADMIN_SIDECAR_TOKEN\" ${1:+--post-data=''} http://citinet-admin:7070$2" 2>/dev/null
}
cmd_restore_test() {
  need_docker
  has_service citinet-admin || die "This hub has no citinet-admin service — run: ./citinet.sh update admin"
  say "Starting a restore test (loads the newest backup into a throwaway database)…"
  r="$(sidecar_call POST /drill)" || true
  echo "$r" | grep -q started || { echo "$r" | grep -q "already running" && say "  One is already running — waiting for it." || die "Could not start it: ${r:-no answer from citinet-admin}. Is it up to date? Try: ./citinet.sh update admin"; }
  for i in $(seq 1 90); do
    sleep 4; h="$(sidecar_call "" /health)"
    echo "$h" | grep -q '"running":true' && continue
    echo "$h" | grep -q '"lastRunAt":"' || continue
    echo "$h" | sed -n 's/.*"drill":\({.*}\).*/\1/p' | head -c 900; echo
    echo "$h" | grep -q '"drill":{"running":false,"lastRunAt":"[^"]*","ok":true' && { say "${G}✓ Backups restore correctly.${N}"; return 0; }
    say "${R}✗ A restore failed — details above.${N}"; return 1
  done
  say "Taking longer than expected — see Hub Management → System for the result."
}

# ── update / rollback ───────────────────────────────────────────────────────
DEFAULT_UPDATE="citinet-api citinet-admin"
img_of() { $DC config 2>/dev/null | awk -v s="$1:" '$1==s{f=1;next} f&&/^  [a-z]/{f=0} f&&$1=="image:"{print $2;exit}'; }
local_id() { docker image inspect -f '{{.Id}}' "$1" 2>/dev/null; }

wait_healthy() { # service seconds
  c="$(cid "$1")"; end=$((SECONDS+$2))
  while [ $SECONDS -lt $end ]; do
    st="$(state_of "$c")"; h="$(health_of "$c")"
    if [ "$st" = running ] && { [ -z "$h" ] || [ "$h" = healthy ]; }; then sleep 2; [ "$(state_of "$c")" = running ] && return 0; fi
    sleep 3
  done; return 1
}

cmd_update() {
  need_docker; dry=0; targets=""
  for a in "$@"; do case "$a" in --dry-run) dry=1;; *) targets="$targets $(norm "$a")";; esac; done
  [ -z "$targets" ] && targets="$DEFAULT_UPDATE"
  ts="$(date +%Y%m%d-%H%M%S)"
  head1 "Update plan"
  plan=""
  for s in $targets; do
    has_service "$s" || { say "  - $s: not part of this hub, skipping"; continue; }
    img="$(img_of "$s")"; [ -z "$img" ] && { say "  - $s: no image to pull, skipping"; continue; }
    say "  - $s  ($img)"; plan="$plan $s"
  done
  [ -z "$plan" ] && die "Nothing to update."
  [ "$dry" = 1 ] && { say; say "Dry run — nothing was changed."; return 0; }
  preflight_addrs || die "Update cancelled — nothing changed."

  head1 "1/4  Backing up first"
  backup_now || { read -r -p "  Backup did not finish cleanly. Continue the update anyway? [y/N] " a; case "$a" in y|Y) ;; *) die "Update cancelled — nothing changed.";; esac; }

  head1 "2/4  Saving the current version (so you can roll back)"
  for s in $plan; do img="$(img_of "$s")"; repo="${img%:*}"; [ -n "$(local_id "$img")" ] && docker tag "$img" "$repo:rollback-$ts" && say "  saved $repo:rollback-$ts"; done

  head1 "3/4  Downloading the new version"
  changed=""
  for s in $plan; do
    img="$(img_of "$s")"; before="$(local_id "$img")"
    $DC pull "$s" 2>&1 | tail -2 | sed 's/^/  /'
    after="$(local_id "$img")"
    if [ "$before" = "$after" ]; then say "  $s is already the latest"; else changed="$changed $s"; fi
  done
  [ -z "$changed" ] && { say; say "${G}Everything is already up to date.${N}"; return 0; }

  head1 "4/4  Restarting the updated services"
  for s in $changed; do $DC up -d --no-deps "$s" 2>&1 | sed 's/^/  /'; done
  failed=""
  for s in $changed; do
    if wait_healthy "$s" 120; then say "  ${G}✓ $s is healthy${N}"; else say "  ${R}✗ $s did not become healthy${N}"; failed="$failed $s"; fi
  done
  if [ -n "$failed" ]; then
    say; say "${R}The new version did not start properly — going back to the previous one.${N}"
    cmd_rollback $(for f in $failed; do echo "${f#citinet-}"; done); return 1
  fi
  say; say "${G}✓ Updated: ${changed# }${N}"
  # keep the 3 newest rollback tags per image, drop the rest
  for s in $changed; do img="$(img_of "$s")"; repo="${img%:*}"; docker images --format '{{.Repository}}:{{.Tag}}' | grep "^$repo:rollback-" | sort -r | tail -n +4 | xargs -r docker rmi >/dev/null 2>&1; done
}

cmd_rollback() {
  need_docker; targets=""; for a in "$@"; do targets="$targets $(norm "$a")"; done; [ -z "$targets" ] && targets="$DEFAULT_UPDATE"
  preflight_addrs || return 1
  for s in $targets; do
    has_service "$s" || continue; img="$(img_of "$s")"; repo="${img%:*}"
    prev="$(docker images --format '{{.Repository}}:{{.Tag}}' | grep "^$repo:rollback-" | sort -r | head -1)"
    if [ -z "$prev" ]; then say "  ${Y}!${N} $s: no saved previous version to go back to"; continue; fi
    docker tag "$prev" "$img" && $DC up -d --no-deps --force-recreate "$s" 2>&1 | sed 's/^/  /'
    if wait_healthy "$s" 120; then say "  ${G}✓ $s is back on $prev${N}"; else say "  ${R}✗ $s still unhealthy after rollback — run: ./citinet.sh logs ${s#citinet-}${N}"; fi
  done
}

# ── support bundle ──────────────────────────────────────────────────────────
redact() { sed -E \
  -e 's/((PASS(WORD)?|SECRET|TOKEN|KEY|CERT_SECRET|REPOSITORY|SMTP_[A-Z]*|ACCESS_KEY_ID|USERNAME)[A-Z_]*=).*/\1***removed***/I' \
  -e 's/(Bearer )[A-Za-z0-9._~+\/=-]+/\1***removed***/g' \
  -e 's/("(password|pass|token|secret|authorization)"[[:space:]]*:[[:space:]]*")[^"]*/\1***removed***/Ig'; }

cmd_support_bundle() {
  need_docker; out="citinet-support-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$out"
  say "Collecting information (secrets are removed)…"
  { echo "Hub: ${HUB_NAME:-?} ($(env_get HUB_SLUG))"; date -u; uname -a 2>/dev/null; docker version --format 'Docker {{.Server.Version}}' 2>/dev/null; $DC version 2>/dev/null; } > "$out/system.txt"
  cmd_status 2>&1 | sed 's/\x1b\[[0-9;]*m//g' > "$out/status.txt"
  cmd_diagnose 2>&1 | sed 's/\x1b\[[0-9;]*m//g' > "$out/diagnose.txt"
  [ -f .env ] && redact < .env > "$out/env-redacted.txt"
  redact < docker-compose.yml > "$out/docker-compose-redacted.yml"
  for s in $(all_services); do $DC logs --tail 300 "$s" 2>&1 | redact > "$out/log-${s#citinet-}.txt"; done
  if command -v zip >/dev/null 2>&1; then zip -qr "$out.zip" "$out" && rm -rf "$out" && say "${G}✓ Created $out.zip${N}"
  else tar -czf "$out.tar.gz" "$out" && rm -rf "$out" && say "${G}✓ Created $out.tar.gz${N}"; fi
  say "  Passwords, keys and tokens were removed, but skim it before sharing publicly."
}

# ── info ────────────────────────────────────────────────────────────────────
cmd_info() {
  head1 "${HUB_NAME:-Hub}"
  say "  Folder:        $HERE"
  say "  Address:       $(env_get TUNNEL_URL)"
  say "  Local API:     http://127.0.0.1:${API_PORT}"
  say "  Files:         $(env_get FILES_DIR)"
  say "  Backups:       $(env_get BACKUP_DIR)"
  [ -n "$(env_get RESTIC_REPOSITORY)" ] && say "  Off-site:      configured" || say "  Off-site:      not set up"
}

cmd_help() { sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; }

c="${1:-help}"; [ $# -gt 0 ] && shift
case "$c" in
  status) cmd_status;; diagnose|doctor|check) cmd_diagnose;; fix|repair) cmd_fix;;
  logs) cmd_logs "$@";; restart) cmd_restart "$@";; start|up) cmd_start;; stop|down) cmd_stop;;
  update|upgrade) cmd_update "$@";; rollback) cmd_rollback "$@";;
  backup-now|backup) cmd_backup_now;; restore-test) cmd_restore_test;;
  support-bundle|bundle) cmd_support_bundle;; info) cmd_info;;
  help|-h|--help) cmd_help;; *) echo "Unknown command: $c"; echo; cmd_help; exit 1;;
esac
