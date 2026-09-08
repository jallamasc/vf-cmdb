"""Bug fix (post-Phase-6 QA) — the `abbreviation` field on every plain
full_name/abbreviation lookup (LookupMixin: Organization, Cloud, Region,
Campus, Building, FloorSection, ComputeDeviceType, Brand, DeviceRole,
NetworkDeviceType, NetworkSubtype, OsFamily, OsVersion, AppType,
ClusterType, StorageDeviceType, PowerDeviceType, NetworkIdType) is now
ALWAYS derived server-side from `full_name` (default: consonant-stripping,
e.g. "Hoymeaseguro" -> "hm"-style — see `abbrev.derive_abbreviation`'s
"consonants" trim mode), on both create and update, regardless of what the
client sends for that field. This is what makes the Naming.tsx grid column
genuinely non-editable, not just a UI suggestion.

The "code"-based hierarchy models (Datacenter/DatacenterFloor/Room/
RackType/Rack) are NOT in scope for this — they keep their existing
`AbbrevField.tsx`-driven manual/derived choice on the Hierarchy page.
"""
from app import crud, models


async def test_client_supplied_abbreviation_is_ignored_on_create(session):
    org = await crud.create_item(
        session, models.Organization, {"full_name": "Virtualfactor", "abbreviation": "vf"}
    )
    # "Virtualfactor" consonant-stripped: V-r-t-l-f-c-t-r.
    assert org.abbreviation == "vrtlfctr"
    assert org.abbreviation != "vf"


async def test_client_supplied_abbreviation_is_ignored_on_update(session):
    org = await crud.create_item(session, models.Organization, {"full_name": "Acme"})
    original = org.abbreviation
    updated = await crud.update_item(
        session, models.Organization, org.id, {"abbreviation": "totally-different"}
    )
    assert updated.abbreviation == original
    assert updated.abbreviation != "totally-different"


async def test_changing_full_name_re_derives_the_abbreviation(session):
    org = await crud.create_item(session, models.Organization, {"full_name": "Acme"})
    updated = await crud.update_item(session, models.Organization, org.id, {"full_name": "Beta"})
    # "Beta" consonants: B-t.
    assert updated.abbreviation == "bt"


async def test_a_collision_gets_a_numeric_suffix(session):
    """Two different full_names that consonant-derive to the same base once
    case-folded ("Acme" and "ACME" both -> "cm") must not collide — the
    global abbreviation registry (Bug fix, post-Phase-6 QA) forces a unique
    numeric suffix on the second one, same as `suggest_abbreviation`'s own
    documented behavior."""
    first = await crud.create_item(session, models.Organization, {"full_name": "Acme"})
    second = await crud.create_item(session, models.Cloud, {"full_name": "ACME"})
    assert first.abbreviation == "cm"
    assert second.abbreviation == "cm1"


async def test_unrelated_field_update_does_not_re_derive_the_abbreviation(session):
    """Bug fix (post-Phase-6 QA, round 2) — updating a field that has
    nothing to do with the abbreviation (e.g. `icon`, or a device-type's
    own `stencil_url` from the stencil-upload endpoint) must NOT silently
    rewrite it — only a change to `full_name`/`trim_mode`/
    `case_enforcement`/`max_length`/`abbreviation` itself may re-derive."""
    ndt = await crud.create_item(session, models.NetworkDeviceType, {"full_name": "Firewall"})
    original = ndt.abbreviation
    updated = await crud.update_item(
        session, models.NetworkDeviceType, ndt.id, {"stencil_url": "https://x/fw.svg"}
    )
    assert updated.abbreviation == original


async def test_datacenter_code_is_not_forced_derived(session):
    """Datacenter uses `code`, not `abbreviation`, and is explicitly out of
    scope for this bug fix — a client-provided code is still respected."""
    site = await crud.create_item(session, models.Site, {})
    dc = await crud.create_item(
        session,
        models.Datacenter,
        {"name": "Main DC", "site_id": site.id, "code": "custom-code"},
    )
    assert dc.code == "custom-code"


async def test_change_log_records_the_derived_value_not_the_client_value(session):
    org = await crud.create_item(
        session, models.Organization, {"full_name": "Delta", "abbreviation": "wrong"}
    )
    entries = [e for e in (await crud.list_items(session, models.ChangeLog)) if e.record_id == org.id]
    abbrev_entries = [e for e in entries if e.field_name == "abbreviation"]
    assert len(abbrev_entries) == 1
    assert abbrev_entries[0].new_value == org.abbreviation
    assert abbrev_entries[0].new_value != "wrong"
