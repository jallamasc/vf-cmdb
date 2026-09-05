"""FEAT-6 (6B): Visio Café stencil cache.

Stencils are per-device-model SVG graphics used by the rack diagram. This module
owns the on-disk cache and the (network-optional) download so the API layer in
``routers/special.py`` stays thin.

Design goals from the spec:
- **Cache-first**: a stencil already on disk is served without ever touching the
  network, so the system works fully air-gapped once stencils are present.
- **Manual upload fallback**: admins can upload an SVG directly (air-gapped
  installs, or models Visio Café does not cover).
- **Path-traversal safe**: the model slug is validated against a strict charset
  before it is ever used to build a filesystem path.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

import httpx

# Cache directory: backend/static/stencils/. Resolved relative to this file so
# it is stable regardless of the process working directory.
_STATIC_ROOT = Path(__file__).resolve().parent.parent / "static"
CACHE_DIR = _STATIC_ROOT / "stencils"

# Same domain-name charset the model code columns use: letters/digits with
# single internal hyphens. This is the ONLY shape a model slug may take, which
# makes "{slug}.svg" safe to join onto CACHE_DIR (no dots, slashes or "..").
_SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")

# Short timeout so an unreachable Visio Café degrades quickly to "no stencil"
# instead of hanging a request.
_DOWNLOAD_TIMEOUT = 5.0


class InvalidSlug(ValueError):
    """Raised when a model slug fails the path-traversal charset guard."""


class InvalidStencil(ValueError):
    """Raised when uploaded/downloaded content is not a usable SVG."""


def ensure_cache_dir() -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)


def validate_slug(model_slug: str) -> str:
    slug = (model_slug or "").strip().lower()
    if not _SLUG_RE.match(slug):
        raise InvalidSlug(
            f"Invalid model slug '{model_slug}'. Slugs may contain only "
            "lowercase letters, digits and single hyphens."
        )
    return slug


def cache_path(model_slug: str, face: str = "front") -> Path:
    """Filesystem path of the cached SVG for a validated slug + face.

    ``front`` keeps the original (FEAT-6) filename for backward compatibility
    with any already-cached front stencils; ``back`` (Phase 4 Req 14) gets a
    distinct suffixed filename so a device can carry two different graphics.
    """
    slug = validate_slug(model_slug)
    suffix = "" if face == "front" else f"-{face}"
    return CACHE_DIR / f"{slug}{suffix}.svg"


def is_cached(model_slug: str, face: str = "front") -> bool:
    return cache_path(model_slug, face).is_file()


def _looks_like_svg(data: bytes, content_type: Optional[str]) -> bool:
    """Accept content that is declared image/svg+xml OR whose body starts with
    an <svg root (possibly after an XML/doctype prologue)."""
    if content_type and "svg" in content_type.lower():
        return True
    head = data[:2048].lstrip()
    # Strip a leading XML declaration / doctype / comments to find the root tag.
    text = head.decode("utf-8", errors="ignore").lower()
    return "<svg" in text


def store_bytes(
    model_slug: str, data: bytes, content_type: Optional[str] = None, face: str = "front"
) -> Path:
    """Validate SVG content and write it into the cache, overwriting any copy."""
    if not _looks_like_svg(data, content_type):
        raise InvalidStencil(
            "Uploaded file is not an SVG (expected image/svg+xml or an <svg> root)."
        )
    ensure_cache_dir()
    path = cache_path(model_slug, face)
    path.write_bytes(data)
    return path


def download_and_cache(model_slug: str, url: str, face: str = "front") -> Optional[Path]:
    """Download an SVG from ``url`` into the cache; return the path or None.

    Any network/HTTP error (unreachable Visio Café, timeout, 404, non-SVG body)
    returns None instead of raising, so the caller can fall back to a 404 and
    the system keeps working air-gapped.
    """
    if not url:
        return None
    try:
        resp = httpx.get(url, timeout=_DOWNLOAD_TIMEOUT, follow_redirects=True)
        resp.raise_for_status()
    except (httpx.HTTPError, httpx.InvalidURL):
        return None
    data = resp.content
    if not _looks_like_svg(data, resp.headers.get("content-type")):
        return None
    ensure_cache_dir()
    path = cache_path(model_slug, face)
    path.write_bytes(data)
    return path
