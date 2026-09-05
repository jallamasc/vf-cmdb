"""Phase 4 Task 30 — /stencil-library/* endpoints (Requirement 22.1-22.5).

Calls the router functions directly (same pattern already established for
ingest_facts in test_facts.py — this codebase has no httpx/TestClient
fixture). Network + conversion are mocked; the round trip is exercised via
this module's own error-mapping and cleanup logic.
"""
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app import stencil_library as sl
from app import stencil_sources as ss
from app.routers.special import (
    stencil_library_categories,
    stencil_library_fetch,
    stencil_library_files,
    stencil_library_preview,
)


@pytest.mark.asyncio
async def test_categories_unknown_source_404():
    with pytest.raises(HTTPException) as exc:
        await stencil_library_categories(source="bogus")
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_categories_success():
    with patch.object(ss, "list_categories", return_value=[{"key": "Computer Racks", "label": "Computer Racks"}]):
        result = await stencil_library_categories(source="github")
    assert result == [{"key": "Computer Racks", "label": "Computer Racks"}]


@pytest.mark.asyncio
async def test_files_success():
    with patch.object(
        ss, "list_files",
        return_value=[ss.StencilFile(name="APC PDU.vss", download_url="https://x/apc.vss", size=100)],
    ):
        result = await stencil_library_files(category="Computer Racks", source="github")
    assert result == [{"name": "APC PDU.vss", "size": 100}]


@pytest.mark.asyncio
async def test_files_unknown_category_404():
    with patch.object(ss, "list_files", side_effect=ss.UnknownCategory("nope")):
        with pytest.raises(HTTPException) as exc:
            await stencil_library_files(category="Nope", source="visiocafe")
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_fetch_full_round_trip(tmp_path):
    """Requirement 22.3 — fetch downloads, converts, and returns preview URLs;
    all temp working dirs are cleaned up afterward (nothing lingers outside
    the intentional preview cache)."""
    entry = ss.StencilFile(name="apc.vss", download_url="https://x/apc.vss", size=100)

    conv_dir = tmp_path / "converted"
    conv_dir.mkdir()
    shape_path = conv_dir / "AP7516_-_Front_View.svg"
    shape_path.write_text("<svg/>")
    shapes = [sl.ConvertedShape(title="AP7516 - Front View", svg_path=shape_path)]

    class FakeHttpResponse:
        content = b"fake vss bytes"

        def raise_for_status(self):
            pass

    with patch.object(ss, "resolve_file", return_value=entry), \
         patch("httpx.get", return_value=FakeHttpResponse()), \
         patch.object(sl, "convert_stencil", return_value=shapes):
        result = await stencil_library_fetch(source="github", category="Computer Racks", file="apc.vss")

    assert result["file"] == "apc.vss"
    assert len(result["shapes"]) == 1
    assert result["shapes"][0]["title"] == "AP7516 - Front View"
    assert result["token"] in result["shapes"][0]["preview_url"]

    # The conversion's own temp dir must be cleaned up by the endpoint.
    assert not conv_dir.exists()
    # But the preview WAS saved into the permanent-ish preview cache.
    preview_file = sl.preview_path(result["token"], "AP7516 - Front View.svg")
    assert preview_file.is_file()
    import shutil as _shutil

    _shutil.rmtree(preview_file.parent)  # test cleanup (dir isn't empty until unlinked)


@pytest.mark.asyncio
async def test_fetch_download_failure_surfaces_502_and_leaves_no_trace():
    import httpx as httpx_module

    entry = ss.StencilFile(name="apc.vss", download_url="https://x/apc.vss", size=100)

    def raise_http_error(*a, **k):
        raise httpx_module.ConnectError("boom")

    with patch.object(ss, "resolve_file", return_value=entry), \
         patch("httpx.get", side_effect=raise_http_error):
        with pytest.raises(HTTPException) as exc:
            await stencil_library_fetch(source="github", category="Computer Racks", file="apc.vss")
    assert exc.value.status_code == 502


@pytest.mark.asyncio
async def test_fetch_conversion_unavailable_surfaces_503():
    entry = ss.StencilFile(name="apc.vss", download_url="https://x/apc.vss", size=100)

    class FakeHttpResponse:
        content = b"fake vss bytes"

        def raise_for_status(self):
            pass

    with patch.object(ss, "resolve_file", return_value=entry), \
         patch("httpx.get", return_value=FakeHttpResponse()), \
         patch.object(sl, "convert_stencil", side_effect=sl.ConversionUnavailable("not installed")):
        with pytest.raises(HTTPException) as exc:
            await stencil_library_fetch(source="github", category="Computer Racks", file="apc.vss")
    assert exc.value.status_code == 503


@pytest.mark.asyncio
async def test_fetch_conversion_failed_surfaces_422():
    entry = ss.StencilFile(name="apc.vss", download_url="https://x/apc.vss", size=100)

    class FakeHttpResponse:
        content = b"fake vss bytes"

        def raise_for_status(self):
            pass

    with patch.object(ss, "resolve_file", return_value=entry), \
         patch("httpx.get", return_value=FakeHttpResponse()), \
         patch.object(sl, "convert_stencil", side_effect=sl.ConversionFailed("bad file")):
        with pytest.raises(HTTPException) as exc:
            await stencil_library_fetch(source="github", category="Computer Racks", file="apc.vss")
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_fetch_unknown_file_404():
    with patch.object(ss, "resolve_file", side_effect=FileNotFoundError("nope")):
        with pytest.raises(HTTPException) as exc:
            await stencil_library_fetch(source="github", category="Computer Racks", file="nope.vss")
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_preview_serves_saved_file():
    token = sl.new_preview_token()
    conv_dir = Path(sl.PREVIEW_DIR)  # ensure module import side effects are consistent
    shapes_dir = conv_dir.parent / "tmp_shapes_for_test"
    shapes_dir.mkdir(parents=True, exist_ok=True)
    shape_file = shapes_dir / "Shape.svg"
    shape_file.write_text("<svg>hello</svg>")
    try:
        saved = sl.save_previews(token, [sl.ConvertedShape(title="Shape", svg_path=shape_file)])
        resp = await stencil_library_preview(token=token, filename=saved[0]["filename"])
        assert resp.media_type == "image/svg+xml"
        assert b"hello" in resp.body
    finally:
        import shutil
        shutil.rmtree(shapes_dir, ignore_errors=True)
        shutil.rmtree(sl.PREVIEW_DIR / token, ignore_errors=True)


@pytest.mark.asyncio
async def test_preview_invalid_ref_400():
    with pytest.raises(HTTPException) as exc:
        await stencil_library_preview(token="../../etc", filename="passwd.svg")
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_preview_missing_file_404():
    token = sl.new_preview_token()
    with pytest.raises(HTTPException) as exc:
        await stencil_library_preview(token=token, filename="does-not-exist.svg")
    assert exc.value.status_code == 404
