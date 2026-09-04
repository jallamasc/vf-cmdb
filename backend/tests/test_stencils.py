"""FEAT-6 (6B) — Stencil service: cache-first, upload, air-gap 404, bad slug.

Feature: rack-back-and-cabling
Covers Requirements 4 (download+cache+air-gap) and 5 (manual upload).
Uses the module's helpers directly so no live Visio Café is contacted.
"""
import pathlib
import tempfile

import pytest

from app import stencils


@pytest.fixture(autouse=True)
def _tmp_cache(monkeypatch):
    """Redirect the on-disk cache to a temp dir for every test."""
    tmp = pathlib.Path(tempfile.mkdtemp()) / "stencils"
    monkeypatch.setattr(stencils, "CACHE_DIR", tmp)
    yield tmp


def test_invalid_slug_rejected():
    with pytest.raises(stencils.InvalidSlug):
        stencils.validate_slug("Bad_Slug")
    with pytest.raises(stencils.InvalidSlug):
        stencils.validate_slug("../etc/passwd")
    assert stencils.validate_slug("network-device-types-3") == "network-device-types-3"


def test_upload_non_svg_rejected():
    with pytest.raises(stencils.InvalidStencil):
        stencils.store_bytes("switch-model", b"not an svg", "text/plain")


def test_store_and_serve_cache_first():
    svg = b'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
    path = stencils.store_bytes("switch-model", svg, "image/svg+xml")
    assert path.is_file()
    assert stencils.is_cached("switch-model")
    assert stencils.cache_path("switch-model").read_bytes() == svg


def test_download_unreachable_returns_none():
    # Property 6: air-gap safe — an unreachable URL yields None, never raises.
    assert stencils.download_and_cache("switch-model", "http://127.0.0.1:9/none.svg") is None
    assert not stencils.is_cached("switch-model")


def test_svg_detection_by_body():
    # Body starting with <svg is accepted even without an svg content-type.
    svg = b"<svg xmlns='http://www.w3.org/2000/svg'></svg>"
    assert stencils._looks_like_svg(svg, "application/octet-stream")
    assert not stencils._looks_like_svg(b"hello", "text/plain")
