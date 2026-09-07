"""Phase 6 Task 23 (Requirements 9.2/9.3) — /stencil-library/vendors/* routes.

Calls the router functions directly, same established pattern as
test_stencil_library_routes.py. Network + conversion are mocked.
"""
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app import stencil_library as sl
from app import vendor_stencils as vs
from app.routers.special import (
    stencil_library_vendor_convert,
    stencil_library_vendor_files,
    stencil_library_vendor_product_lines,
    stencil_library_vendors,
)


@pytest.mark.asyncio
async def test_vendors_lists_registry():
    result = await stencil_library_vendors()
    assert any(v["key"] == "Microsoft" for v in result)


@pytest.mark.asyncio
async def test_product_lines_success():
    with patch.object(vs, "list_product_lines", return_value=[{"key": "line", "label": "Line"}]):
        result = await stencil_library_vendor_product_lines(vendor="Acme")
    assert result == [{"key": "line", "label": "Line"}]


@pytest.mark.asyncio
async def test_product_lines_unknown_vendor_404():
    with patch.object(vs, "list_product_lines", side_effect=vs.UnknownVendor("nope")):
        with pytest.raises(HTTPException) as exc:
            await stencil_library_vendor_product_lines(vendor="Nope")
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_files_triggers_fetch_and_extract():
    with patch.object(vs, "fetch_and_extract", return_value=["Acme Rack.vss"]) as mock_fetch:
        result = await stencil_library_vendor_files(vendor="Acme", product_line="rack-line")
    mock_fetch.assert_called_once_with("Acme", "rack-line")
    assert result == ["Acme Rack.vss"]


@pytest.mark.asyncio
async def test_files_unknown_vendor_404():
    with patch.object(vs, "fetch_and_extract", side_effect=vs.UnknownVendor("nope")):
        with pytest.raises(HTTPException) as exc:
            await stencil_library_vendor_files(vendor="Nope", product_line="x")
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_files_download_failed_502():
    with patch.object(vs, "fetch_and_extract", side_effect=vs.DownloadFailed("boom")):
        with pytest.raises(HTTPException) as exc:
            await stencil_library_vendor_files(vendor="Acme", product_line="rack-line")
    assert exc.value.status_code == 502


@pytest.mark.asyncio
async def test_convert_full_round_trip(tmp_path):
    """Requirement 9.2 — an already-extracted vendor file goes through the
    SAME conversion/preview pipeline as the github/visiocafe flow."""
    raw_path = tmp_path / "Acme Rack.vss"
    raw_path.write_bytes(b"fake stencil bytes")

    conv_dir = tmp_path / "converted"
    conv_dir.mkdir()
    shape_path = conv_dir / "Acme_Rack_Front.svg"
    shape_path.write_text("<svg/>")
    shapes = [sl.ConvertedShape(title="Acme Rack Front", svg_path=shape_path)]

    with patch.object(vs, "resolve_extracted_file", return_value=raw_path), \
         patch.object(sl, "convert_stencil", return_value=shapes):
        result = await stencil_library_vendor_convert(
            vendor="Acme", product_line="rack-line", file="Acme Rack.vss"
        )

    assert result["vendor"] == "Acme"
    assert result["product_line"] == "rack-line"
    assert result["file"] == "Acme Rack.vss"
    assert len(result["shapes"]) == 1
    assert result["shapes"][0]["title"] == "Acme Rack Front"
    assert result["token"] in result["shapes"][0]["preview_url"]
    assert not conv_dir.exists()  # conversion temp dir cleaned up

    preview_file = sl.preview_path(result["token"], "Acme Rack Front.svg")
    assert preview_file.is_file()
    import shutil

    shutil.rmtree(preview_file.parent)  # test cleanup


@pytest.mark.asyncio
async def test_convert_unknown_file_404():
    with patch.object(vs, "resolve_extracted_file", side_effect=FileNotFoundError("nope")):
        with pytest.raises(HTTPException) as exc:
            await stencil_library_vendor_convert(
                vendor="Acme", product_line="rack-line", file="nope.vss"
            )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_convert_conversion_unavailable_503(tmp_path):
    raw_path = tmp_path / "x.vss"
    raw_path.write_bytes(b"irrelevant")

    with patch.object(vs, "resolve_extracted_file", return_value=raw_path), \
         patch.object(sl, "convert_stencil", side_effect=sl.ConversionUnavailable("not installed")):
        with pytest.raises(HTTPException) as exc:
            await stencil_library_vendor_convert(
                vendor="Acme", product_line="rack-line", file="x.vss"
            )
    assert exc.value.status_code == 503
