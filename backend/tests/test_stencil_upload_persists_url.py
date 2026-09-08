"""Bug fix (post-Phase-6 QA) — `POST /stencils/{model_slug}` (`upload_stencil`)
used to only write the on-disk cache via `stencils.store_bytes` and never
persist the owning row's own `stencil_url`/`stencil_url_back` column. Every
consumer that decides whether to render a stencil at all (RackView,
PortConfigView, PowerDeviceView, and the manual-upload/library-apply UI
itself on its next load) reads that DB column, not the disk cache — so a
freshly uploaded or library-applied stencil never visibly "took" until this
was fixed. Covers both the plain device-TYPE lookups and the
Universal_Stencil_Override device-INSTANCE tables (Phase 6 Task 26), since
both share the exact same endpoint + `STENCIL_RESOURCES` map.
"""
import pathlib
import tempfile

import pytest

from app import crud, models, stencils
from app.routers import special


@pytest.fixture(autouse=True)
def _tmp_cache(monkeypatch):
    """Redirect the on-disk cache to a temp dir for every test."""
    tmp = pathlib.Path(tempfile.mkdtemp()) / "stencils"
    monkeypatch.setattr(stencils, "CACHE_DIR", tmp)
    yield tmp


class _FakeUploadFile:
    """Minimal stand-in for FastAPI's `UploadFile` — only `.read()` (async)
    and `.content_type` are used by `upload_stencil`."""

    def __init__(self, data: bytes, content_type: str = "image/svg+xml"):
        self._data = data
        self.content_type = content_type

    async def read(self) -> bytes:
        return self._data


SVG = b'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'


async def test_upload_persists_stencil_url_on_the_owning_row(session):
    ndt = await crud.create_item(session, models.NetworkDeviceType, {"full_name": "Switch Model X"})
    assert ndt.stencil_url is None

    result = await special.upload_stencil(
        model_slug=f"network-device-types-{ndt.id}",
        file=_FakeUploadFile(SVG),
        face="front",
        session=session,
    )

    refreshed = await session.get(models.NetworkDeviceType, ndt.id)
    assert refreshed.stencil_url == result["path"]
    assert refreshed.stencil_url == f"/api/v1/stencils/network-device-types-{ndt.id}?face=front"


async def test_upload_back_face_persists_the_back_column_only(session):
    ndt = await crud.create_item(session, models.NetworkDeviceType, {"full_name": "Switch Model Y"})

    await special.upload_stencil(
        model_slug=f"network-device-types-{ndt.id}", file=_FakeUploadFile(SVG), face="back", session=session
    )

    refreshed = await session.get(models.NetworkDeviceType, ndt.id)
    assert refreshed.stencil_url is None
    assert refreshed.stencil_url_back is not None


async def test_upload_persists_on_a_device_instance_override_table(session):
    """Universal_Stencil_Override (Phase 6 Task 26) — the SAME endpoint also
    persists onto a device INSTANCE row, not just its device-type."""
    device = await crud.create_item(session, models.NetworkDevice, {"model": "Catalyst"})

    await special.upload_stencil(
        model_slug=f"network-devices-{device.id}", file=_FakeUploadFile(SVG), face="front", session=session
    )

    refreshed = await session.get(models.NetworkDevice, device.id)
    assert refreshed.stencil_url is not None


async def test_upload_for_an_unrecognised_slug_still_stores_the_cache_without_erroring(session):
    """A bare/unparseable slug (no known `{resource}-{id}` shape) still
    uploads fine — it just has no owning row to patch."""
    result = await special.upload_stencil(
        model_slug="freeform-slug", file=_FakeUploadFile(SVG), face="front", session=session
    )
    assert result["stored"] is True
