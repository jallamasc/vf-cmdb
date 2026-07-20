#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Virtualfactor IT CMDB — Restore script
#
# Restores a backup archive produced by vf-cmdb-backup.sh:
#   * Restores the .env (unless one already exists — never overwrites silently)
#   * Restores the PostgreSQL database (drops & recreates schema objects)
#   * Restores the pgAdmin volume (optional)
#
# The stack must be deployed (db container running) before restoring the DB.
# Typical disaster-recovery flow:
#   1. Re-provision the VM (cloud-init / Ansible) and clone the repo
#   2. ./deploy/scripts/vf-cmdb-restore.sh <archive.tar.gz>   # restores .env
#   3. ./deploy-podman.sh quadlet                             # brings stack up
#   4. Re-run this script to load the database dump
#
# Usage:
#   ./vf-cmdb-restore.sh /path/to/vf-cmdb-backup-YYYYMMDD-HHMMSS.tar.gz
#   ./vf-cmdb-restore.sh --latest              # use newest archive in BACKUP_DIR
#   ./vf-cmdb-restore.sh --env-only <archive>  # only restore .env, skip DB
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/vf-cmdb}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/vf-cmdb-backups}"
DB_CONTAINER="${DB_CONTAINER:-vf_cmdb_db}"
PGADMIN_VOLUME="${PGADMIN_VOLUME:-vf-cmdb-pgadmin}"

log()  { echo "[restore $(date +%H:%M:%S)] $*"; }
die()  { echo "ERROR: $*" >&2; exit 1; }

ENV_ONLY=0
ARCHIVE=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --latest)   ARCHIVE="$(ls -1t "$BACKUP_DIR"/vf-cmdb-backup-*.tar.gz 2>/dev/null | head -n1)";;
        --env-only) ENV_ONLY=1;;
        *)          ARCHIVE="$1";;
    esac
    shift
done

[[ -n "$ARCHIVE" ]]     || die "No archive specified. Use a path or --latest."
[[ -f "$ARCHIVE" ]]     || die "Archive not found: $ARCHIVE"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

log "Extracting $ARCHIVE ..."
tar -xzf "$ARCHIVE" -C "$WORK"
SRC="$(find "$WORK" -maxdepth 1 -type d -name 'vf-cmdb-backup-*' | head -n1)"
[[ -d "$SRC" ]] || die "Archive layout not recognised."

log "Backup manifest:"
sed 's/^/  /' "$SRC/MANIFEST.txt" 2>/dev/null || true

# --- 1. Restore .env -------------------------------------------------------
if [[ -f "$SRC/.env" ]]; then
    if [[ -f "$REPO_DIR/.env" ]]; then
        log "An .env already exists at $REPO_DIR/.env — saved backup copy to .env.restored"
        cp "$SRC/.env" "$REPO_DIR/.env.restored"
    else
        mkdir -p "$REPO_DIR"
        cp "$SRC/.env" "$REPO_DIR/.env"
        log "Restored .env to $REPO_DIR/.env"
    fi
fi

if [[ "$ENV_ONLY" == "1" ]]; then
    log "Env-only restore complete. Now deploy the stack, then re-run without --env-only."
    exit 0
fi

# --- 2. Restore database ---------------------------------------------------
# shellcheck disable=SC1091
[[ -f "$REPO_DIR/.env" ]] && { set -a; source "$REPO_DIR/.env"; set +a; }
POSTGRES_USER="${POSTGRES_USER:-vfcmdb}"
POSTGRES_DB="${POSTGRES_DB:-vfcmdb}"

podman ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER" || \
    die "Database container '$DB_CONTAINER' is not running. Deploy the stack first."

if [[ -f "$SRC/database.dump" ]]; then
    log "Restoring database from custom-format dump (this drops & recreates objects)..."
    podman exec -i "$DB_CONTAINER" pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        --clean --if-exists --no-owner < "$SRC/database.dump"
    log "Database restored."
elif [[ -f "$SRC/database.sql.gz" ]]; then
    log "Restoring database from plain SQL dump..."
    gunzip -c "$SRC/database.sql.gz" | podman exec -i "$DB_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
    log "Database restored."
else
    die "No database dump found inside the archive."
fi

# --- 3. Restore pgAdmin volume (optional) ----------------------------------
if [[ -f "$SRC/pgadmin-volume.tar.gz" ]]; then
    log "Restoring pgAdmin volume '$PGADMIN_VOLUME'..."
    podman volume exists "$PGADMIN_VOLUME" 2>/dev/null || podman volume create "$PGADMIN_VOLUME" >/dev/null
    gunzip -c "$SRC/pgadmin-volume.tar.gz" | podman volume import "$PGADMIN_VOLUME" - || \
        log "  (pgAdmin volume import skipped — non-fatal)"
fi

log "Restore complete. Restart the stack to pick everything up:"
log "  systemctl --user restart vf-cmdb-backend.service vf-cmdb-frontend.service"
