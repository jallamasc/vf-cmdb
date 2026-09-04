# Phase 2 — Completion Report

**Project:** Virtualfactor IT CMDB
**Repository:** https://github.com/jallamasc/vf-cmdb
**Branch:** `feature/phase-2-rack-ipam` → `master`
**Date completed:** 2026-09-03
**User:** Alejandro (jallamasc), Virtualfactor, Bogotá, Colombia

---

## 1. Scope Delivered

Phase 2 covered two independent work streams: a professional Rack View SVG
upgrade (frontend) and IPAM-by-Site with a reserved-pool model (backend +
frontend).

### 1.1 Stream A — Rack View SVG upgrade
- **New component `frontend/src/components/RackDiagramSVG.tsx`** — a scalable SVG
  rack elevation:
  - Rack units numbered from the bottom (U1 … Un), mounting rails, and per-slot
    grid lines.
  - Devices rendered as rectangles scaled by `units × 19px`, coloured by device
    type, with truncated labels; empty slots shown in grey.
  - Exports a shared `TYPE_HEX` colour map (server/switch/router/firewall/pdu/
    ups/patchpanel/storage) reused by the legend.
- **`frontend/src/pages/RackView.tsx`** rewritten:
  - Cascading **Site → Datacenter → Floor → Rack** filter dropdowns.
  - Responsive multi-rack grid (2–3 columns) with Datacenter / Floor / Rack
    labels above each elevation.
  - Device-type colour legend.

### 1.2 Stream B — IPAM by Site + reserved pool
- **Migration `backend/alembic/versions/0004_ipam_by_site.py`** (guarded /
  idempotent, helpers `_has_table/_has_column/_has_fk/_has_check/_has_index/`
  `_has_unique/_col_nullable`):
  - `vlans.site_id` backfilled from the lowest site id, then set **NOT NULL**.
  - New composite `UNIQUE(site_id, vlan_id)` **alongside** the retained global
    `UNIQUE(vlan_id)` (decision Q1 — a VLAN number lives on only one site).
  - `site_id`, `reserved_count` (default 0), `reservation_anchor`
    (default `from_end`) added to **both** `subnets_ipv4` and `subnets_ipv6`.
  - `label` and `is_locked` added to `subnet_role_assignments` (the reservation
    store).
  - Subnet `site_id` backfilled from the parent VLAN. Full `downgrade()` present.
- **`backend/app/models.py`** updated to match (Vlan, SubnetIpv4, SubnetIpv6,
  SubnetRoleAssignment) + `RESERVATION_ANCHOR_VALUES` constant.
- **`backend/app/crud.py`** integrity rules wired into `create_item` /
  `update_item`:
  - **409** on duplicate global VLAN id (decision Q1).
  - **409** on overlapping CIDR within the same site, and on identical CIDR
    reuse across sites (decision Q2); non-identical overlaps across *different*
    sites are allowed (private-range reuse).
  - Auto-create **one locked `Gateway` reservation** when a subnet is created
    with a gateway (decision Q6); idempotent.
- **`backend/app/routers/special.py`** new endpoints:
  - `GET  /ipam/subnets/{id}/reservations?family=ipv4|ipv6`
  - `POST /ipam/subnets/{id}/reservations?family=…` — validates the address is
    inside the subnet (not network/broadcast), rejects duplicates, and enforces
    the `reserved_count` ceiling (locked gateway is exempt).
  - `DELETE /ipam/subnets/{id}/reservations/{res_id}` — locked reservations are
    protected (409).
  - `GET  /ipam/subnets/{id}/next-reserved` — anchor-aware (`from_end` default →
    .254, .253, …; `from_start` → first host), gap-aware, skips network/
    broadcast, gateway, existing reservations and assigned host addresses.
  - `GET  /ipam/subnets/{id}/utilization` extended to report `reserved_count`,
    `reserved_used`, and `reservation_anchor`.
  - `next-ip` continues to exclude reservations (via `_used_ipv4`, which already
    includes `SubnetRoleAssignment.ipv4_address`).
- **`backend/app/seed.py`** — VLANs and subnets attach to the Home site
  (`site_id`); subnets carry `reserved_count` / `reservation_anchor` (optional
  JSON keys, defaults preserved); every IPv4 segment with a gateway gets a
  locked `Gateway` reservation, demonstrating auto-reservation in seed data.
- **`frontend/src/pages/IPAM.tsx`** (new page, route `/ipam`, nav "IPAM by
  Site"):
  - Site selector; **Segments** tab (IPv4 primary with utilisation bar +
    reserved used/ceiling + anchor, expandable per-segment reservation manager)
    and a **collapsible IPv6** section; **VLANs** tab with site-scoped list +
    quick-add.
  - `ReservationManager`: list / add / delete reservations, "Suggest next"
    (calls `next-reserved`), locked reservations protected in the UI.
  - `api.ts` extended: `reservations`, `createReservation`, `deleteReservation`,
    `nextReserved`.

---

## 2. Design Decisions Honoured

| # | Decision | Implementation |
|---|----------|----------------|
| Q1 | Keep global `UNIQUE(vlan_id)`, add composite `UNIQUE(site_id, vlan_id)`; 409 on reuse | Migration + `crud._validate_vlan_unique` |
| Q2 | Hard-reject overlapping CIDRs within a site; reject identical CIDR reuse across sites; preserve gap-aware next-ip ordering | `crud._validate_cidr_overlap`; `next-ip` unchanged |
| Q3 | `reserved_count` integer ceiling per subnet (default 0); reservation stores IP + optional label + `is_locked`; no predefined roles | Model + POST ceiling enforcement |
| Q4 | Anchor default `from_end` (/24 → .254, .253, skip .255), gap-aware, configurable per segment | `reservation_anchor`; `next-reserved` |
| Q5 | IPv4 first, but IPv6 has full schema + same reservation endpoints; UI shows IPv6 as collapsible secondary | Both subnet tables + `family=` param; IPAM page |
| Q6 | On subnet POST with gateway, auto-create one locked `Gateway` reservation; excluded from next-ip/next-reserved; never auto-deleted | `crud._autoreserve_gateway`; seed; delete-protection |

---

## 3. Validation Performed

- `cd frontend && npm run build` → **zero TypeScript errors** (only the
  pre-existing chunk-size warning).
- `python -c "from app.main import app"` (isolated pinned venv) → **OK**; all five
  IPAM routes register (`reservations` GET/POST/DELETE, `next-reserved`).
- `backend/app/seed.py` syntax-checked.
- Migration authored with the same guarded/idempotent predicate helpers as
  0003, so re-running against an up-to-date schema is a no-op.

> Note: the local sandbox has no PostgreSQL instance, and the model uses
> Postgres-specific `INET`/`CIDR` column types, so live migration-apply and
> end-to-end request tests were **not** run here. Run
> `alembic upgrade head` + `python -m app.seed` against the Podman Postgres
> service to exercise them.

---

## 4. Commits (branch `feature/phase-2-rack-ipam`)

1. `frontend: RackDiagramSVG component + RackView hierarchy filter + multi-rack layout`
2. `backend: IPAM by site — migration 0004, model updates, validation + reservation endpoints`
3. `seed: attach VLANs+subnets to Home site; seed reserved pool + locked gateway`
4. `frontend: IPAM by Site page (VLANs + segments + reservation manager)`
