# Virtualfactor IT CMDB — Backup & Disaster Recovery

How data is protected, and exactly how to rebuild the server **from nothing** and
restore all data if you lose the VM or the whole Proxmox host.

**Recovery objective:** with an off-VM backup archive, a full rebuild takes
~10–15 minutes and loses at most the time since the last backup (≤ 12 h with the
default twice-daily schedule).

---

## 1. What is backed up

`deploy/scripts/vf-cmdb-backup.sh` produces a single timestamped archive
`vf-cmdb-backup-YYYYMMDD-HHMMSS.tar.gz` containing:

| Item | Why |
|------|-----|
| `database.dump` | PostgreSQL custom-format dump (compressed, selective restore) |
| `database.sql.gz` | Plain SQL dump (portable fallback) |
| `.env` | All configuration & secrets (DB password, ports, CORS) |
| `pgadmin-volume.tar.gz` | pgAdmin saved servers/preferences (best-effort) |
| `MANIFEST.txt` | Timestamp, hostname, git commit, image digests |

Everything needed to reconstruct the running system is either in this archive or
in the **git repository** (all code + deploy manifests). The two together are a
complete recovery set.

---

## 2. Backup schedule

Installed as a user systemd timer (`vf-cmdb-backup.timer`):
- **Twice daily** at 01:00 and 13:00 local time.
- Archives written to `~/vf-cmdb-backups/`.
- **14-day retention** (older archives auto-pruned).

```bash
systemctl --user list-timers 'vf-cmdb-backup*'
journalctl --user -u vf-cmdb-backup.service -n 50 --no-pager
```

### Run a backup on demand
```bash
~/vf-cmdb/deploy/scripts/vf-cmdb-backup.sh
# or alias:
cmdb-backup
```

### Tune retention / destination
```bash
RETENTION_DAYS=30 BACKUP_DIR=/mnt/nas/cmdb ~/vf-cmdb/deploy/scripts/vf-cmdb-backup.sh
```

---

## 3. ⚠ Get backups OFF the VM (critical)

A backup that only lives on the VM does **not** protect you if the VM/host dies.
Copy archives somewhere else. Pick one:

**A. Pull from your workstation (simple, recommended):**
```bash
# cron/Task Scheduler on your workstation, e.g. daily:
rsync -avz --delete vfadmin@192.168.1.50:vf-cmdb-backups/ ~/cmdb-backups/
```

**B. Push from the VM to a NAS/share:**
```bash
# point BACKUP_DIR at a mounted NAS path (fstab/NFS/CIFS)
BACKUP_DIR=/mnt/nas/cmdb ~/vf-cmdb/deploy/scripts/vf-cmdb-backup.sh
```

**C. Proxmox-level safety net:** enable **Proxmox Backup Server** or a scheduled
`vzdump` of the VM for full-VM image backups, in addition to the app-level dumps.

> **Rule of thumb (3-2-1):** ≥3 copies, on ≥2 media, ≥1 off-site.

---

## 4. Full disaster recovery — rebuild from scratch

Scenario: the VM (or the entire Proxmox host) is gone. You have a backup archive
on your workstation/NAS and access to the GitHub repo.

### Step 1 — Provision a fresh VM
Use any of the three paths (all produce the same result):
- **cloud-init** (`deploy/cloud-init/`) — zero-touch, or
- **Ansible** (`deploy/ansible/`) from your workstation, or
- **Manual** (`docs/DEPLOYMENT_MANUAL.md`) then run `bootstrap.sh`.

### Step 2 — Copy the backup archive to the new VM
```bash
scp ~/cmdb-backups/vf-cmdb-backup-YYYYMMDD-HHMMSS.tar.gz vfadmin@<new-vm-ip>:~/
```

### Step 3 — Restore config, deploy, restore data

**Fastest (Ansible, one command from your workstation):**
```bash
cd deploy/ansible
ansible-playbook -i inventory.ini site.yml \
  -e restore_archive=/home/vfadmin/vf-cmdb-backup-YYYYMMDD-HHMMSS.tar.gz
```
This provisions, restores `.env`, brings the stack up, and loads the DB dump.

**Or manually on the VM:**
```bash
cd ~/vf-cmdb
# 1. Restore .env first (so the DB starts with the SAME password as the dump)
./deploy/scripts/vf-cmdb-restore.sh --env-only ~/vf-cmdb-backup-YYYYMMDD-HHMMSS.tar.gz
# 2. Bring the stack up (creates an empty, migrated+seeded DB)
./deploy-podman.sh quadlet     # or ./deploy-podman.sh up on Podman 3.x
# 3. Load the database dump over it
./deploy/scripts/vf-cmdb-restore.sh ~/vf-cmdb-backup-YYYYMMDD-HHMMSS.tar.gz
# 4. Restart to pick everything up
systemctl --user restart vf-cmdb-backend.service vf-cmdb-frontend.service
```

### Step 4 — Verify
```bash
curl -fsS http://localhost:8000/health && echo OK
```
Open `http://<new-vm-ip>:8080` and confirm your sites/racks/devices are present.

> **Why restore `.env` first?** The Postgres data password and the app's DB
> credentials must match. Restoring `.env` before the DB container's first start
> guarantees they line up.

---

## 5. Restore only the database (data corruption / bad edit)

The VM is fine; you just want to roll data back to a known-good point:
```bash
cd ~/vf-cmdb
./deploy/scripts/vf-cmdb-restore.sh --latest        # newest archive
# or a specific one:
./deploy/scripts/vf-cmdb-restore.sh ~/vf-cmdb-backups/vf-cmdb-backup-20260720-010000.tar.gz
```
The custom-format restore uses `--clean --if-exists`, so it drops and recreates
objects — the DB ends up exactly as it was at backup time.

---

## 6. Test your recovery (do this quarterly)

A backup you haven't restored is a hope, not a backup.
```bash
# On a throwaway VM (or a second one), run a full §4 recovery from your newest
# off-site archive and confirm the UI shows current data. Time how long it takes;
# keep that number as your real RTO.
```

---

## 7. Recovery cheat-sheet

| You lost… | Do this |
|-----------|---------|
| A bad data edit | §5 restore latest archive |
| The `.env` only | `vf-cmdb-restore.sh --env-only <archive>` then restart |
| The whole VM | §4 full rebuild (cloud-init/Ansible + restore) |
| The Proxmox host | Rebuild host → §4 on a new VM using off-site archive |
| Everything but GitHub + a DB dump | Repo rebuilds the app; dump rebuilds the data → §4 |

---

## 8. Backup/restore command reference

```bash
# Backup now
deploy/scripts/vf-cmdb-backup.sh
RETENTION_DAYS=30 BACKUP_DIR=/mnt/nas/cmdb deploy/scripts/vf-cmdb-backup.sh

# Restore
deploy/scripts/vf-cmdb-restore.sh --latest
deploy/scripts/vf-cmdb-restore.sh --env-only <archive.tar.gz>
deploy/scripts/vf-cmdb-restore.sh <archive.tar.gz>

# Ad-hoc raw dump (no archive wrapper)
podman exec -t vf_cmdb_db pg_dump -U vfcmdb vfcmdb > quick.sql
cat quick.sql | podman exec -i vf_cmdb_db psql -U vfcmdb vfcmdb
```
