#!/bin/bash
# Updates this Citinet hub to the latest version.
#
# What it does:
#   1. Pulls the latest code from GitHub
#   2. Builds or pulls the hub API image (auto-detects arm64 vs amd64)
#   3. Restarts all hub services with the new image
#
# Run as: citinet update

set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$HOME/citinet-hub/docker-compose.yml"
IMAGE="ghcr.io/fergtech/citinet-api:latest"
ARCH="$(uname -m)"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
BOLD='\033[1m'; RESET='\033[0m'

step() { echo -e "\n${BOLD}──▶ $*${RESET}"; }
ok()   { echo -e "${GREEN}  ✔  $*${RESET}"; }
fail() { echo -e "${RED}  ✘  $*${RESET}"; }

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}  Citinet Hub — Update${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

# ── 1. Pull latest code ───────────────────────────────────────────────────────
step "Pulling latest code"
git -C "$REPO_DIR" pull origin master
ok "Code is up to date"

# ── 2. Build or pull image ────────────────────────────────────────────────────
if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
  step "Building image for arm64 (Raspberry Pi)"
  echo "  This takes a few minutes — the image is built locally because"
  echo "  the published image is for x86 PCs only."
  echo ""
  docker build \
    --platform linux/arm64 \
    -t "$IMAGE" \
    -f "$REPO_DIR/api/Dockerfile" \
    "$REPO_DIR"
  ok "Image built"
else
  step "Pulling latest image"
  docker compose -f "$COMPOSE_FILE" pull citinet-api
  ok "Image pulled"
fi

# ── 3. Restart all hub services ───────────────────────────────────────────────
step "Restarting hub services"
docker compose -f "$COMPOSE_FILE" up -d --force-recreate \
  citinet-api citinet-db citinet-redis citinet-mdns

# ── 4. Wait for healthy ───────────────────────────────────────────────────────
step "Waiting for hub to be ready"
for i in $(seq 1 24); do
  STATUS=$(docker inspect --format '{{.State.Health.Status}}' citinet-api 2>/dev/null || echo "unknown")
  if [ "$STATUS" = "healthy" ]; then
    ok "Hub is up and healthy"
    echo ""
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo -e "${GREEN}${BOLD}  Update complete.${RESET}"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo ""
    exit 0
  fi
  printf "  Waiting… (%ds)\r" "$((i * 5))"
  sleep 5
done

echo ""
fail "Hub did not become healthy within 2 minutes."
echo "  Check logs with:  docker logs citinet-api --tail 50"
exit 1
