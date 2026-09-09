"""Post-Phase-6 QA (round 4) — "More Os families exist... Windows Server
2022, Windows Server 2019... we need the 4 more recent versions of those
in the versions."

The seeded demo `OsVersion` rows used to have abbreviations unrelated to
their `OsFamily`'s own abbreviation (e.g. "Windows Server 2016" -> "s16"
vs family "Windows" -> "wn"), so `osVersionGrouping.ts`'s prefix-matching
("{family_abbr}-...") never actually grouped them — the "latest 4 per
family" feature silently did nothing for this offline demo data. Every
seeded OsVersion abbreviation now starts with its family's own
abbreviation + "-", exactly like the live endoflife.date sync already
produces.
"""
from app import models
from app.seed import _seed_lookups


async def test_every_seeded_os_version_prefix_matches_a_real_seeded_family(session):
    m, _created = await _seed_lookups(session)
    families = m[models.OsFamily]
    versions = m[models.OsVersion]

    family_abbrs = set(families.keys())
    assert "wn" in family_abbrs  # Windows

    unmatched = []
    for version_abbr in versions.keys():
        prefix = version_abbr.split("-", 1)[0]
        if prefix not in family_abbrs:
            unmatched.append(version_abbr)
    assert unmatched == [], f"versions with no matching family prefix: {unmatched}"


async def test_windows_server_has_more_than_four_seeded_versions(session):
    """So the Naming page's "latest 4 per family" filter has something
    real to trim, fully offline."""
    m, _created = await _seed_lookups(session)
    windows_versions = [abbr for abbr in m[models.OsVersion].keys() if abbr.startswith("wn-")]
    assert len(windows_versions) > 4


async def test_windows_server_2022_is_seeded(session):
    m, _created = await _seed_lookups(session)
    version = await session.get(models.OsVersion, m[models.OsVersion]["wn-s22"])
    assert version.full_name == "Windows Server 2022"
