"""Phase 4 Task 30 — stencil source catalogue (Requirement 22.1/22.2).

All GitHub API calls are mocked — these tests verify this module's OWN
filtering/parsing/error-mapping logic, not GitHub's actual current content
(that was verified live, separately, while building this feature).
"""
from unittest.mock import patch

import httpx
import pytest

from app import stencil_sources as ss


def _http_error(*args, **kwargs):
    raise httpx.ConnectError("boom")


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


def test_list_categories_github_returns_only_directories():
    payload = [
        {"name": "Computer Racks", "type": "dir"},
        {"name": "IT Vendors", "type": "dir"},
        {"name": "Knit Basic v2003.vss", "type": "file"},  # loose file, not a category
    ]
    with patch("httpx.get", return_value=_FakeResponse(payload)):
        cats = ss.list_categories("github")
    assert {"key": "Computer Racks", "label": "Computer Racks"} in cats
    assert {"key": "IT Vendors", "label": "IT Vendors"} in cats
    assert len(cats) == 2


def test_list_categories_visiocafe_empty_by_default():
    # Documented, intentional: no entries until an admin curates real ones.
    assert ss.list_categories("visiocafe") == []


def test_list_categories_unknown_source_raises():
    with pytest.raises(ss.UnknownSource):
        ss.list_categories("bogus")


def test_list_categories_github_source_unavailable_on_http_error():
    with patch("httpx.get", side_effect=_http_error):
        with pytest.raises(ss.SourceUnavailable):
            ss.list_categories("github")


def test_list_files_github_filters_to_vss_extensions_only():
    payload = [
        {"name": "APC PDU.vss", "type": "file", "download_url": "https://x/apc.vss", "size": 100},
        {"name": "Cisco Switch.vssx", "type": "file", "download_url": "https://x/cisco.vssx", "size": 200},
        {"name": "readme.md", "type": "file", "download_url": "https://x/readme.md", "size": 10},
    ]
    with patch("httpx.get", return_value=_FakeResponse(payload)):
        files = ss.list_files("github", "Computer Racks")
    names = {f.name for f in files}
    assert names == {"APC PDU.vss", "Cisco Switch.vssx"}


def test_list_files_github_recurses_one_level_into_nested_dirs():
    top_level = [
        {"name": "Cisco", "type": "dir"},
        {"name": "Loose.vss", "type": "file", "download_url": "https://x/loose.vss", "size": 5},
    ]
    nested = [
        {"name": "Cisco 2960.vss", "type": "file", "download_url": "https://x/2960.vss", "size": 50},
    ]

    def fake_get(url, **kwargs):
        if url.endswith("Cisco"):
            return _FakeResponse(nested)
        return _FakeResponse(top_level)

    with patch("httpx.get", side_effect=fake_get):
        files = ss.list_files("github", "IT Vendors")
    names = {f.name for f in files}
    assert "Loose.vss" in names
    assert "Cisco/Cisco 2960.vss" in names


def test_list_files_visiocafe_unknown_category_raises():
    with pytest.raises(ss.UnknownCategory):
        ss.list_files("visiocafe", "Nonexistent Vendor")


def test_list_files_visiocafe_known_category_returns_curated_entries():
    ss.VISIOCAFE_CATEGORIES["_TestVendor"] = [
        ss.StencilFile(name="test.vss", download_url="https://example.com/test.vss")
    ]
    try:
        files = ss.list_files("visiocafe", "_TestVendor")
        assert len(files) == 1
        assert files[0].name == "test.vss"
    finally:
        del ss.VISIOCAFE_CATEGORIES["_TestVendor"]


def test_resolve_file_found_and_not_found():
    payload = [
        {"name": "APC PDU.vss", "type": "file", "download_url": "https://x/apc.vss", "size": 100},
    ]
    with patch("httpx.get", return_value=_FakeResponse(payload)):
        found = ss.resolve_file("github", "Computer Racks", "APC PDU.vss")
        assert found.download_url == "https://x/apc.vss"
        with pytest.raises(FileNotFoundError):
            ss.resolve_file("github", "Computer Racks", "Does Not Exist.vss")
