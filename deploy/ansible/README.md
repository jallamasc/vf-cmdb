# Ansible — repeatable remote deployment

`site.yml` provisions and deploys the entire CMDB onto a VM from your workstation,
with no agent on the target. It is idempotent: re-running converges to the same
state, and it's the fast path to rebuild a lost server.

## Prerequisites (on your workstation)
```bash
sudo apt-get install -y ansible            # or: pipx install ansible
ansible-galaxy collection install -r requirements.yml
```
Plus: SSH access to the target as a sudo-capable user (key-based), and the target
running Ubuntu 22.04/24.04.

## Configure
```bash
cp inventory.example.ini inventory.ini
$EDITOR inventory.ini        # set ansible_host, ansible_user, key path
```

## Deploy
```bash
ansible-playbook -i inventory.ini site.yml
# pin the UI origin instead of "*":
ansible-playbook -i inventory.ini site.yml -e "cors_origins=http://192.168.1.50:8080"
```

## Rebuild a lost server and restore data in one shot
```bash
# copy your off-site backup archive to the new VM first, then:
ansible-playbook -i inventory.ini site.yml \
  -e restore_archive=/home/vfadmin/vf-cmdb-backup-YYYYMMDD-HHMMSS.tar.gz
```

## What it does
1. Installs Podman + tooling, enables lingering
2. Clones/updates the repo at `~/vf-cmdb` (master)
3. Templates `.env` (generates a strong DB password on first run)
4. Deploys via Quadlet (Podman ≥ 4) or compose (Podman 3.x)
5. Installs & enables the auto-update + backup timers
6. Configures the ufw firewall (SSH, 8080, 8000, 5050)
7. Optionally restores a backup archive (`-e restore_archive=...`)

## Notes
- Rootless Podman + `systemctl --user` over SSH needs a user session bus. The
  playbook sets `XDG_RUNTIME_DIR`; if you hit D-Bus errors, ensure lingering is on
  (`loginctl enable-linger <user>`) and re-run — it's safe to repeat.
- For true systemd/Quadlet always-on, target Ubuntu 24.04 (Podman 4.9) or install
  a newer Podman on 22.04.
