"""Phase 6 Task 38 (Requirement 13.4) — Gather_Facts_Sync ingestion endpoint
for ansible_managed Generic_Entity records.

Same direct-router-call pattern, `build_facts_payload` merge semantics, and
`ansible_callback` change-source as `test_facts.py`'s coverage of the 5
hardcoded device tables' `ingest_facts` — the only new behaviour here is the
ansible_managed Capability gate, since Generic_Entity (unlike those 5
tables) has a capability system a record's own type might not opt into.
"""
import pytest
from fastapi import HTTPException

from app import crud, models
from app.routers.special import ingest_generic_entity_facts


async def _make_entity_type(session, slug="widget", capabilities=None):
    return await crud.create_item(
        session,
        models.EntityTypeDef,
        {"slug": slug, "label": slug.title(), "capabilities": capabilities or []},
    )


@pytest.mark.asyncio
async def test_ingest_generic_entity_facts_end_to_end(session):
    et = await _make_entity_type(session, capabilities=["ansible_managed"])
    row = await crud.create_item(
        session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
    )
    result = await ingest_generic_entity_facts(
        entity_id=row.id,
        facts={"cpu_cores": 8, "memory_mb": 32768, "os_distribution": "Ubuntu 24.04", "kernel": "6.8.0"},
        session=session,
    )
    assert result["cpu_cores"] == 8
    assert result["memory_mb"] == 32768
    assert result["os_distribution"] == "Ubuntu 24.04"
    assert result["ansible_facts"] == {
        "cpu_cores": 8, "memory_mb": 32768, "os_distribution": "Ubuntu 24.04", "kernel": "6.8.0",
    }
    assert result["last_fact_sync_at"] is not None


@pytest.mark.asyncio
async def test_ingest_generic_entity_facts_accumulates_across_two_calls(session):
    et = await _make_entity_type(session, capabilities=["ansible_managed"])
    row = await crud.create_item(
        session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
    )
    await ingest_generic_entity_facts(
        entity_id=row.id, facts={"cpu_cores": 4, "serial": "SN1"}, session=session
    )
    result = await ingest_generic_entity_facts(
        entity_id=row.id, facts={"memory_mb": 8192}, session=session
    )
    assert result["cpu_cores"] == 4  # still set from the first call
    assert result["memory_mb"] == 8192
    assert result["ansible_facts"] == {"cpu_cores": 4, "serial": "SN1", "memory_mb": 8192}


@pytest.mark.asyncio
async def test_ingest_generic_entity_facts_rejects_non_ansible_managed_type(session):
    et = await _make_entity_type(session, capabilities=[])
    row = await crud.create_item(
        session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
    )
    with pytest.raises(HTTPException) as exc:
        await ingest_generic_entity_facts(
            entity_id=row.id, facts={"cpu_cores": 2}, session=session
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_ingest_generic_entity_facts_missing_record_404(session):
    with pytest.raises(HTTPException) as exc:
        await ingest_generic_entity_facts(
            entity_id=999999, facts={"cpu_cores": 1}, session=session
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_ingest_generic_entity_facts_change_is_recorded_as_ansible_callback(session):
    et = await _make_entity_type(session, capabilities=["ansible_managed"])
    row = await crud.create_item(
        session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
    )
    await ingest_generic_entity_facts(
        entity_id=row.id, facts={"cpu_cores": 6}, session=session
    )
    changes = await crud.list_items(session, models.ChangeLog, limit=50)
    matching = [
        c for c in changes
        if c.table_name == "generic_entities" and c.record_id == row.id and c.field_name == "cpu_cores"
    ]
    assert matching, "expected a ChangeLog row for the cpu_cores update"
    assert matching[-1].change_source == "ansible_callback"
