#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Virtualfactor IT CMDB — Backup script
#
# Creates a single timestamped, self-contained backup archive containing:
#   * PostgreSQL logical dump (pg_dump custom format, compressed)
#   * The active .env file (secrets / configuration)
#   * The pgAdmin data volume (saved servers / preferences)
#   * A manifest with metadata (git commit, image digests, timestamp)
#
# Backups are written to $BACKUP_DIR (default ~/vf-cmdb-backups) and old
# archives beyond $RETENTION_DAYS are pruned automatically.
#
# Usage:
#   ./vf-cmdb-backup.sh                # normal backup
#   BACKUP_DIR=/mnt/nas/cmdb ./vf-cmdb-backup.sh
#   RETENTION_DAYS=30 ./vf-cmdb-backup.sh
#
# Designed to be run by hand OR from the vf-cmdb-backup.timer systemd unit.
# ---------------------------------------------------------------------------
set -euo pipefail

# --- Configuration ---------------------------------------------------------
REPO_DIR="${REPO_DIR:-$HOME/vf-cmdb}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/vf-cmdb-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DB_CONTAINER="${DB_CONTAINER:-vf_cmdb_db}"
PGADMIN_VOLUME="${PGADMIN_VOLUME:-vf-cmdb_pgadmin}"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
WORK="$(mktemp -d)"
STAGE="$WORK/vf-cmdb-backup-$TIMESTAMP"
ARCHIVE="$BACKUP_DIR/vf-cmdb-backup-$TIMESTAMP.tar.gz"

log() { echo "[backup $(date +%H:%M:%S)] $*"; }
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

# --- Load environment ------------------------------------------------------
if [[ -f "$REPO_DIR/.env" ]]; then
    # shellcheck disable=SC1091
    set -a; source "$REPO_DIR/.env"; set +a
fi
POSTGRES_USER="${POSTGRES_USER:-vfcmdb}"
POSTGRES_DB="${POSTGRES_DB:-vfcmdb}"

mkdir -p "$STAGE" "$BACKUP_DIR"

# --- 1. Database dump (custom format = compressed + selective restore) -----
log "Dumping database '$POSTGRES_DB' from container '$DB_CONTAINER'..."
if ! podman ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
    log "ERROR: database container '$DB_CONTAINER' is not running. Aborting."
    exit 1
fi
podman exec "$DB_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
    > "$STAGE/database.dump"
log "  -> $(du -h "$STAGE/database.dump" | cut -f1) written"

# --- 2. Plain SQL dump too (human-readable, portable fallback) -------------
podman exec "$DB_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    | gzip > "$STAGE/database.sql.gz"

# --- 3. Configuration ------------------------------------------------------
[[ -f "$REPO_DIR/.env" ]] && cp "$REPO_DIR/.env" "$STAGE/.env"

# --- 4. pgAdmin volume (optional, best-effort) -----------------------------
if podman volume exists "$PGADMIN_VOLUME" 2>/dev/null; then
    log "Archiving pgAdmin volume '$PGADMIN_VOLUME'..."
    podman volume export "$PGADMIN_VOLUME" | gzip > "$STAGE/pgadmin-volume.tar.gz" || \
        log "  (pgAdmin volume export skipped)"
fi

# --- 5. Manifest -----------------------------------------------------------
{
    echo "backup_timestamp: $TIMESTAMP"
    echo "hostname: $(hostname)"
    echo "repo_dir: $REPO_DIR"
    echo "postgres_db: $POSTGRES_DB"
    echo "postgres_user: $POSTGRES_USER"
    if git -C "$REPO_DIR" rev-parse --short HEAD >/dev/null 2>&1; then
        echo "git_commit: $(git -C "$REPO_DIR" rev-parse HEAD)"
        echo "git_branch: $(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)"
    fi
    echo "backend_image: $(podman inspect --format '{{.Id}}' localhost/vf_cmdb_backend:latest 2>/dev/null || echo n/a)"
    echo "frontend_image: $(podman inspect --format '{{.Id}}' localhost/vf_cmdb_frontend:latest 2>/dev/null || echo n/a)"
} > "$STAGE/MANIFEST.txt"

# --- 6. Package ------------------------------------------------------------
log "Packaging archive..."
tar -czf "$ARCHIVE" -C "$WORK" "vf-cmdb-backup-$TIMESTAMP"
chmod 600 "$ARCHIVE"
log "Backup complete: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

# --- 7. Retention ----------------------------------------------------------
log "Pruning backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -maxdepth 1 -name 'vf-cmdb-backup-*.tar.gz' -type f \
    -mtime +"$RETENTION_DAYS" -print -delete || true

# --- 8. Report latest ------------------------------------------------------
log "Current backups:"
ls -1t "$BACKUP_DIR"/vf-cmdb-backup-*.tar.gz 2>/dev/null | head -n 10 | sed 's/^/  /'
