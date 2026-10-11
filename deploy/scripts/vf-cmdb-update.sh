#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Virtualfactor IT CMDB — Auto-update script
#
# PRIMARY MODE (default): registry / pull-not-build.
#   Images are produced by CI and published to ghcr.io. This script does NOT
#   git-pull or `podman build`; it pulls the new images via `podman auto-update`
#   and restarts the Quadlet units. It is invoked by:
#     * vf-cmdb-update.path  (one-click: the backend writes a marker file that a
#       host-side systemd .path unit watches), and
#     * vf-cmdb-update.timer (daily scheduled refresh).
#   Both go through the same flock so they never overlap.
#
# LEGACY MODE (VF_UPDATE_MODE=source): the historical git-fetch + podman build
#   flow, kept for source-based hosts that build images locally.
#
# ---------------------------------------------------------------------------
# MIGRATION-CANNOT-BE-ROLLED-BACK CAVEAT (read before relying on "rollback"):
#   backend/entrypoint.sh runs `alembic upgrade head` on EVERY container start,
#   so the new schema is live the instant the new backend boots — even if the
#   health check then fails. Re-pulling the previous image does NOT undo a
#   migration (re-running `alembic upgrade head` against the already-migrated DB
#   is a no-op and never steps the schema back down). The ONLY true rollback is
#   restoring the pre-update database backup taken in step 1 via
#   deploy/scripts/vf-cmdb-restore.sh. This script therefore always takes the
#   backup first, never deletes it on failure, and does NOT attempt an automatic
#   image downgrade (which would be false comfort — the schema would not follow).
# ---------------------------------------------------------------------------
#
# Configuration (env):
#   VF_UPDATE_MODE  registry (default) | source
#   STATE_DIR       shared marker/status dir (default ~/vf-cmdb/state)
#   REPO_DIR        repo checkout (default ~/vf-cmdb) — source mode + unit paths
#   UPDATE_BRANCH   git branch to track in source mode (default master)
#   SKIP_BACKUP=1   skip the pre-update DB backup (not recommended)
#   --dry-run       write statuses but skip podman/systemctl (smoke test)
#
# Exit codes: 0 = updated / refreshed / already up-to-date, 1 = failed.
# ---------------------------------------------------------------------------
set -euo pipefail

VF_UPDATE_MODE="${VF_UPDATE_MODE:-registry}"
STATE_DIR="${STATE_DIR:-$HOME/vf-cmdb/state}"
REPO_DIR="${REPO_DIR:-$HOME/vf-cmdb}"
UPDATE_BRANCH="${UPDATE_BRANCH:-master}"
VERSION_URL="${VERSION_URL:-http://localhost:8000/api/v1/meta/version}"
HEALTH_URL="${HEALTH_URL:-http://localhost:8000/health}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:8080}"

DRY_RUN=0
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=1 ;;
    esac
done

# Status-file fields carried across write_status() calls.
STARTED_AT=""
FINISHED_AT=""
REQUESTED_VERSION="latest"

log() { echo "[update $(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# ---------------------------------------------------------------------------
# write_status STATE MESSAGE
#
# Emits EXACTLY the camelCase keys the backend _read_status (backend/app/
# updates.py) reads: {state, message, requestedVersion, startedAt, finishedAt}.
# A shell author would naturally reach for snake_case — a casing mismatch would
# make the UI status poll silently show stale/default fields, so these keys are
# pinned. Written with jq -n (never hand-rolled interpolation) + an atomic
# write-then-mv so a concurrent backend read never sees a half-written file.
# ---------------------------------------------------------------------------
write_status() {
    local state="$1" message="$2"
    jq -n \
        --arg state "$state" \
        --arg message "$message" \
        --arg requestedVersion "${REQUESTED_VERSION:-latest}" \
        --arg startedAt "${STARTED_AT:-}" \
        --arg finishedAt "${FINISHED_AT:-}" \
        '{state:$state, message:$message,
          requestedVersion:(if $requestedVersion=="" then null else $requestedVersion end),
          startedAt:(if $startedAt=="" then null else $startedAt end),
          finishedAt:(if $finishedAt=="" then null else $finishedAt end)}' \
        > "$STATE_DIR/update.status.tmp" \
        && mv "$STATE_DIR/update.status.tmp" "$STATE_DIR/update.status"
}

now_iso() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

# Mark the run failed, keep the marker removed to avoid a .path restart loop,
# never delete the backup, and exit non-zero.
fail() {
    FINISHED_AT="$(now_iso)"
    write_status "failed" "$1"
    log "FAILED: $1"
    rm -f "$STATE_DIR/update.request" 2>/dev/null || true
    exit 1
}

# ---------------------------------------------------------------------------
# Registry (pull-not-build) mode — the primary path the UI wires into.
# ---------------------------------------------------------------------------
run_registry_mode() {
    mkdir -p "$STATE_DIR"

    # 0a. Preflight: jq + curl must exist. jq is a NEW host dependency for the
    #     camelCase status writer and the version-advanced health check.
    if ! command -v curl >/dev/null 2>&1; then
        # Cannot query the registry / health endpoint without curl; log and bail.
        log "ERROR: curl not installed on host"
        exit 1
    fi
    if ! command -v jq >/dev/null 2>&1; then
        log "ERROR: jq not installed on host — cannot write status file"
        exit 1
    fi

    STARTED_AT="$(now_iso)"

    # 0b. Serialize runs — fail fast if an update is already in flight (double
    #     click, or the daily timer firing mid-click).
    exec 9>"$STATE_DIR/update.lock"
    if ! flock -n 9; then
        log "Another update is already running — exiting."
        exit 0
    fi

    # 1. Pre-update database backup (the ONLY true rollback — never deleted).
    write_status "running" "Taking pre-update database backup"
    if [[ "${SKIP_BACKUP:-0}" != "1" ]]; then
        if [[ -x "$REPO_DIR/deploy/scripts/vf-cmdb-backup.sh" ]]; then
            if (( DRY_RUN )); then
                log "[dry-run] would run vf-cmdb-backup.sh"
            elif ! "$REPO_DIR/deploy/scripts/vf-cmdb-backup.sh"; then
                fail "Pre-update backup failed; aborting before pulling images. See logs."
            fi
        else
            log "WARN: backup script not found/executable at $REPO_DIR/deploy/scripts/vf-cmdb-backup.sh"
        fi
    fi

    # 2. Capture the CURRENT version (before pulling).
    local CURRENT_VERSION=""
    CURRENT_VERSION="$(curl -fsS --max-time 3 "$VERSION_URL" 2>/dev/null | jq -r '.version' 2>/dev/null || true)"
    [[ -z "$CURRENT_VERSION" || "$CURRENT_VERSION" == "null" ]] && CURRENT_VERSION="unknown"
    log "Current version: $CURRENT_VERSION"

    # 3. Pull new images from ghcr.io. No build, no git pull. podman auto-update
    #    restarts only units whose image DIGEST actually changed.
    write_status "running" "Pulling new images"
    local AUTO_OUT=""
    if (( DRY_RUN )); then
        log "[dry-run] would run: podman auto-update"
    else
        AUTO_OUT="$(podman auto-update 2>&1 || true)"
        log "podman auto-update output:"
        log "$AUTO_OUT"
    fi

    # Did auto-update restart any unit? (non-empty restart set => a digest changed)
    local DIGEST_CHANGED=0
    if (( ! DRY_RUN )); then
        if printf '%s\n' "$AUTO_OUT" | grep -qiE 'vf-cmdb-(backend|frontend|db|pgadmin)'; then
            DIGEST_CHANGED=1
        fi
    fi

    # 4. Restart services (auto-update already restarts changed units, but a
    #    daemon-reload + explicit restart makes the outcome deterministic).
    write_status "running" "Restarting services"
    if (( DRY_RUN )); then
        log "[dry-run] would run: systemctl --user daemon-reload + restart units"
    else
        systemctl --user daemon-reload
        systemctl --user restart \
            vf-cmdb-db vf-cmdb-backend vf-cmdb-frontend vf-cmdb-pgadmin \
            2>/dev/null || log "WARN: a unit restart reported issues (continuing to health check)"
    fi

    # 5. Health-check the NEW version. Pass condition is HTTP 200 AND a parseable
    #    .version from /api/v1/meta/version — NOT merely /health 200, which the
    #    OLD image also returns. Budget 180s (60x3s) to absorb the backend's
    #    worst-case cold start (DB-wait + alembic upgrade head + seed).
    if (( DRY_RUN )); then
        log "[dry-run] skipping health check"
        FINISHED_AT="$(now_iso)"
        write_status "succeeded" "Dry run complete (no images pulled, no restart)"
        rm -f "$STATE_DIR/update.request" 2>/dev/null || true
        return 0
    fi

    local NEW_VERSION="" tries=60
    log "Health-checking new backend at $VERSION_URL (up to 180s)..."
    while (( tries-- > 0 )); do
        NEW_VERSION="$(curl -fsS --max-time 3 "$VERSION_URL" 2>/dev/null | jq -r '.version' 2>/dev/null || true)"
        if [[ -n "$NEW_VERSION" && "$NEW_VERSION" != "null" ]]; then
            break
        fi
        NEW_VERSION=""
        sleep 3
    done

    if [[ -z "$NEW_VERSION" ]]; then
        fail "Backend did not return a healthy /api/v1/meta/version within 180s. Check logs ('systemctl --user status vf-cmdb-backend', 'podman logs vf_cmdb_backend'). To roll back the database schema, restore the pre-update backup via deploy/scripts/vf-cmdb-restore.sh — image rollback alone CANNOT undo a migration."
    fi

    # Frontend root must also answer 200.
    if ! curl -fsS --max-time 5 "$FRONTEND_URL" >/dev/null 2>&1; then
        fail "Frontend did not return 200 at $FRONTEND_URL after update. Check 'podman logs vf_cmdb_frontend'. DB rollback (if needed) is via deploy/scripts/vf-cmdb-restore.sh."
    fi
    log "New version: $NEW_VERSION (frontend healthy)"

    # 6. Classify the outcome (see design PART 3 outcome table).
    FINISHED_AT="$(now_iso)"
    if _version_gt "$NEW_VERSION" "$CURRENT_VERSION"; then
        write_status "succeeded" "Updated $CURRENT_VERSION -> $NEW_VERSION"
        log "Update applied: $CURRENT_VERSION -> $NEW_VERSION"
    elif (( DIGEST_CHANGED )); then
        write_status "succeeded" "Refreshed (same version $NEW_VERSION)"
        log "Refreshed (digest changed, same version $NEW_VERSION)"
    else
        write_status "succeeded" "Already up to date ($NEW_VERSION)"
        log "Already up to date ($NEW_VERSION)"
    fi

    rm -f "$STATE_DIR/update.request" 2>/dev/null || true
    return 0
}

# Strict semver greater-than: _version_gt NEW CUR -> 0 (true) if NEW > CUR.
# Non-semver inputs (e.g. "dev"/"unknown") -> false, so they are never "newer".
_version_gt() {
    local a="${1#v}" b="${2#v}"
    [[ "$a" =~ ^[0-9]+\.[0-9]+\.[0-9]+ && "$b" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]] || return 1
    local a1 a2 a3 b1 b2 b3
    IFS='.' read -r a1 a2 a3 _ <<<"$a"
    IFS='.' read -r b1 b2 b3 _ <<<"$b"
    a3="${a3%%[!0-9]*}"; b3="${b3%%[!0-9]*}"
    (( a1 != b1 )) && { (( a1 > b1 )); return; }
    (( a2 != b2 )) && { (( a2 > b2 )); return; }
    (( a3 > b3 ))
}

# ---------------------------------------------------------------------------
# Legacy source (git-pull + podman build) mode — preserved for source hosts.
# ---------------------------------------------------------------------------
run_source_mode() {
    cd "$REPO_DIR" || { log "ERROR: Repo dir $REPO_DIR not found"; exit 1; }

    local SVC=(vf-cmdb-db.service vf-cmdb-backend.service vf-cmdb-frontend.service vf-cmdb-pgadmin.service)

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

    command -v git >/dev/null    || { log "ERROR: git not installed"; exit 1; }
    command -v podman >/dev/null || { log "ERROR: podman not installed"; exit 1; }

    local CURRENT REMOTE CHANGED
    CURRENT="$(git rev-parse HEAD)"
    log "Current commit: $CURRENT (branch: $(git rev-parse --abbrev-ref HEAD))"

    if [[ "${SKIP_BACKUP:-0}" != "1" && -x "$REPO_DIR/deploy/scripts/vf-cmdb-backup.sh" ]]; then
        log "Taking pre-update backup..."
        "$REPO_DIR/deploy/scripts/vf-cmdb-backup.sh" || log "WARN: pre-update backup failed (continuing)"
    fi

    log "Fetching origin/$UPDATE_BRANCH ..."
    git fetch --quiet origin "$UPDATE_BRANCH"
    REMOTE="$(git rev-parse "origin/$UPDATE_BRANCH")"

    local CODE_UPDATED=0
    if [[ "$CURRENT" != "$REMOTE" ]]; then
        log "New commit available: $REMOTE"
        CHANGED="$(git diff --name-only "$CURRENT" "$REMOTE")"
        log "Applying update..."
        git merge --ff-only "origin/$UPDATE_BRANCH" || { log "ERROR: Fast-forward merge failed (local divergence). Resolve manually."; exit 1; }
        CODE_UPDATED=1

        local REBUILD_BACKEND=0 REBUILD_FRONTEND=0
        grep -q '^backend/'  <<<"$CHANGED" && REBUILD_BACKEND=1
        grep -q '^frontend/' <<<"$CHANGED" && REBUILD_FRONTEND=1
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

    local BASE_UPDATED=0
    if systemctl --user list-unit-files 'podman-auto-update*' >/dev/null 2>&1; then
        log "Checking base image updates (podman auto-update)..."
        if podman auto-update --dry-run 2>/dev/null | grep -qi 'pending'; then
            podman auto-update || log "WARN: podman auto-update reported issues"
            BASE_UPDATED=1
        fi
    fi

    if (( CODE_UPDATED || BASE_UPDATED )); then
        log "Restarting services..."
        restart_services
        if ! wait_healthy; then
            log "Health check FAILED after update — rolling back code to $CURRENT"
            log "NOTE: image/code rollback does NOT undo a migration; restore the pre-update DB backup via deploy/scripts/vf-cmdb-restore.sh if the schema changed."
            git reset --hard "$CURRENT"
            [[ -d backend ]]  && podman build -t localhost/vf_cmdb_backend:latest ./backend  || true
            [[ -d frontend ]] && podman build -t localhost/vf_cmdb_frontend:latest ./frontend || true
            restart_services
            wait_healthy && log "Rollback succeeded." || { log "ERROR: Rollback health check also failed — manual intervention needed."; exit 1; }
            log "ERROR: Update rolled back due to failed health check."
            exit 1
        fi
        log "Update applied successfully. Now at $(git rev-parse HEAD)"
    else
        log "Nothing to update."
    fi
}

# ---------------------------------------------------------------------------
case "$VF_UPDATE_MODE" in
    registry) run_registry_mode ;;
    source)   run_source_mode ;;
    *) log "ERROR: unknown VF_UPDATE_MODE='$VF_UPDATE_MODE' (expected registry|source)"; exit 1 ;;
esac
