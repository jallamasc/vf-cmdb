"""Phase 6 Task 30 (Requirement 12.1) — POST /os-data/sync, the manual-
trigger half. Same direct-router-call pattern as
test_stencil_library_routes.py; endoflife_client itself is mocked (already
covered in isolation by test_endoflife_client.py)."""
from unittest.mock import patch

import pytest

from app import endoflife_client as eol
from app.routers.special import sync_os_data


@pytest.mark.asyncio
async def test_sync_os_data_defaults_to_curated_products(session):
    fake_result = eol.SyncResult(families_created=["Ubuntu"], versions_created=["Ubuntu 24.04"])
    with patch.object(eol, "sync_products", return_value=fake_result) as mock_sync:
        body = await sync_os_data(products=None, session=session)
    mock_sync.assert_called_once_with(session, None)
    assert body == {
        "families_created": ["Ubuntu"],
        "versions_created": ["Ubuntu 24.04"],
        "skipped_conflicts": [],
        "products_unreachable": [],
    }


@pytest.mark.asyncio
async def test_sync_os_data_scopes_to_the_requested_products(session):
    fake_result = eol.SyncResult()
    with patch.object(eol, "sync_products", return_value=fake_result) as mock_sync:
        await sync_os_data(products=["ubuntu", "rhel"], session=session)
    mock_sync.assert_called_once_with(session, ["ubuntu", "rhel"])
