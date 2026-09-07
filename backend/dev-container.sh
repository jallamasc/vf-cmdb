#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Phase 6 Task 22 (Req 9.1) — Containerized backend dev loop.
#
# Problem: app/stencil_library.py shells out to `vss2svg-conv` to convert
# imported Visio stencils. That binary is built from source in Containerfile
# and is ONLY present inside the built image — running bare `uvicorn` on the
# host (the flow in this README's "Local development (without containers)"
# section) always returns a 503 on stencil conversion.
#
# This script runs the backend INSIDE the Containerfile-built image with a
# live-reload dev loop, while still talking to whatever Postgres container
# you already run for local dev (defaults match the ad-hoc `postgres:16`
# container most contributors start by hand for day-to-day work; see the
# main README's "Local development" section for how that gets started).
#
# NOTE on bind mounts: Podman on macOS runs containers inside a small VM
# that only shares the host's default paths (your home directory, /tmp,
# etc.) into it. If your checkout lives outside those default shares (e.g.
# on a secondary/external volume such as /Volumes/...), a normal
# `-v hostpath:containerpath` bind mount fails with a
# "no such file or directory" error even though the path is real on the
# host, because the VM itself can't see it. Recreating the Podman machine
# to add that mount would wipe its disk — every existing container and
# volume, including your dev Postgres data — so this script never does
# that automatically. Instead it detects the situation and falls back to a
# `podman cp` + fswatch push loop, which gives the same "edit on host, the
# backend inside the container picks it up and reloads" result without
# touching your Podman machine's configuration.
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_TAG="${DEV_IMAGE:-vf-cmdb-backend-dev}"
CONTAINER="${DEV_CONTAINER:-vf_cmdb_backend_dev}"
NETWORK="${DEV_NETWORK:-vf_cmdb_devnet}"
PG_CONTAINER="${PG_CONTAINER:-vf_cmdb_dev}"
PG_DB="${POSTGRES_DB:-vfcmdb}"
PG_USER="${POSTGRES_USER:-vfcmdb}"
PG_PASSWORD="${POSTGRES_PASSWORD:-vfcmdb}"
HOST_PORT="${DEV_BACKEND_PORT:-8001}"
CORS_ORIGINS="${CORS_ORIGINS:-*}"

usage() {
  cat <<EOF
Usage: $0 [up|down|logs]

  up     (default) Build the image if needed, wire up networking to your
         existing Postgres dev container, and start the containerized dev
         backend with a live-reload loop for backend/app/. Serves
         http://localhost:${HOST_PORT}.
  down   Stop and remove the dev container. Leaves the shared network and
         your Postgres/Semaphore containers untouched.
  logs   Follow the dev container's logs.

Env overrides: PG_CONTAINER, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD,
DEV_BACKEND_PORT, CORS_ORIGINS.
EOF
}

cmd="${1:-up}"

case "$cmd" in
  down)
    podman rm -f "$CONTAINER" >/dev/null 2>&1 || true
    echo "Removed $CONTAINER (network '$NETWORK' and '$PG_CONTAINER' left running)."
    exit 0
    ;;
  logs)
    exec podman logs -f "$CONTAINER"
    ;;
  up) ;;
  -h|--help)
    usage; exit 0;;
  *)
    usage; exit 1;;
esac

if ! podman image exists "$IMAGE_TAG" 2>/dev/null; then
  echo "==> Building $IMAGE_TAG from backend/Containerfile (bakes in vss2svg-conv)..."
  podman build -t "$IMAGE_TAG" -f "$SCRIPT_DIR/Containerfile" "$SCRIPT_DIR"
fi

podman network exists "$NETWORK" 2>/dev/null || podman network create "$NETWORK" >/dev/null
if ! podman network inspect "$NETWORK" --format '{{range $k,$v := .Containers}}{{$v.Name}} {{end}}' 2>/dev/null | grep -qw "$PG_CONTAINER"; then
  echo "==> Attaching $PG_CONTAINER to $NETWORK so the dev backend can reach it by name..."
  podman network connect "$NETWORK" "$PG_CONTAINER"
fi

podman rm -f "$CONTAINER" >/dev/null 2>&1 || true

# Detect whether a bind mount of this checkout is actually usable inside the
# Podman machine VM (see the header comment above) before committing to it.
BIND_MOUNT_OK=1
podman run --rm -v "$SCRIPT_DIR/app:/probe:Z" alpine:3.20 true >/dev/null 2>&1 || BIND_MOUNT_OK=0

RUN_ARGS=(-d --name "$CONTAINER" --network "$NETWORK" -p "${HOST_PORT}:8000"
  -e POSTGRES_HOST="$PG_CONTAINER" -e POSTGRES_PORT=5432
  -e POSTGRES_USER="$PG_USER" -e POSTGRES_PASSWORD="$PG_PASSWORD" -e POSTGRES_DB="$PG_DB"
  -e CORS_ORIGINS="$CORS_ORIGINS")

if [ "$BIND_MOUNT_OK" = "1" ]; then
  echo "==> Bind mount is usable — mounting backend/app live."
  RUN_ARGS+=(-v "$SCRIPT_DIR/app:/app/app:Z")
else
  echo "==> This checkout's path isn't shared into the Podman machine VM."
  echo "    Falling back to a podman-cp + fswatch sync loop for live reload."
fi

podman run "${RUN_ARGS[@]}" "$IMAGE_TAG" \
  sh -c 'alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload'

echo "==> Waiting for $CONTAINER to report healthy..."
for _ in $(seq 1 30); do
  curl -sf "http://127.0.0.1:${HOST_PORT}/health" >/dev/null 2>&1 && break
  sleep 1
done
if curl -sf "http://127.0.0.1:${HOST_PORT}/health" >/dev/null 2>&1; then
  echo "==> Backend is up at http://127.0.0.1:${HOST_PORT}"
else
  echo "==> WARNING: backend did not report healthy in time — check: podman logs $CONTAINER"
fi

if [ "$BIND_MOUNT_OK" = "0" ]; then
  if ! command -v fswatch >/dev/null 2>&1; then
    echo "==> fswatch not found (brew install fswatch) — re-run this script after edits to pick them up."
    exit 0
  fi
  echo "==> Watching backend/app/ for changes (Ctrl-C stops watching; the container keeps running)."
  podman cp "$SCRIPT_DIR/app/." "$CONTAINER:/app/app"
  fswatch -o "$SCRIPT_DIR/app" | while read -r _; do
    podman cp "$SCRIPT_DIR/app/." "$CONTAINER:/app/app"
    echo "  synced $(date '+%H:%M:%S')"
  done
fi
