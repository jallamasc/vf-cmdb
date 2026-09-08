# Ansible Integration

The CMDB is the single source of truth for your Ansible inventory. Two flows are
supported:

1. **Dynamic inventory** — Ansible reads hosts and groups straight from the CMDB.
2. **Fact write-back** — a playbook / callback pushes discovered facts back into
   the CMDB so the database stays current.

---

## 1. Dynamic inventory

`cmdb_inventory.py` is a standard Ansible dynamic-inventory script. It fetches
`GET /api/v1/ansible/inventory` and returns it in Ansible's JSON format.

### Setup

```bash
# point the script at your CMDB API (defaults to http://localhost:8000/api/v1)
export CMDB_API_URL="http://cmdb.home.lan:8000/api/v1"

chmod +x cmdb_inventory.py
```

### Try it

```bash
# full inventory
./cmdb_inventory.py --list | jq

# a single host's variables
./cmdb_inventory.py --host psgehvpr1

# native Ansible tooling
ansible-inventory -i cmdb_inventory.py --graph
ansible -i cmdb_inventory.py all -m ping
ansible-playbook -i cmdb_inventory.py site.yml
```

### Groups produced

| Group prefix        | Example            | Members                              |
|---------------------|--------------------|--------------------------------------|
| `physical_servers`  | —                  | all bare-metal servers               |
| `virtual_machines`  | —                  | all VMs                              |
| `network_devices`   | —                  | switches / routers / firewalls / APs |
| `containers`        | —                  | containers & apps                    |
| `role_*`            | `role_hv`          | grouped by device role               |
| `os_*`              | `os_lx`            | grouped by OS family                 |
| `type_*`            | `type_sw`          | network devices grouped by type      |
| `site_*`            | `site_vfvsc…`      | grouped by site                      |

Each host carries useful `hostvars`, e.g. `ansible_host` (management IPv4),
`cmdb_type`, `site`, `role`, `os_family`, `ilo_ipmi_ipv4`, `management_fqdn`,
`vf_long_name`.

### Making it the default inventory

Add an `ansible.cfg` next to your playbooks:

```ini
[defaults]
inventory = ./cmdb_inventory.py
host_key_checking = False
```

---

## 2. Writing facts back to the CMDB

The API exposes:

```
POST /api/v1/devices/{device_type}/{device_id}/facts
```

where `device_type` is one of `physical-servers`, `virtual-machines`,
`network-devices`, `workstations`, `containers-apps`. The JSON body is a map of
column → value. Every change is recorded in the changelog with
`change_source = ansible_callback`.

### Example task

```yaml
- name: Push gathered facts back to the CMDB
  hosts: physical_servers
  gather_facts: true
  tasks:
    - name: Update CMDB record
      ansible.builtin.uri:
        url: "{{ cmdb_api_url }}/devices/physical-servers/{{ cmdb_id }}/facts"
        method: POST
        body_format: json
        body:
          os_version: "{{ ansible_distribution_version }}"
          serial_number: "{{ ansible_product_serial | default(omit) }}"
        status_code: 200
      delegate_to: localhost
      vars:
        cmdb_api_url: "{{ lookup('env', 'CMDB_API_URL') }}"
```

Store the CMDB primary key on each host (for example as `cmdb_id`) so the
playbook knows which record to update. You can expose it through the inventory
by adding it to the host vars in a future iteration, or map by `vf_short_name`.

---

## 3. Generic entities (`ansible_managed` capability) — Gather_Facts_Sync

Custom asset types built in the Entity Type Builder don't appear in the
dynamic inventory above — they have no OS/role/site columns to group by.
Instead, any record whose type carries the `ansible_managed` capability
automatically gets its own single-host static Semaphore Inventory (kept in
sync on every create/update/delete — see `backend/app/lifecycle_sync.py`),
reachable from its detail page's Automation tab (`launch` an existing
Semaphore template against it, poll status/output — no dynamic-inventory
script needed for this path).

**Template convention:** name any playbook/template intended for fact
gathering with a `gather-facts-` prefix (e.g. `gather-facts-linux`,
`gather-facts-network`) so it's recognizable in the Automation tab's
template list. The template itself only needs to gather facts and push them
back — launching it is already handled by the existing
`POST /automation/generic-entities/{id}/launch` endpoint (Phase 5 Sub-phase
F); Task 38 adds no new launch mechanism.

**Ingestion endpoint:**

```
POST /api/v1/generic-entities/{entity_id}/facts
```

Same JSON body shape (column → value) and `ansible_callback` change-source
as the device-table endpoint above, merged into the record's own
`ansible_facts` JSONB blob (`cpu_cores`/`memory_mb`/`os_distribution` are
promoted to their own columns too). Returns 400 if the record's Entity_Type_Def
does not carry the `ansible_managed` capability.

The record's single-host inventory carries a `cmdb_id` host variable (added
alongside `ansible_user`/`vf_cmdb_bw_secret_id`) for exactly this purpose:

```yaml
- name: Push gathered facts back to the CMDB (generic entity)
  hosts: all
  gather_facts: true
  tasks:
    - name: Update CMDB record
      ansible.builtin.uri:
        url: "{{ cmdb_api_url }}/generic-entities/{{ cmdb_id }}/facts"
        method: POST
        body_format: json
        body:
          os_distribution: "{{ ansible_distribution }} {{ ansible_distribution_version }}"
          cpu_cores: "{{ ansible_processor_vcpus }}"
          memory_mb: "{{ ansible_memtotal_mb }}"
        status_code: 200
      delegate_to: localhost
      vars:
        cmdb_api_url: "{{ lookup('env', 'CMDB_API_URL') }}"
```

---

## Notes

* The script uses only the Python standard library — no `pip install` needed.
* If the API is unreachable the script exits non-zero and prints the reason to
  stderr, so Ansible fails fast instead of running against a stale/empty list.
