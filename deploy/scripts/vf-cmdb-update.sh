#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Virtualfactor IT CMDB — Auto-update script
#
# Idempotent, safe, self-healing update routine intended to run unattended
# from vf-cmdb-update.timer (systemd) OR by hand.
#
# What it does:
#   1. Takes a pre-update database backup (safety net for rollback)
#   2. Fetches the tracked git branch and checks whether anything changed
#   3. If code changed: pulls, rebuilds the affected images, restarts services
#   4. Refreshes external base images (postgres / pgadmin) via podman auto-update
#   5. Verifies the stack is healthy afterwards; rolls back the code on failure
#
# Configuration (env or /etc/default style not needed — uses sane defaults):
#   REPO_DIR      (default ~/vf-cmdb)
#   UPDATE_BRANCH (default master)
#   SKIP_BACKUP=1 to skip the pre-update backup
#
# Exit codes: 0 = up-to-date or updated OK, 1 = error/rolled back.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/vf-cmdb}"
UPDATE_BRANCH="${UPDATE_BRANCH:-master}"
HEALTH_URL="${HEALTH_URL:-http://localhost:8000/health}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:8080}"

log() { echo "[update $(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die() { echo "[update ERROR] $*" >&2; exit 1; }

cd "$REPO_DIR" || die "Repo dir $REPO_DIR not found"

SVC=(vf-cmdb-db.service vf-cmdb-backend.service vf-cmdb-frontend.service vf-cmdb-pgadmin.service)

restart_services() {
    systemctl --user daemon-reload
    systemctl --user restart "${SVC[@]}"
}

wait_healthy() {
    local tries=30
    log "Waiting for backend health at $HEALTH_URL ..."
    while (( tries-- > 0 )); do
        if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
            log "Backend healthy."
            return 0
        fi
        sleep 3
    done
    return 1
}

# --- 0. Pre-flight ---------------------------------------------------------
command -v git >/dev/null    || die "git not installed"
command -v podman >/dev/null || die "podman not installed"

CURRENT="$(git rev-parse HEAD)"
log "Current commit: $CURRENT (branch: $(git rev-parse --abbrev-ref HEAD))"

# --- 1. Pre-update backup (safety net) -------------------------------------
if [[ "${SKIP_BACKUP:-0}" != "1" && -x "$REPO_DIR/deploy/scripts/vf-cmdb-backup.sh" ]]; then
    log "Taking pre-update backup..."
    "$REPO_DIR/deploy/scripts/vf-cmdb-backup.sh" || log "WARN: pre-update backup failed (continuing)"
fi

# --- 2. Detect code changes ------------------------------------------------
log "Fetching origin/$UPDATE_BRANCH ..."
git fetch --quiet origin "$UPDATE_BRANCH"
REMOTE="$(git rev-parse "origin/$UPDATE_BRANCH")"

CODE_UPDATED=0
if [[ "$CURRENT" != "$REMOTE" ]]; then
    log "New commit available: $REMOTE"
    # Determine which parts changed to rebuild only what's needed
    CHANGED="$(git diff --name-only "$CURRENT" "$REMOTE")"
    log "Applying update..."
    git merge --ff-only "origin/$UPDATE_BRANCH" || die "Fast-forward merge failed (local divergence). Resolve manually."
    CODE_UPDATED=1

    REBUILD_BACKEND=0; REBUILD_FRONTEND=0
    grep -q '^backend/'  <<<"$CHANGED" && REBUILD_BACKEND=1
    grep -q '^frontend/' <<<"$CHANGED" && REBUILD_FRONTEND=1
    # Quadlet unit changes require reinstalling units
    if grep -q '^deploy/quadlet/' <<<"$CHANGED"; then
        log "Quadlet units changed — reinstalling..."
        cp deploy/quadlet/*.container deploy/quadlet/*.network deploy/quadlet/*.volume \
            "$HOME/.config/containers/systemd/" 2>/dev/null || true
    fi

    if (( REBUILD_BACKEND )); then
        log "Rebuilding backend image..."
        podman build -t localhost/vf_cmdb_backend:latest ./backend
    fi
    if (( REBUILD_FRONTEND )); then
        log "Rebuilding frontend image..."
        podman build -t localhost/vf_cmdb_frontend:latest ./frontend
    fi
    if (( ! REBUILD_BACKEND && ! REBUILD_FRONTEND )); then
        log "No backend/frontend source changes — config/docs only."
    fi
else
    log "Code already up-to-date."
fi

# --- 3. Refresh external base images --------------------------------------
# Pull newer postgres:16 / pgadmin4:latest if published; podman auto-update
# restarts only containers whose image digest actually changed.
BASE_UPDATED=0
if systemctl --user list-unit-files 'podman-auto-update*' >/dev/null 2>&1; then
    log "Checking base image updates (podman auto-update)..."
    if podman auto-update --dry-run 2>/dev/null | grep -qi 'pending'; then
        podman auto-update || log "WARN: podman auto-update reported issues"
        BASE_UPDATED=1
    fi
fi

# --- 4. Restart if anything changed ---------------------------------------
if (( CODE_UPDATED || BASE_UPDATED )); then
    log "Restarting services..."
    restart_services
    if ! wait_healthy; then
        log "Health check FAILED after update — rolling back code to $CURRENT"
        git reset --hard "$CURRENT"
        [[ -d backend ]]  && podman build -t localhost/vf_cmdb_backend:latest ./backend  || true
        [[ -d frontend ]] && podman build -t localhost/vf_cmdb_frontend:latest ./frontend || true
        restart_services
        wait_healthy && log "Rollback succeeded." || die "Rollback health check also failed — manual intervention needed."
        die "Update rolled back due to failed health check."
    fi
    log "Update applied successfully. Now at $(git rev-parse HEAD)"
else
    log "Nothing to update."
fi
