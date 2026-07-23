#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Virtualfactor IT CMDB — One-shot VM bootstrap
#
# Turns a fresh, non-configured Ubuntu 22.04/24.04 host into a fully running
# CMDB node. Idempotent: safe to re-run. This is the primitive used by both
# the manual first-time deploy and the automated (cloud-init / Ansible) paths.
#
# Steps:
#   1. Install prerequisites (podman, git, curl, ufw, podman-compose fallback)
#   2. Enable rootless lingering so services survive logout / reboot
#   3. Clone (or update) the repo at ~/vf-cmdb on the correct branch
#   4. Create .env from template if missing (with a generated DB password)
#   5. Deploy via Quadlet/systemd (always-on)
#   6. Install & enable the auto-update and backup timers
#   7. Configure the host firewall (ufw) for the CMDB ports
#
# Usage (run as the NON-root app user, with sudo available):
#   curl -fsSL https://raw.githubusercontent.com/jallamasc/vf-cmdb/master/deploy/scripts/bootstrap.sh | bash
#   # or, from a checked-out repo:
#   ./deploy/scripts/bootstrap.sh
#
# Env overrides:
#   REPO_URL     (default https://github.com/jallamasc/vf-cmdb.git)
#   REPO_BRANCH  (default master)
#   REPO_DIR     (default ~/vf-cmdb)
#   ENABLE_UFW   (default 1)  set 0 to skip firewall changes
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/jallamasc/vf-cmdb.git}"
REPO_BRANCH="${REPO_BRANCH:-master}"
REPO_DIR="${REPO_DIR:-$HOME/vf-cmdb}"
ENABLE_UFW="${ENABLE_UFW:-1}"

log()  { echo -e "\n\033[1;36m[bootstrap]\033[0m $*"; }
die()  { echo -e "\033[1;31m[bootstrap ERROR]\033[0m $*" >&2; exit 1; }

[[ "$(id -u)" -ne 0 ]] || die "Run this as your normal app user (not root). It uses sudo where needed."
command -v sudo >/dev/null || die "sudo is required."

# --- 1. Prerequisites ------------------------------------------------------
log "Installing prerequisites (podman, git, curl, ufw)..."
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
    podman git curl ufw uidmap slirp4netns fuse-overlayfs

# podman-compose is a helpful fallback on Ubuntu 22.04 (Podman 3.4, no built-in compose)
if ! podman compose version >/dev/null 2>&1 && ! command -v podman-compose >/dev/null 2>&1; then
    log "Installing podman-compose (pip fallback for older Podman)..."
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y python3-pip
    pip3 install --user podman-compose || sudo apt-get install -y podman-compose || true
fi

PODMAN_VER="$(podman version --format '{{.Client.Version}}' 2>/dev/null || echo '0')"
log "Podman version: $PODMAN_VER"

# --- 1b. Ensure Docker Hub is a default search registry --------------------
# Ubuntu 24.04's /etc/containers/registries.conf only has a COMMENTED example
# of unqualified-search-registries, so short image names like
# "nginx:1.27-alpine" fail to resolve. Write a drop-in conf file (loaded from
# registries.conf.d) so short names resolve to docker.io. Using a drop-in avoids
# matching the commented line in the main file and covers all future images.
REGISTRIES_DROPIN="/etc/containers/registries.conf.d/01-vf-cmdb-docker.conf"
log "Setting docker.io as default search registry ($REGISTRIES_DROPIN) ..."
sudo mkdir -p /etc/containers/registries.conf.d
echo 'unqualified-search-registries = ["docker.io"]' | sudo tee "$REGISTRIES_DROPIN" >/dev/null
# Verify Podman now sees docker.io as a search registry.
if podman info --format '{{.Registries.Search}}' 2>/dev/null | grep -q docker.io; then
    log "Confirmed: docker.io is now a search registry."
else
    log "WARN: docker.io not yet visible to podman info — continuing anyway."
fi

# --- 2. Rootless lingering -------------------------------------------------
log "Enabling user lingering (services survive logout/reboot)..."
sudo loginctl enable-linger "$USER"
mkdir -p "$HOME/.config/containers/systemd"

# --- 3. Clone / update repo ------------------------------------------------
if [[ -d "$REPO_DIR/.git" ]]; then
    log "Repo exists at $REPO_DIR — updating..."
    git -C "$REPO_DIR" fetch --quiet origin "$REPO_BRANCH"
    git -C "$REPO_DIR" checkout "$REPO_BRANCH"
    git -C "$REPO_DIR" merge --ff-only "origin/$REPO_BRANCH" || log "WARN: could not fast-forward (local changes?)"
else
    log "Cloning $REPO_URL (branch $REPO_BRANCH) to $REPO_DIR ..."
    git clone -b "$REPO_BRANCH" "$REPO_URL" "$REPO_DIR"
fi
cd "$REPO_DIR"

# --- 4. Environment file ---------------------------------------------------
if [[ ! -f .env ]]; then
    log "Creating .env from template with a generated DB password..."
    cp .env.example .env
    GEN_PW="$(openssl rand -base64 24 2>/dev/null | tr -d '/+=' | cut -c1-24 || date +%s | sha256sum | cut -c1-24)"
    sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${GEN_PW}/" .env
    log "Generated POSTGRES_PASSWORD written to .env (review other values!)."
    echo ">>> Review $REPO_DIR/.env — set CORS_ORIGINS and PGADMIN_DEFAULT_PASSWORD."
else
    log ".env already present — leaving untouched."
fi

# --- 5. Deploy via Quadlet/systemd ----------------------------------------
if (( $(echo "$PODMAN_VER" | cut -d. -f1) >= 4 )); then
    log "Deploying with Quadlet (systemd, always-on)..."
    ./deploy-podman.sh quadlet
else
    log "Podman < 4 detected — using podman-compose (always-on via restart policy)..."
    ./deploy-podman.sh up
    log "NOTE: For true systemd-managed always-on, upgrade to Podman >= 4.4 (Ubuntu 24.04 ships it)."
fi

# --- 6. Install auto-update & backup timers -------------------------------
log "Installing auto-update and backup systemd timers..."
USER_UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$USER_UNIT_DIR"
cp deploy/systemd/vf-cmdb-update.service deploy/systemd/vf-cmdb-update.timer "$USER_UNIT_DIR/"
cp deploy/systemd/vf-cmdb-backup.service deploy/systemd/vf-cmdb-backup.timer "$USER_UNIT_DIR/"
chmod +x deploy/scripts/*.sh
systemctl --user daemon-reload
systemctl --user enable --now vf-cmdb-update.timer vf-cmdb-backup.timer
log "Timers enabled:"
systemctl --user list-timers 'vf-cmdb-*' --no-pager || true

# --- 7. Firewall -----------------------------------------------------------
if [[ "$ENABLE_UFW" == "1" ]]; then
    log "Configuring firewall (ufw): allow SSH, 8080, 8000, 5050..."
    sudo ufw allow OpenSSH        || sudo ufw allow 22/tcp
    sudo ufw allow 8080/tcp        # Web UI
    sudo ufw allow 8000/tcp        # API / docs
    sudo ufw allow 5050/tcp        # pgAdmin
    # 5432 (Postgres) intentionally NOT opened to the LAN by default.
    yes | sudo ufw enable || true
    sudo ufw status verbose || true
fi

IP="$(hostname -I | awk '{print $1}')"
log "Bootstrap complete!"
cat <<EOF

  ┌───────────────────────────────────────────────┐
  │  Virtualfactor IT CMDB is deploying            │
  ├───────────────────────────────────────────────┤
  │  Web UI    : http://${IP}:8080
  │  API docs  : http://${IP}:8000/docs
  │  pgAdmin   : http://${IP}:5050
  └───────────────────────────────────────────────┘

  Auto-update timer : daily 03:30 (git pull + rebuild + health-checked redeploy)
  Backup timer      : 01:00 & 13:00 (pg_dump + config, 14-day retention)

  Manage services:
    systemctl --user status  vf-cmdb-backend.service
    journalctl --user -u vf-cmdb-backend.service -f
EOF
