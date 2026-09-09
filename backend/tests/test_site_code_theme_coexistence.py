"""Post-Phase-6 QA (round 4) — "the conformed name and the fantastic name
are not together... the site code shows the fantastic name instead of the
conformed name." `theme_name` must always coexist alongside `simple_name`
(the real, conformed code), never replace it — see naming.py's
`generate_site` for the removed "theme" branch this covers.
"""
from app import crud, models


async def test_theme_name_never_overwrites_simple_name_in_auto_mode(session):
    org = await crud.create_item(session, models.Organization, {"full_name": "Virtualfactor"})
    site = await crud.create_item(
        session, models.Site, {"organization_id": org.id, "theme_name": "Ironforge"}
    )
    assert site.theme_name == "Ironforge"
    assert site.simple_name is not None
    assert site.simple_name != "Ironforge"


async def test_site_code_type_theme_behaves_like_custom(session):
    """A row whose `site_code_type` is (still, e.g. from legacy data) set
    to "theme" must leave `simple_name` untouched on save, exactly like
    "custom" — the value is never mirrored in from `theme_name`."""
    site = await crud.create_item(
        session,
        models.Site,
        {"site_code_type": "theme", "simple_name": "hand-typed-code", "theme_name": "Ironforge"},
    )
    assert site.simple_name == "hand-typed-code"
    assert site.theme_name == "Ironforge"

    # Re-saving (e.g. an unrelated field change) must not retroactively
    # clobber simple_name with theme_name either.
    updated = await crud.update_item(session, models.Site, site.id, {"notes": "touch"})
    assert updated.simple_name == "hand-typed-code"


async def test_simple_name_conforms_to_vf_short_name(session):
    """Bug fix (round 4) — "Everywhere Simple Name should result by
    conformation of vf short." In auto mode, `simple_name` must be
    `vf_short_name` (lowercased) plus a trailing uniqueness sequence
    number — the SAME conformation, not an independently-derived
    org+campus+region-only value."""
    org = await crud.create_item(session, models.Organization, {"full_name": "Acme"})
    site = await crud.create_item(session, models.Site, {"organization_id": org.id})
    assert site.simple_name.lower().startswith(site.vf_short_name.lower())
    # trailing sequence number
    assert site.simple_name[len(site.vf_short_name):].isdigit()


async def test_updating_theme_name_alone_never_touches_simple_name(session):
    org = await crud.create_item(session, models.Organization, {"full_name": "Acme"})
    site = await crud.create_item(session, models.Site, {"organization_id": org.id})
    original_code = site.simple_name

    updated = await crud.update_item(session, models.Site, site.id, {"theme_name": "Stormwind"})
    assert updated.theme_name == "Stormwind"
    assert updated.simple_name == original_code
