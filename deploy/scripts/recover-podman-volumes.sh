#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Virtualfactor IT CMDB — Podman volume-store recovery
#
# Fixes the podman error:
#     "more than one result for volume name vf-cmdb_pgdata: volume already exists"
#
# That error means podman's INTERNAL volume database has the same volume name
# registered more than once (a corrupted / duplicate entry). Ordinary
# `podman volume rm` cannot resolve it, and podman-compose crashes the moment
# it tries to `inspect` the volume.
#
# Your actual PostgreSQL data is NOT stored in that metadata — it lives as
# plain files on disk under podman's storage path. This script:
#
#   PHASE 1  (always, non-destructive):
#            - locate the on-disk data directories for pgdata (and pgadmin)
#            - copy the PostgreSQL data OUT to a timestamped tar.gz backup
#
#   PHASE 2  (least-destructive repair, default):
#            - stop/remove stack containers
#            - try `podman volume rm --force` for every name variant
#            - run `podman system renumber` (rebuilds the ID/lock DB; does NOT
#              delete volume data) and retry the removals
#
#   PHASE 3  (NON-destructive fresh-volume switch, default when P2 fails):
#            - podman's volume DB has a duplicate key for the old name that
#              `renumber` cannot dedupe. Instead of fighting it, we stop USING
#              that name: create a brand-new volume, copy the Phase-1 data into
#              it, and pin the new name in .env (PGDATA_VOLUME=...). compose then
#              never touches the corrupted entry again. Nothing is deleted.
#
#   PHASE 4  (last resort, ONLY with CONFIRM_RESET=1):
#            - `podman system reset -f`  (wipes ALL podman containers/images/
#              volumes/networks for this user — images simply rebuild, and we
#              restore pgdata from the Phase-1 backup afterwards)
#
# Usage:
#   ./deploy/scripts/recover-podman-volumes.sh            # phases 1 -> 3 (safe)
#   CONFIRM_RESET=1 ./deploy/scripts/recover-podman-volumes.sh   # allow phase 4
#
# After a successful run:  ./deploy-podman.sh up
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/vf-cmdb-backups}"
CONFIRM_RESET="${CONFIRM_RESET:-0}"

# Canonical (underscore) names + legacy (dash) variants both handled.
PGDATA_NAMES=(vf-cmdb_pgdata vf-cmdb-pgdata)
PGADMIN_NAMES=(vf-cmdb_pgadmin vf-cmdb-pgadmin)
CONTAINERS=(vf_cmdb_frontend vf_cmdb_pgadmin vf_cmdb_backend vf_cmdb_db)

TS="$(date +%Y%m%d-%H%M%S)"

log()  { echo -e "\n\033[1;36m[recover]\033[0m $*"; }
warn() { echo -e "\033[1;33m[recover WARN]\033[0m $*" >&2; }
die()  { echo -e "\033[1;31m[recover ERROR]\033[0m $*" >&2; exit 1; }

mkdir -p "$BACKUP_DIR"

# --- Resolve podman's on-disk volume path (works even with corrupted DB) ---
VOL_PATH="$(podman info --format '{{.Store.VolumePath}}' 2>/dev/null || true)"
if [[ -z "$VOL_PATH" || ! -d "$VOL_PATH" ]]; then
    VOL_PATH="$HOME/.local/share/containers/storage/volumes"
fi
log "Podman volume storage path: $VOL_PATH"
[[ -d "$VOL_PATH" ]] || die "Volume storage path not found: $VOL_PATH"

# Find the pgdata directory that actually contains a PostgreSQL cluster.
find_pgdata_dir() {
    local name d
    for name in "${PGDATA_NAMES[@]}"; do
        d="$VOL_PATH/$name/_data"
        if [[ -f "$d/PG_VERSION" ]]; then
            echo "$d"
            return 0
        fi
    done
    return 1
}

# ---------------------------------------------------------------------------
# PHASE 1 — back up the on-disk PostgreSQL data (non-destructive)
# ---------------------------------------------------------------------------
log "PHASE 1: backing up on-disk PostgreSQL data..."
PGDATA_DIR="$(find_pgdata_dir || true)"
DATA_BACKUP=""
if [[ -n "$PGDATA_DIR" ]]; then
    log "  Found live PostgreSQL data at: $PGDATA_DIR"
    DATA_BACKUP="$BACKUP_DIR/pgdata-files-$TS.tar.gz"
    # --numeric-owner preserves the rootless subuid ownership so restore is exact.
    tar --numeric-owner -czf "$DATA_BACKUP" -C "$PGDATA_DIR" . \
        && log "  -> wrote $DATA_BACKUP ($(du -h "$DATA_BACKUP" | cut -f1))" \
        || die "Failed to archive PostgreSQL data — STOPPING before any change."
else
    warn "  No PostgreSQL data directory with a PG_VERSION file was found."
    warn "  (If this is a brand-new host with no data yet, that is expected.)"
    if [[ "$CONFIRM_RESET" == "1" ]]; then
        warn "  Proceeding to reset with NO data backup because CONFIRM_RESET=1."
    fi
fi

# ---------------------------------------------------------------------------
# PHASE 2 — least-destructive repair
# ---------------------------------------------------------------------------
log "PHASE 2: stopping stack containers and clearing duplicate volume entries..."
for c in "${CONTAINERS[@]}"; do
    podman stop -t 5 "$c" >/dev/null 2>&1 || true
    podman rm -f "$c"     >/dev/null 2>&1 || true
done
# Remove any half-created containers left by a failed compose run.
ids="$(podman ps -aq --filter 'name=vf_cmdb_' 2>/dev/null || true)"
[[ -n "$ids" ]] && podman rm -f $ids >/dev/null 2>&1 || true

remove_pgadmin_volumes() {
    local v
    for v in "${PGADMIN_NAMES[@]}"; do
        podman volume rm -f "$v" >/dev/null 2>&1 || true
    done
}

pgdata_clean() {
    # Clean == exactly one (or zero) resolvable pgdata volume, no ambiguity.
    podman volume inspect vf-cmdb_pgdata >/dev/null 2>&1 && return 0
    # inspect fails either because it doesn't exist (fine) or is ambiguous (bad)
    if podman volume inspect vf-cmdb_pgdata 2>&1 | grep -qi 'more than one result'; then
        return 1
    fi
    return 0
}

log "  Clearing disposable pgAdmin volumes (UI settings only)..."
remove_pgadmin_volumes

if pgdata_clean; then
    log "  pgdata volume store looks consistent — no duplicate entry detected."
else
    warn "  Duplicate pgdata entry detected. Rebuilding podman ID/lock DB..."
    podman system renumber >/dev/null 2>&1 || warn "  'podman system renumber' returned non-zero."
    remove_pgadmin_volumes
fi

if pgdata_clean; then
    log "SUCCESS: pgdata volume store is consistent again."
    log "Now bring the stack up:"
    echo "    cd \"$REPO_DIR\" && ./deploy-podman.sh up"
    [[ -n "$DATA_BACKUP" ]] && echo "    (data safety backup kept at: $DATA_BACKUP)"
    exit 0
fi

# ---------------------------------------------------------------------------
# PHASE 3 — NON-destructive fresh-volume switch (default when P2 fails)
# ---------------------------------------------------------------------------
warn "Duplicate pgdata entry STILL present after Phase 2 (renumber cannot dedupe it)."
log "PHASE 3: switching the stack to a fresh, uncorrupted volume name (non-destructive)..."

# Pick a new, guaranteed-unique volume name.
NEW_PGDATA="vf-cmdb_pgdata_r${TS}"
log "  New volume name: $NEW_PGDATA"

# Create the new volume. Its name has never been in the DB, so no ambiguity.
if ! podman volume create "$NEW_PGDATA" >/dev/null 2>&1; then
    warn "  Could not create '$NEW_PGDATA'. Falling back to Phase 4 (guarded reset)."
else
    NEW_DIR="$(podman volume inspect "$NEW_PGDATA" --format '{{.Mountpoint}}' 2>/dev/null || true)"
    if [[ -z "$NEW_DIR" || ! -d "$NEW_DIR" ]]; then
        warn "  Could not resolve mountpoint for '$NEW_PGDATA'. Falling back to Phase 4."
    else
        # Prefer copying straight from the still-readable on-disk data dir;
        # fall back to the Phase-1 tarball if needed.
        if [[ -n "$PGDATA_DIR" && -d "$PGDATA_DIR" ]]; then
            log "  Copying data from $PGDATA_DIR -> $NEW_DIR ..."
            cp -a "$PGDATA_DIR/." "$NEW_DIR/" \
                || die "  Copy failed. Your Phase-1 backup is safe at: $DATA_BACKUP"
        elif [[ -n "$DATA_BACKUP" && -f "$DATA_BACKUP" ]]; then
            log "  Extracting Phase-1 backup into $NEW_DIR ..."
            tar --numeric-owner -xzf "$DATA_BACKUP" -C "$NEW_DIR" \
                || die "  Extract failed. Your Phase-1 backup is safe at: $DATA_BACKUP"
        else
            warn "  No source data found — the new volume will start EMPTY."
        fi

        # Pin the new name in .env so compose (and Quadlet, if it reads env) use it.
        ENV_FILE="$REPO_DIR/.env"
        touch "$ENV_FILE"
        if grep -q '^PGDATA_VOLUME=' "$ENV_FILE" 2>/dev/null; then
            sed -i "s|^PGDATA_VOLUME=.*|PGDATA_VOLUME=$NEW_PGDATA|" "$ENV_FILE"
        else
            printf '\n# Switched by recover-podman-volumes.sh (%s) to bypass a corrupted volume entry\nPGDATA_VOLUME=%s\n' \
                "$TS" "$NEW_PGDATA" >> "$ENV_FILE"
        fi
        log "  Pinned PGDATA_VOLUME=$NEW_PGDATA in $ENV_FILE"

        log "SUCCESS (non-destructive): stack now points at the fresh volume."
        log "Bring the stack up:"
        echo "    cd \"$REPO_DIR\" && ./deploy-podman.sh up"
        echo "    (old corrupted entry 'vf-cmdb_pgdata' is now an unused orphan;"
        echo "     data safety backup: ${DATA_BACKUP:-<none>})"
        exit 0
    fi
fi

# ---------------------------------------------------------------------------
# PHASE 4 — last resort full reset (guarded by CONFIRM_RESET=1)
# ---------------------------------------------------------------------------
if [[ "$CONFIRM_RESET" != "1" ]]; then
    cat <<EOF

  The non-destructive fresh-volume switch could not complete automatically.
  The remaining reliable fix is a full podman reset for this user:
      podman system reset -f
  This wipes ALL podman containers, images, volumes and networks for the
  current user. Images just rebuild, and your PostgreSQL data has already
  been backed up in PHASE 1 to:
      ${DATA_BACKUP:-<none captured>}

  Re-run this script WITH confirmation to perform the reset + restore:
      CONFIRM_RESET=1 $0

EOF
    die "Stopping. No destructive action taken."
fi

[[ -n "$DATA_BACKUP" && -f "$DATA_BACKUP" ]] || \
    warn "No data backup captured — reset will start from an EMPTY database."

log "PHASE 4: performing 'podman system reset -f'..."
podman system reset -f

log "  Recreating volume 'vf-cmdb_pgdata'..."
podman volume create vf-cmdb_pgdata >/dev/null

if [[ -n "$DATA_BACKUP" && -f "$DATA_BACKUP" ]]; then
    NEW_DIR="$(podman volume inspect vf-cmdb_pgdata --format '{{.Mountpoint}}')"
    log "  Restoring PostgreSQL data into $NEW_DIR ..."
    tar --numeric-owner -xzf "$DATA_BACKUP" -C "$NEW_DIR"
    log "  Restore complete."
fi

log "Recovery finished. Now bring the stack up:"
echo "    cd \"$REPO_DIR\" && ./deploy-podman.sh up"
[[ -n "$DATA_BACKUP" ]] && echo "    (data safety backup kept at: $DATA_BACKUP)"
