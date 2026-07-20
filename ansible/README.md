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

## Notes

* The script uses only the Python standard library — no `pip install` needed.
* If the API is unreachable the script exits non-zero and prints the reason to
  stderr, so Ansible fails fast instead of running against a stale/empty list.
