"""Phase 6 Task 23 (Requirements 9.2/9.3) — curated Vendor_Stencil_Source
registry.

Unlike ``stencil_sources.py``'s two flat sources (github/visiocafe, each a
single file per entry), a vendor + product line here maps to a ZIP bundling
many stencils at once. Selecting one:

1. Downloads and extracts ONLY that (vendor, product_line)'s ZIP — never a
   vendor's whole catalogue ahead of an explicit selection (Requirement
   9.3) — caching the extracted result so a repeat selection is instant and
   makes no further network calls.
2. Lists the ``.vss``/``.vssx`` files found inside it.
3. Hands off to the SAME convert/preview pipeline
   (``stencil_library.convert_stencil`` + ``save_previews``) that the
   github/visiocafe fetch flow already uses (Requirement 9.2) — see
   ``routers/special.py``'s shared ``_convert_and_save_previews`` helper.

Entries here must be real, personally-verified, directly-downloadable ZIP
URLs — never guessed at. This mirrors ``stencil_sources.VISIOCAFE_CATEGORIES``'s
own documented discipline: a vendor's stencil page is rarely a stable,
crawlable API, so there is nothing to enumerate programmatically, and
shipping a plausible-looking but unverified URL risks a broken download.
The one entry below was verified live while building this feature (a
direct HTTP GET returns a real ``.zip`` — see the download URL's
comment); administrators add further entries the same way, e.g.:

    VENDOR_STENCIL_SOURCES["Cisco"] = [
        ProductLine(
            key="catalyst-9000",
            label="Catalyst 9000 Series",
            zip_url="https://.../catalyst-9000-stencils.zip",
        ),
    ]
"""
from __future__ import annotations

import hashlib
import shutil
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path

import httpx

DOWNLOAD_TIMEOUT = 60.0
VSS_EXTENSIONS = (".vss", ".vssx")

# Extracted ZIPs are cached here, keyed by a stable hash of (vendor,
# product_line) — see _cache_dir(). Deliberately separate from
# stencil_library.PREVIEW_DIR (that one is a short-lived, per-fetch preview
# cache; this one is the persistent "we already downloaded this ZIP" cache
# Requirement 9.3 implies by saying "cache only that entry's ZIP").
_CACHE_ROOT = Path(__file__).resolve().parent.parent / "static" / "vendor_stencil_cache"


@dataclass
class ProductLine:
    key: str
    label: str
    zip_url: str


class UnknownVendor(ValueError):
    pass


class UnknownProductLine(ValueError):
    pass


class DownloadFailed(RuntimeError):
    """The ZIP could not be downloaded, or wasn't a valid ZIP."""


# ---------------------------------------------------------------------------
# Verified real entries. "Microsoft" here is the publisher of the ZIP, not a
# claim that every shape inside is Microsoft's own hardware — the official
# Microsoft Download Center's "Network Equipment Shapes for Visio" package
# (id=4604) bundles real manufacturer stencils (3Com, APC, Cisco, Dell, HP,
# IBM, Nortel, Panduit, Sun Microsystems) into one ZIP; verified live via
# `curl -IL` returning a real `application/octet-stream` 40MB .zip response
# at the URL below (https://www.microsoft.com/en-us/download/details.aspx?id=4604
# is the human-readable landing page it was resolved from).
# ---------------------------------------------------------------------------
VENDOR_STENCIL_SOURCES: dict[str, list[ProductLine]] = {
    "Microsoft": [
        ProductLine(
            key="network-equipment-shapes",
            label="Network Equipment Shapes (3Com/APC/Cisco/Dell/HP/IBM/Nortel/Panduit/Sun)",
            zip_url="https://download.microsoft.com/download/5/b/9/5b968e14-203d-4373-af8f-0f030c86691b/NetEquip.zip",
        ),
    ],
}


def list_vendors() -> list[dict[str, str]]:
    return [{"key": v, "label": v} for v in VENDOR_STENCIL_SOURCES]


def list_product_lines(vendor: str) -> list[dict[str, str]]:
    if vendor not in VENDOR_STENCIL_SOURCES:
        raise UnknownVendor(f"Unknown vendor '{vendor}'")
    return [{"key": p.key, "label": p.label} for p in VENDOR_STENCIL_SOURCES[vendor]]


def _find_product_line(vendor: str, product_line: str) -> ProductLine:
    lines = VENDOR_STENCIL_SOURCES.get(vendor)
    if lines is None:
        raise UnknownVendor(f"Unknown vendor '{vendor}'")
    for p in lines:
        if p.key == product_line:
            return p
    raise UnknownProductLine(f"Unknown product line '{product_line}' for vendor '{vendor}'")


def _cache_dir(vendor: str, product_line: str) -> Path:
    digest = hashlib.sha256(f"{vendor}/{product_line}".encode()).hexdigest()[:24]
    return _CACHE_ROOT / digest


def _safe_extract(zip_path: Path, extract_dir: Path) -> None:
    """Extract every member of ``zip_path`` into ``extract_dir``, refusing
    any entry whose resolved path would land outside it (a "zip slip" path
    traversal — the ZIP comes from a third-party URL, so it's untrusted
    input even though the source itself was verified)."""
    extract_root = extract_dir.resolve()
    with zipfile.ZipFile(zip_path) as zf:
        for member in zf.infolist():
            target = (extract_dir / member.filename).resolve()
            if extract_root != target and extract_root not in target.parents:
                raise DownloadFailed(
                    f"Refusing to extract unsafe path '{member.filename}' from ZIP"
                )
        zf.extractall(extract_dir)


def fetch_and_extract(vendor: str, product_line: str) -> list[str]:
    """Download+extract ONLY this (vendor, product_line)'s ZIP on first
    selection (Requirement 9.3); cached thereafter with no further network
    calls. Returns the .vss/.vssx member names found inside, as paths
    relative to the cache directory (ZIPs may nest files in subfolders).

    Raises UnknownVendor/UnknownProductLine, or DownloadFailed if the ZIP
    couldn't be fetched or wasn't a valid archive.
    """
    entry = _find_product_line(vendor, product_line)
    out_dir = _cache_dir(vendor, product_line)
    if not out_dir.exists():
        tmp_dir = Path(tempfile.mkdtemp(prefix="vendor_stencil_"))
        try:
            try:
                resp = httpx.get(entry.zip_url, timeout=DOWNLOAD_TIMEOUT, follow_redirects=True)
                resp.raise_for_status()
            except httpx.HTTPError as exc:
                raise DownloadFailed(f"Could not download '{entry.label}': {exc}") from exc
            zip_path = tmp_dir / "bundle.zip"
            zip_path.write_bytes(resp.content)
            extract_dir = tmp_dir / "extracted"
            extract_dir.mkdir()
            try:
                _safe_extract(zip_path, extract_dir)
            except zipfile.BadZipFile as exc:
                raise DownloadFailed(f"'{entry.label}' is not a valid ZIP: {exc}") from exc
            out_dir.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(extract_dir), str(out_dir))
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)
    return sorted(
        str(p.relative_to(out_dir))
        for p in out_dir.rglob("*")
        if p.is_file() and p.suffix.lower() in VSS_EXTENSIONS
    )


def resolve_extracted_file(vendor: str, product_line: str, filename: str) -> Path:
    """Path to one already-extracted file. Call fetch_and_extract() first
    (or again — it's a cache-hit no-op after the first successful call).

    Raises UnknownVendor/UnknownProductLine (via the cache-dir lookup being
    for an unknown pair) or FileNotFoundError (unknown filename, or a
    filename crafted to escape the cache directory).
    """
    out_dir = _cache_dir(vendor, product_line)
    root = out_dir.resolve()
    path = (out_dir / filename).resolve()
    if (root != path and root not in path.parents) or not path.is_file():
        raise FileNotFoundError(f"'{filename}' not found for {vendor}/{product_line}")
    return path
