#!/bin/bash
# Pulls the latest citinet codebase and updates the running hub image.
#
# On amd64: pulls the pre-built image from GHCR.
# On arm64 (e.g. Raspberry Pi): GHCR publishes amd64-only, so we build
# the image locally from the Dockerfile instead.
#
# Run from anywhere — the script locates its own repo root.

set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$HOME/citinet-hub/docker-compose.yml"
IMAGE="ghcr.io/fergtech/citinet-api:latest"
ARCH="$(uname -m)"

echo "==> Pulling latest codebase"
git -C "$REPO_DIR" pull origin master

if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    echo "==> arm64 detected — building image locally (GHCR image is amd64-only)"
    docker buildx build \
        --platform linux/arm64 \
        -t "$IMAGE" \
        -f "$REPO_DIR/api/Dockerfile" \
        "$REPO_DIR"
else
    echo "==> amd64 detected — pulling image from GHCR"
    docker pull "$IMAGE"
fi

echo "==> Restarting citinet-api"
docker compose -f "$COMPOSE_FILE" up -d citinet-api

echo "==> Waiting for health check"
for i in $(seq 1 12); do
    STATUS=$(docker inspect --format '{{.State.Health.Status}}' citinet-api 2>/dev/null || echo "unknown")
    if [ "$STATUS" = "healthy" ]; then
        echo "==> citinet-api is healthy"
        exit 0
    fi
    echo "    ($i/12) status: $STATUS — waiting 5s"
    sleep 5
done

echo "ERROR: citinet-api did not become healthy within 60s"
docker logs citinet-api --tail 30
exit 1
