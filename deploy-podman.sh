#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Virtualfactor IT CMDB — Podman deployment helper
#
# Usage:
#   ./deploy-podman.sh up        Build images and start the whole stack
#   ./deploy-podman.sh down      Stop and remove the stack
#   ./deploy-podman.sh restart   Restart the stack
#   ./deploy-podman.sh build     Build backend + frontend images only
#   ./deploy-podman.sh logs      Follow logs of all services
#   ./deploy-podman.sh ps        Show running containers
#   ./deploy-podman.sh reset     Clear stale containers + pgadmin volume, then up
#                                (NEVER deletes the pgdata / database volume)
#   ./deploy-podman.sh quadlet   Install Quadlet units for rootless systemd
#
# Requires: podman 4.x+ and (for the compose sub-commands) either
#   `podman compose` (built-in) or the `podman-compose` python package.
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")"

# Pick whichever compose front-end is available
if podman compose version >/dev/null 2>&1; then
    COMPOSE="podman compose"
elif command -v podman-compose >/dev/null 2>&1; then
    COMPOSE="podman-compose"
else
    COMPOSE=""
fi

COMPOSE_FILE="podman-compose.yml"

ensure_env() {
    if [[ ! -f .env ]]; then
        echo "No .env found — creating one from .env.example"
        cp .env.example .env
        echo ">>> Edit .env to set your passwords, then re-run this script."
    fi
}

require_compose() {
    if [[ -z "$COMPOSE" ]]; then
        echo "ERROR: Neither 'podman compose' nor 'podman-compose' is available."
        echo "Install one of them, or use the Quadlet path:  ./deploy-podman.sh quadlet"
        exit 1
    fi
}

# Force-remove any leftover stack containers so a fresh `up` cannot collide with
# the "container name is already in use" error. Safe: containers are stateless;
# all persistent data lives in named volumes.
clean_stale_containers() {
    echo ">>> Removing any stale stack containers..."
    # Remove by fixed name AND by project-name filter, so half-created
    # containers left behind by a failed compose run are also cleared.
    podman rm -f vf_cmdb_db vf_cmdb_backend vf_cmdb_frontend vf_cmdb_pgadmin \
        >/dev/null 2>&1 || true
    local ids
    ids="$(podman ps -aq --filter 'name=vf_cmdb_' 2>/dev/null || true)"
    if [[ -n "$ids" ]]; then
        podman rm -f $ids >/dev/null 2>&1 || true
    fi
}

# Remove the pgadmin volume(s) that can end up duplicated and break
# podman-compose ("more than one result for volume name ...").
# This ONLY touches pgadmin (UI settings) — never pgdata (the database).
fix_pgadmin_volume() {
    echo ">>> Clearing pgadmin volume(s) (database volume is left untouched)..."
    # Cover every prefix/separator spelling that the compose and Quadlet paths
    # may have produced. pgAdmin data is just UI settings and is disposable.
    for v in vf-cmdb_pgadmin vf-cmdb-pgadmin vf_cmdb_pgadmin; do
        # Repeat once: a corrupted store can register the same name twice
        # ("more than one result for volume name"), so a single rm is not enough.
        podman volume rm -f "$v" >/dev/null 2>&1 || true
        podman volume rm -f "$v" >/dev/null 2>&1 || true
    done
    # If podman still reports duplicate/ambiguous volume entries, rebuild the
    # storage index. This is non-destructive (it does not delete volume data).
    if podman volume ls 2>&1 | grep -q pgadmin && \
       ! podman volume inspect vf-cmdb_pgadmin >/dev/null 2>&1; then
        echo ">>> Rebuilding podman storage index (podman system renumber)..."
        podman system renumber >/dev/null 2>&1 || true
        for v in vf-cmdb_pgadmin vf-cmdb-pgadmin vf_cmdb_pgadmin; do
            podman volume rm -f "$v" >/dev/null 2>&1 || true
        done
    fi
}

case "${1:-}" in
    up)
        ensure_env
        require_compose
        clean_stale_containers
        $COMPOSE -f "$COMPOSE_FILE" up -d --build
        echo
        echo "Stack is starting. The backend runs migrations + seeding on first boot."
        echo "  Web UI    : http://localhost:${FRONTEND_PORT:-8080}"
        echo "  API docs  : http://localhost:${BACKEND_PORT:-8000}/docs"
        echo "  pgAdmin   : http://localhost:${PGADMIN_PORT:-5050}"
        ;;
    down)
        require_compose
        $COMPOSE -f "$COMPOSE_FILE" down
        ;;
    restart)
        require_compose
        $COMPOSE -f "$COMPOSE_FILE" down || true
        clean_stale_containers
        $COMPOSE -f "$COMPOSE_FILE" up -d --build
        ;;
    reset)
        # Recover from the "container name already in use" / "more than one
        # result for volume name" state. Removes stack containers and the
        # pgadmin volume, then brings the stack back up. The database volume
        # (pgdata) is preserved.
        ensure_env
        require_compose
        $COMPOSE -f "$COMPOSE_FILE" down || true
        clean_stale_containers
        fix_pgadmin_volume
        $COMPOSE -f "$COMPOSE_FILE" up -d --build
        echo
        echo "Stack reset complete."
        echo "  Web UI    : http://localhost:${FRONTEND_PORT:-8080}"
        echo "  API docs  : http://localhost:${BACKEND_PORT:-8000}/docs"
        echo "  pgAdmin   : http://localhost:${PGADMIN_PORT:-5050}"
        ;;
    build)
        podman build -t localhost/vf_cmdb_backend:latest ./backend
        podman build -t localhost/vf_cmdb_frontend:latest ./frontend
        echo "Images built: localhost/vf_cmdb_backend:latest, localhost/vf_cmdb_frontend:latest"
        ;;
    logs)
        require_compose
        $COMPOSE -f "$COMPOSE_FILE" logs -f
        ;;
    ps)
        podman ps --filter "name=vf_cmdb_"
        ;;
    quadlet)
        ensure_env
        echo "Building images for Quadlet/systemd deployment..."
        podman build -t localhost/vf_cmdb_backend:latest ./backend
        podman build -t localhost/vf_cmdb_frontend:latest ./frontend

        DEST="${HOME}/.config/containers/systemd"
        mkdir -p "$DEST"
        cp deploy/quadlet/*.container deploy/quadlet/*.network deploy/quadlet/*.volume "$DEST"/
        echo "Installed Quadlet units to $DEST"

        systemctl --user daemon-reload
        systemctl --user start vf-cmdb-db.service vf-cmdb-backend.service \
                               vf-cmdb-frontend.service vf-cmdb-pgadmin.service
        echo
        echo "Services started via systemd (user). Enable lingering to survive logout:"
        echo "  loginctl enable-linger \$USER"
        echo "  Web UI    : http://localhost:8080"
        echo "  API docs  : http://localhost:8000/docs"
        echo "  pgAdmin   : http://localhost:5050"
        ;;
    *)
        grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'
        exit 1
        ;;
esac
