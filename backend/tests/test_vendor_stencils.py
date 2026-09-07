"""Phase 6 Task 23 (Requirements 9.2/9.3) — Vendor_Stencil_Source registry.

Network access is mocked throughout — these verify this module's own logic
(cache-dir keying, download-once-then-cache-hit behavior, zip-slip guard,
error mapping), not any real vendor's ZIP.
"""
import io
import zipfile
from pathlib import Path
from unittest.mock import patch

import pytest

from app import vendor_stencils as vs


def _make_zip_bytes(members: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, content in members.items():
            zf.writestr(name, content)
    return buf.getvalue()


class FakeHttpResponse:
    def __init__(self, content: bytes):
        self.content = content

    def raise_for_status(self):
        pass


def test_list_vendors_and_product_lines():
    vendors = vs.list_vendors()
    assert {"key": "Microsoft", "label": "Microsoft"} in vendors

    lines = vs.list_product_lines("Microsoft")
    assert any(p["key"] == "network-equipment-shapes" for p in lines)


def test_list_product_lines_unknown_vendor_raises():
    with pytest.raises(vs.UnknownVendor):
        vs.list_product_lines("NoSuchVendor")


def test_fetch_and_extract_downloads_once_and_caches(tmp_path):
    """Requirement 9.3 — only the selected entry's ZIP is downloaded, and a
    second call for the SAME entry makes no further network call."""
    fake_registry = {
        "Acme": [vs.ProductLine(key="rack-line", label="Rack Line", zip_url="https://example.invalid/acme.zip")],
    }
    zip_bytes = _make_zip_bytes({
        "Acme Rack.vss": b"stencil-a",
        "nested/Acme Rack Rear.vssx": b"stencil-b",
        "readme.txt": b"not a stencil",
    })

    with patch.object(vs, "VENDOR_STENCIL_SOURCES", fake_registry), \
         patch.object(vs, "_CACHE_ROOT", tmp_path), \
         patch("httpx.get", return_value=FakeHttpResponse(zip_bytes)) as mock_get:
        files_first = vs.fetch_and_extract("Acme", "rack-line")
        files_second = vs.fetch_and_extract("Acme", "rack-line")

    assert mock_get.call_count == 1  # cache hit on the second call
    assert files_first == files_second
    assert "Acme Rack.vss" in files_first
    assert str(Path("nested") / "Acme Rack Rear.vssx") in files_first
    assert "readme.txt" not in files_first  # non-stencil member excluded


def test_fetch_and_extract_unknown_vendor_raises():
    with pytest.raises(vs.UnknownVendor):
        vs.fetch_and_extract("NoSuchVendor", "whatever")


def test_fetch_and_extract_unknown_product_line_raises():
    with pytest.raises(vs.UnknownProductLine):
        vs.fetch_and_extract("Microsoft", "no-such-product-line")


def test_fetch_and_extract_download_failure_raises(tmp_path):
    import httpx as httpx_module

    fake_registry = {
        "Acme": [vs.ProductLine(key="rack-line", label="Rack Line", zip_url="https://example.invalid/acme.zip")],
    }

    def raise_http_error(*a, **k):
        raise httpx_module.ConnectError("boom")

    with patch.object(vs, "VENDOR_STENCIL_SOURCES", fake_registry), \
         patch.object(vs, "_CACHE_ROOT", tmp_path), \
         patch("httpx.get", side_effect=raise_http_error):
        with pytest.raises(vs.DownloadFailed):
            vs.fetch_and_extract("Acme", "rack-line")


def test_fetch_and_extract_bad_zip_raises(tmp_path):
    fake_registry = {
        "Acme": [vs.ProductLine(key="rack-line", label="Rack Line", zip_url="https://example.invalid/acme.zip")],
    }
    with patch.object(vs, "VENDOR_STENCIL_SOURCES", fake_registry), \
         patch.object(vs, "_CACHE_ROOT", tmp_path), \
         patch("httpx.get", return_value=FakeHttpResponse(b"not a real zip")):
        with pytest.raises(vs.DownloadFailed):
            vs.fetch_and_extract("Acme", "rack-line")


def test_safe_extract_refuses_zip_slip(tmp_path):
    """A ZIP crafted with a path-traversal member must never be extracted
    outside the target directory."""
    fake_registry = {
        "Evil": [vs.ProductLine(key="line", label="Line", zip_url="https://example.invalid/evil.zip")],
    }
    zip_bytes = _make_zip_bytes({"../../etc/passwd": b"pwned"})

    with patch.object(vs, "VENDOR_STENCIL_SOURCES", fake_registry), \
         patch.object(vs, "_CACHE_ROOT", tmp_path), \
         patch("httpx.get", return_value=FakeHttpResponse(zip_bytes)):
        with pytest.raises(vs.DownloadFailed):
            vs.fetch_and_extract("Evil", "line")

    # Nothing escaped into tmp_path's parent chain.
    assert not (tmp_path.parent / "etc").exists()


def test_resolve_extracted_file_after_fetch(tmp_path):
    fake_registry = {
        "Acme": [vs.ProductLine(key="rack-line", label="Rack Line", zip_url="https://example.invalid/acme.zip")],
    }
    zip_bytes = _make_zip_bytes({"Acme Rack.vss": b"stencil-a"})

    with patch.object(vs, "VENDOR_STENCIL_SOURCES", fake_registry), \
         patch.object(vs, "_CACHE_ROOT", tmp_path), \
         patch("httpx.get", return_value=FakeHttpResponse(zip_bytes)):
        vs.fetch_and_extract("Acme", "rack-line")
        resolved = vs.resolve_extracted_file("Acme", "rack-line", "Acme Rack.vss")

    assert resolved.is_file()
    assert resolved.read_bytes() == b"stencil-a"


def test_resolve_extracted_file_path_traversal_raises(tmp_path):
    fake_registry = {
        "Acme": [vs.ProductLine(key="rack-line", label="Rack Line", zip_url="https://example.invalid/acme.zip")],
    }
    zip_bytes = _make_zip_bytes({"Acme Rack.vss": b"stencil-a"})

    with patch.object(vs, "VENDOR_STENCIL_SOURCES", fake_registry), \
         patch.object(vs, "_CACHE_ROOT", tmp_path), \
         patch("httpx.get", return_value=FakeHttpResponse(zip_bytes)):
        vs.fetch_and_extract("Acme", "rack-line")
        with pytest.raises(FileNotFoundError):
            vs.resolve_extracted_file("Acme", "rack-line", "../../../etc/passwd")


def test_resolve_extracted_file_unknown_pair_raises(tmp_path):
    with patch.object(vs, "_CACHE_ROOT", tmp_path):
        with pytest.raises(FileNotFoundError):
            vs.resolve_extracted_file("NoSuchVendor", "whatever", "x.vss")
