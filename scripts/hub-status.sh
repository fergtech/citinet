#!/bin/bash
# Shows a friendly summary of this hub's health and software version.
# Run as: citinet status

COMPOSE_FILE="$HOME/citinet-hub/docker-compose.yml"
ENV_FILE="$HOME/citinet-hub/.env"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colours
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'

ok()   { echo -e "  ${GREEN}✔${RESET}  $*"; }
fail() { echo -e "  ${RED}✘${RESET}  $*"; }
warn() { echo -e "  ${YELLOW}⚠${RESET}  $*"; }

# Load hub identity from .env
HUB_NAME="unknown"; TUNNEL_URL=""
if [ -f "$ENV_FILE" ]; then
  HUB_NAME=$(grep '^HUB_NAME=' "$ENV_FILE" | cut -d= -f2- | tr -d '"')
  TUNNEL_URL=$(grep '^TUNNEL_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '"')
fi

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}  Citinet Hub — ${HUB_NAME}${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

# ── Services ─────────────────────────────────────────────────────────────────
echo -e "${BOLD}  Services${RESET}"

check_container() {
  local name=$1 label=$2
  if ! docker inspect "$name" &>/dev/null; then
    fail "$label   ${RED}not found${RESET}"
    return
  fi
  local state health uptime
  state=$(docker inspect --format '{{.State.Status}}' "$name" 2>/dev/null)
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}—{{end}}' "$name" 2>/dev/null)
  uptime=$(docker inspect --format '{{.State.StartedAt}}' "$name" 2>/dev/null)

  # Human-readable uptime
  if [ -n "$uptime" ] && command -v python3 &>/dev/null; then
    age=$(python3 -c "
from datetime import datetime, timezone
import sys
t = datetime.fromisoformat('${uptime}'.replace('Z','+00:00'))
d = datetime.now(timezone.utc) - t
s = int(d.total_seconds())
if s < 3600: print(f'{s//60}m')
elif s < 86400: print(f'{s//3600}h')
else: print(f'{s//86400}d')
" 2>/dev/null)
  fi

  if [ "$state" = "running" ] && { [ "$health" = "healthy" ] || [ "$health" = "—" ]; }; then
    ok "$(printf '%-16s' "$label")  ${DIM}up ${age:-?}${RESET}"
  elif [ "$state" = "running" ] && [ "$health" = "starting" ]; then
    warn "$(printf '%-16s' "$label")  ${YELLOW}starting…${RESET}"
  else
    fail "$(printf '%-16s' "$label")  ${RED}${state} / ${health}${RESET}"
  fi
}

check_container citinet-api     "API"
check_container citinet-db      "Database"
check_container citinet-storage "Storage"
check_container citinet-redis   "Cache"
check_container citinet-mdns    "mDNS"

# ── Storage mount ─────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}  Storage${RESET}"
if mountpoint -q /mnt/remote-files 2>/dev/null; then
  FREE=$(df -h /mnt/remote-files 2>/dev/null | awk 'NR==2{print $4}')
  ok "Remote drive mounted   ${DIM}${FREE} free${RESET}"
else
  warn "Remote drive not mounted   ${DIM}(file uploads unavailable)${RESET}"
fi

# ── Network ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}  Access${RESET}"
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo -e "  ${DIM}Local:${RESET}      http://citinet:9090"
[ -n "$LOCAL_IP" ] && echo -e "  ${DIM}IP:${RESET}         http://${LOCAL_IP}:9090"
if [ -n "$TUNNEL_URL" ]; then
  echo -e "  ${DIM}Tailscale:${RESET}  ${TUNNEL_URL}"
fi

# ── Software version ──────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}  Software${RESET}"

# Git status
if git -C "$REPO_DIR" rev-parse HEAD &>/dev/null; then
  LOCAL=$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null)
  git -C "$REPO_DIR" fetch origin master --quiet 2>/dev/null
  REMOTE=$(git -C "$REPO_DIR" rev-parse --short origin/master 2>/dev/null)
  if [ "$LOCAL" = "$REMOTE" ]; then
    ok "Code                   ${DIM}up to date (${LOCAL})${RESET}"
  else
    warn "Code                   ${YELLOW}update available${RESET} ${DIM}(local: ${LOCAL} → latest: ${REMOTE})${RESET}"
    echo -e "       ${DIM}Run: citinet update${RESET}"
  fi
fi

# Image build date
IMAGE_DATE=$(docker inspect ghcr.io/fergtech/citinet-api:latest \
  --format '{{.Created}}' 2>/dev/null | cut -c1-10)
IMAGE_ARCH=$(docker inspect ghcr.io/fergtech/citinet-api:latest \
  --format '{{.Architecture}}' 2>/dev/null)
if [ -n "$IMAGE_DATE" ]; then
  ok "Image                  ${DIM}built ${IMAGE_DATE} (${IMAGE_ARCH})${RESET}"
fi

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
