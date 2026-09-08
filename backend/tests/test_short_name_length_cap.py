"""Naming-convention modifications, item 9 — every "short"/"friendly" name
(Site.vf_short_name, and every device's vf_short_name/vf_friendly_name) is
capped at `naming.SHORT_NAME_MAX_LENGTH` (8) characters total, truncating
the assembled abbreviation prefix while always preserving the trailing
consecutive/sequence number intact (that's what keeps the name unique
within its scope — truncating it instead would risk collisions).
`vf_long_name` (the full hierarchical identifier) is deliberately left
uncapped.
"""
import pytest

from app import crud, models, naming


def test_cap_short_name_preserves_the_suffix_and_trims_the_prefix():
    assert naming._cap_short_name("srvdellprodlinux", "42") == "srvdel42"
    assert len(naming._cap_short_name("srvdellprodlinux", "42")) == 8


def test_cap_short_name_returns_the_bare_value_when_it_already_fits():
    assert naming._cap_short_name("ab", "1") == "ab1"


def test_cap_short_name_falls_back_to_a_truncated_suffix_when_even_that_overflows():
    assert naming._cap_short_name("x", "123456789") == "12345678"


@pytest.mark.asyncio
async def test_physical_server_short_name_never_exceeds_the_cap(session):
    dt = await crud.create_item(
        session, models.ComputeDeviceType, {"full_name": "Server", "abbreviation": "server"}
    )
    brand = await crud.create_item(
        session, models.Brand, {"full_name": "Dell", "abbreviation": "dell"}
    )
    role = await crud.create_item(
        session, models.DeviceRole, {"full_name": "Production", "abbreviation": "prod"}
    )
    osf = await crud.create_item(
        session, models.OsFamily, {"full_name": "Linux", "abbreviation": "linux"}
    )
    s = await crud.create_item(
        session,
        models.PhysicalServer,
        {
            "device_type_id": dt.id,
            "brand_id": brand.id,
            "role_id": role.id,
            "os_family_id": osf.id,
            "consecutive": 42,
        },
    )
    assert len(s.vf_short_name) <= naming.SHORT_NAME_MAX_LENGTH
    assert s.vf_short_name.endswith("42")
    # vf_long_name (the full hierarchical identifier) is NOT capped.
    assert s.vf_long_name is not None


@pytest.mark.asyncio
async def test_network_device_friendly_name_never_exceeds_the_cap(session):
    dt = await crud.create_item(
        session,
        models.NetworkDeviceType,
        {"full_name": "Switch Type", "abbreviation": "switchtype"},
    )
    sub = await crud.create_item(
        session, models.NetworkSubtype, {"full_name": "Access Layer", "abbreviation": "access"}
    )
    d = await crud.create_item(
        session,
        models.NetworkDevice,
        {"device_type_id": dt.id, "subtype_id": sub.id, "consecutive": 7},
    )
    assert len(d.vf_friendly_name) <= naming.SHORT_NAME_MAX_LENGTH
    assert d.vf_friendly_name.endswith("7")


@pytest.mark.asyncio
async def test_site_short_name_never_exceeds_the_cap(session):
    org = await crud.create_item(
        session, models.Organization, {"full_name": "A Very Long Org Name", "abbreviation": "avlong"}
    )
    campus = await crud.create_item(
        session, models.Campus, {"full_name": "A Very Long Campus Name", "abbreviation": "avlongcamp"}
    )
    site = await crud.create_item(
        session, models.Site, {"organization_id": org.id, "campus_id": campus.id}
    )
    assert len(site.vf_short_name) <= naming.SHORT_NAME_MAX_LENGTH


@pytest.mark.asyncio
async def test_site_short_name_packs_more_than_just_org_and_campus(session):
    """Bug fix (post-Phase-6 QA, round 3) — org+campus alone used to
    "win" and stop further packing as soon as it reached 4 characters;
    now region/building/floor-section/cloud are packed in too, as long as
    they still fit within the 8-char cap, so the short name carries real
    place detail instead of just org+campus."""
    org = await crud.create_item(session, models.Organization, {"full_name": "Virtualfactor", "max_length": 2})  # -> vr
    region = await crud.create_item(session, models.Region, {"full_name": "Bogota", "max_length": 3})  # -> bgt
    campus = await crud.create_item(session, models.Campus, {"full_name": "Home", "max_length": 2})  # -> hm
    site = await crud.create_item(
        session,
        models.Site,
        {"organization_id": org.id, "campus_id": campus.id, "region_id": region.id},
    )
    # All three abbreviations fit within 8 chars (2+2+3=7), so all three
    # must be present, not just org+campus.
    assert org.abbreviation in site.vf_short_name.lower()
    assert campus.abbreviation in site.vf_short_name.lower()
    assert region.abbreviation in site.vf_short_name.lower()
    assert len(site.vf_short_name) <= naming.SHORT_NAME_MAX_LENGTH


@pytest.mark.asyncio
async def test_site_short_name_skips_a_piece_that_would_only_partially_fit(session):
    """A component that doesn't fully fit in the remaining room is skipped
    entirely (never cut mid-abbreviation) — org (6) + campus (2) already
    fill the 8-char cap exactly, so region's own abbreviation must be
    dropped whole rather than partially spliced in."""
    org = await crud.create_item(session, models.Organization, {"full_name": "Virtualfactor", "max_length": 6})
    campus = await crud.create_item(session, models.Campus, {"full_name": "Home", "max_length": 2})
    region = await crud.create_item(session, models.Region, {"full_name": "Region"})
    site = await crud.create_item(
        session,
        models.Site,
        {"organization_id": org.id, "campus_id": campus.id, "region_id": region.id},
    )
    assert len(site.vf_short_name) <= naming.SHORT_NAME_MAX_LENGTH
    assert org.abbreviation in site.vf_short_name.lower()
    assert campus.abbreviation in site.vf_short_name.lower()
    assert region.abbreviation not in site.vf_short_name.lower()
