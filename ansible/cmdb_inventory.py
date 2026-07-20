#!/usr/bin/env python3
"""
Ansible dynamic inventory script for the Virtualfactor IT CMDB.

It fetches the live inventory (already formatted for Ansible) from the CMDB
REST API and returns it on stdout. Ansible calls this script with either
``--list`` (return the whole inventory) or ``--host <name>`` (return host vars
for a single host).

Configuration (environment variables):
    CMDB_API_URL   Base URL of the CMDB API.
                   Default: http://localhost:8000/api/v1
    CMDB_TIMEOUT   HTTP timeout in seconds. Default: 10

Usage:
    ./cmdb_inventory.py --list
    ./cmdb_inventory.py --host psgehvpr1
    ansible-inventory -i cmdb_inventory.py --graph
    ansible-playbook -i cmdb_inventory.py site.yml

The script depends only on the Python standard library so it can run anywhere
Ansible runs, without installing extra packages.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from urllib.request import urlopen
from urllib.error import URLError, HTTPError

API_URL = os.environ.get("CMDB_API_URL", "http://localhost:8000/api/v1").rstrip("/")
TIMEOUT = int(os.environ.get("CMDB_TIMEOUT", "10"))


def _fetch_inventory() -> dict:
    url = f"{API_URL}/ansible/inventory"
    try:
        with urlopen(url, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (URLError, HTTPError) as exc:  # pragma: no cover - network errors
        sys.stderr.write(
            f"cmdb_inventory: failed to reach CMDB API at {url}: {exc}\n"
        )
        sys.exit(1)


def _empty_inventory() -> dict:
    return {"_meta": {"hostvars": {}}}


def main() -> None:
    parser = argparse.ArgumentParser(description="CMDB dynamic inventory")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--list", action="store_true", help="List the full inventory")
    group.add_argument("--host", help="Return host variables for a single host")
    args = parser.parse_args()

    inventory = _fetch_inventory()

    if args.list:
        print(json.dumps(inventory, indent=2, sort_keys=True))
        return

    # --host <name>: return that host's vars from _meta.hostvars
    hostvars = inventory.get("_meta", {}).get("hostvars", {})
    print(json.dumps(hostvars.get(args.host, {}), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
