"""Phase 6 Task 30 (Requirement 12.1) — endoflife.date sync for OsFamily/
OsVersion.

Populates OsFamily/OsVersion rows from https://endoflife.date's public v1
API (https://endoflife.date/docs/api/v1/) for a curated, defined set of
server/platform OS products — NOT the site's full ~470-product catalogue,
most of which covers frameworks, languages and cloud services out of scope
for OsFamily/OsVersion (which model operating systems a piece of hardware
or a VM actually runs). Every slug in ``CURATED_PRODUCTS`` was verified
live against ``GET /api/v1/products`` before being hardcoded here — no
guessed slugs, matching this codebase's established discipline for every
other curated external-source list (see ``stencil_sources.py``'s
``VISIOCAFE_CATEGORIES`` and ``vendor_stencils.py``'s own docstring).

Runs at seed time (``seed.py``, idempotent) and via a manual trigger
(``POST /api/v1/os-data/sync``, see ``routers/special.py``) per
Requirement 12.1's "at seed time and via a manual trigger" wording.

Idempotent the SAME way ``seed.py``'s own ``_seed_lookups()`` is: matched
case-insensitively by ``abbreviation`` (not ``full_name``), so re-running
only inserts genuinely new rows and never clobbers a user's edits. Every
new row's abbreviation is registered through ``abbrev.sync_registry`` (the
SAME global cross-table uniqueness namespace every other lookup
abbreviation participates in) — a real collision is skipped (not fatal to
the rest of the sync) and reported back in the result.

Note: this ADDS TO, rather than replaces or deduplicates against, the
hand-picked demo OsFamily/OsVersion rows ``seed.py`` already creates (e.g.
"ESXi"/"es", "Windows"/"wn") — those are coarse, curated demo-topology
categories from an earlier phase; this sync's rows are the real,
accurately-versioned product data endoflife.date tracks, added alongside
them under their own distinct abbreviations (e.g. "esxi", "windows"). An
administrator can freely retire the old demo rows once real synced data
covers the same ground; this module makes no assumption about that and
never deletes anything.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from . import abbrev, models

BASE_URL = "https://endoflife.date/api/v1"
REQUEST_TIMEOUT = 15.0

CURATED_PRODUCTS = [
    "ubuntu",
    "debian",
    "rhel",
    "centos-stream",
    "centos",
    "rocky-linux",
    "almalinux",
    "fedora",
    "sles",
    "opensuse",
    "oracle-linux",
    "amazon-linux",
    "freebsd",
    "windows-server",
    "windows",
    "macos",
    "esxi",
]

_NON_ALNUM_RE = re.compile(r"[^A-Za-z0-9]+")
_MULTI_HYPHEN_RE = re.compile(r"-{2,}")


def _slugify(text: str) -> str:
    """Sanitize into the domain-name charset ``abbrev.validate_charset``
    requires: letters/digits/hyphens only, no leading/trailing/consecutive
    hyphens. Product slugs are already domain-style so this is a no-op for
    them; version names (``"26.04"``, ``"10 (Upcoming ELS)"``) need it."""
    slug = _NON_ALNUM_RE.sub("-", text).strip("-").lower()
    return _MULTI_HYPHEN_RE.sub("-", slug)


@dataclass
class SyncResult:
    families_created: list[str] = field(default_factory=list)
    versions_created: list[str] = field(default_factory=list)
    skipped_conflicts: list[str] = field(default_factory=list)
    products_unreachable: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, list[str]]:
        return {
            "families_created": self.families_created,
            "versions_created": self.versions_created,
            "skipped_conflicts": self.skipped_conflicts,
            "products_unreachable": self.products_unreachable,
        }


async def fetch_product(product_slug: str, client: Optional[httpx.AsyncClient] = None) -> dict:
    """The ``"result"`` object from ``GET /api/v1/products/{slug}``.

    ``client`` is injectable (mirrors ``semaphore_client.SemaphoreClient``'s
    own DI pattern) so tests can pass an ``httpx.MockTransport``-backed
    client instead of hitting the real endoflife.date API.
    """
    owns_client = client is None
    http_client = client or httpx.AsyncClient(timeout=REQUEST_TIMEOUT)
    try:
        resp = await http_client.get(f"{BASE_URL}/products/{product_slug}")
        resp.raise_for_status()
        return resp.json()["result"]
    finally:
        if owns_client:
            await http_client.aclose()


async def sync_products(
    session: AsyncSession,
    products: list[str] | None = None,
    client: Optional[httpx.AsyncClient] = None,
) -> SyncResult:
    """Requirement 12.1 — populate OsFamily/OsVersion from endoflife.date
    for each product slug in *products* (defaults to CURATED_PRODUCTS).

    Never raises on a single product's failure — an unreachable product or
    an abbreviation conflict is recorded in the returned SyncResult and the
    sync continues with the rest.
    """
    result = SyncResult()
    existing_families = {
        (r.abbreviation or "").lower(): r
        for r in (await session.execute(select(models.OsFamily))).scalars().all()
    }
    existing_versions = {
        (r.abbreviation or "").lower(): r
        for r in (await session.execute(select(models.OsVersion))).scalars().all()
    }

    for slug in products or CURATED_PRODUCTS:
        try:
            product = await fetch_product(slug, client=client)
        except httpx.HTTPError:
            result.products_unreachable.append(slug)
            continue

        family_label = product.get("label") or slug
        family_abbr = _slugify(slug)
        family = existing_families.get(family_abbr.lower())
        if family is None:
            family = models.OsFamily(full_name=family_label[:120], abbreviation=family_abbr[:20])
            session.add(family)
            await session.flush()
            try:
                await abbrev.sync_registry(
                    session, "os_families", family.id, "abbreviation", family.abbreviation
                )
            except HTTPException:
                await session.delete(family)
                await session.flush()
                result.skipped_conflicts.append(f"os_families.{family_abbr}")
                continue
            existing_families[family_abbr.lower()] = family
            result.families_created.append(family_label)

        for release in product.get("releases", []):
            version_name = (release.get("name") or "").strip()
            if not version_name:
                continue
            version_full_name = f"{family_label} {version_name}"[:120]
            version_abbr = f"{family_abbr}-{_slugify(version_name)}"[:20].strip("-")
            if not version_abbr or version_abbr.lower() in existing_versions:
                continue
            version = models.OsVersion(full_name=version_full_name, abbreviation=version_abbr)
            session.add(version)
            await session.flush()
            try:
                await abbrev.sync_registry(
                    session, "os_versions", version.id, "abbreviation", version.abbreviation
                )
            except HTTPException:
                await session.delete(version)
                await session.flush()
                result.skipped_conflicts.append(f"os_versions.{version_abbr}")
                continue
            existing_versions[version_abbr.lower()] = version
            result.versions_created.append(version_full_name)

    return result
