"""IPAM allocation helpers: gap-aware, anchor-based reservation + host logic.

These are **pure functions** (no DB access) so the allocation maths can be unit
tested in isolation. The router layer (``routers/ipam.py``) is responsible for
loading the relevant subnet, active assignments and reserved role-assignments
from the database and passing the resolved address sets in here.

Terminology
-----------
* **anchor** — the direction reservations (and, optionally, host allocation)
  walk the usable host range:
    - ``from_end``   : start at the *last* usable host and walk downward
                        (default per the Phase 2 spec — …254, …253, …252 for a /24).
    - ``from_start`` : start at the *first* usable host and walk upward.
* **gap-aware** — freed addresses that sit *before* the current allocation
  frontier are reported as reusable ``gaps`` so the UI can offer to reuse a hole
  instead of always taking the next brand-new address (mirrors the Phase 1
  naming ``SequenceGapHelper`` UX).
"""
from __future__ import annotations

import ipaddress
from typing import Optional, Union

IPAddress = Union[ipaddress.IPv4Address, ipaddress.IPv6Address]
IPNetwork = Union[ipaddress.IPv4Network, ipaddress.IPv6Network]

ANCHOR_FROM_END = "from_end"
ANCHOR_FROM_START = "from_start"
VALID_ANCHORS = (ANCHOR_FROM_END, ANCHOR_FROM_START)


def parse_network(cidr: str) -> IPNetwork:
    """Parse a CIDR string into an ip_network (host bits allowed)."""
    return ipaddress.ip_network(str(cidr), strict=False)


def parse_address(value: Optional[str]) -> Optional[IPAddress]:
    """Parse an address that may carry a ``/prefix`` suffix (INET columns)."""
    if value is None:
        return None
    text = str(value).split("/")[0].strip()
    if not text:
        return None
    return ipaddress.ip_address(text)


def host_list(
    net: IPNetwork,
    range_from: Optional[IPAddress] = None,
    range_to: Optional[IPAddress] = None,
) -> list[IPAddress]:
    """Return the usable host addresses of *net* within an optional range.

    Ordered ascending. Network and broadcast addresses are excluded via
    ``net.hosts()``. ``range_from`` / ``range_to`` (inclusive) further clamp the
    window; ``None`` means "no bound on that side".
    """
    hosts: list[IPAddress] = []
    for host in net.hosts():
        if range_from is not None and host < range_from:
            continue
        if range_to is not None and host > range_to:
            break
        hosts.append(host)
    return hosts


def _seq(hosts: list[IPAddress], anchor: str) -> list[IPAddress]:
    """Order the ascending *hosts* list according to the walk *anchor*."""
    if anchor == ANCHOR_FROM_END:
        return list(reversed(hosts))
    return list(hosts)


def allocate(
    hosts: list[IPAddress],
    occupied: set[str],
    anchor: str = ANCHOR_FROM_START,
) -> dict:
    """Gap-aware allocation over *hosts* skipping *occupied* addresses.

    Returns a dict with:
      * ``recommended``     — the address to hand out (first reusable gap, else
                              the next sequential address); ``None`` if full.
      * ``next_gap``        — first reusable freed address before the frontier.
      * ``next_sequential`` — first free address at/after the frontier.
      * ``gaps``            — all reusable freed addresses before the frontier.
      * ``free_count``      — number of free addresses in range.

    The walk honours *anchor*: ``from_start`` walks low→high, ``from_end``
    walks high→low. "Before the frontier" is expressed in walk order, so for
    ``from_end`` a gap is a free address numerically *above* the lowest taken
    address.
    """
    seq = _seq(hosts, anchor)
    occupied_positions = [i for i, h in enumerate(seq) if str(h) in occupied]
    frontier = occupied_positions[-1] if occupied_positions else -1

    gaps = [seq[i] for i in range(0, frontier) if str(seq[i]) not in occupied]

    next_sequential: Optional[IPAddress] = None
    for i in range(frontier + 1, len(seq)):
        if str(seq[i]) not in occupied:
            next_sequential = seq[i]
            break

    next_gap = gaps[0] if gaps else None
    recommended = next_gap if next_gap is not None else next_sequential
    free_count = sum(1 for h in seq if str(h) not in occupied)

    return {
        "recommended": recommended,
        "next_gap": next_gap,
        "next_sequential": next_sequential,
        "gaps": gaps,
        "free_count": free_count,
    }


def compute_reserved_pool(
    hosts: list[IPAddress],
    reserved_count: int,
    anchor: str,
    explicit_reserved: set[str],
    used: set[str],
) -> dict:
    """Resolve the reserved-IP pool for a segment.

    The pool is the union of:
      * **explicit** reservations (existing ``subnet_role_assignments`` rows that
        fall within the usable range), and
      * **auto** slots filled from the *anchor* — gap-aware, skipping addresses
        already taken by active host assignments (*used*) or already reserved —
        until the total reserved count reaches ``reserved_count``.

    Returns a dict with ordered (walk-order) ``reserved``, ``explicit`` and
    ``auto`` address lists.
    """
    seq = _seq(hosts, anchor)
    explicit_present = [h for h in seq if str(h) in explicit_reserved]
    reserved: set[str] = {str(h) for h in explicit_present}

    auto_needed = max(0, int(reserved_count or 0) - len(reserved))
    auto: list[IPAddress] = []
    for host in seq:
        if len(auto) >= auto_needed:
            break
        key = str(host)
        if key in used or key in reserved:
            continue
        auto.append(host)
        reserved.add(key)

    ordered_reserved = [h for h in seq if str(h) in reserved]
    return {
        "reserved": ordered_reserved,
        "explicit": explicit_present,
        "auto": auto,
    }


def next_reserved_ip(
    hosts: list[IPAddress],
    anchor: str,
    explicit_reserved: set[str],
    used: set[str],
) -> dict:
    """Compute the next reservation slot per *anchor*, gap-aware.

    A reservation may not land on an address already reserved or already taken
    by an active host assignment, so both sets are treated as occupied.
    """
    occupied = set(explicit_reserved) | set(used)
    return allocate(hosts, occupied, anchor)
