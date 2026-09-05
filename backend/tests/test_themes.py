"""Phase 4 Task 11 — networking theme catalogue.

Feature: phase-4-ux-graphical-views. Covers Requirement 10.1.
"""
from app import themes


def test_networking_category_registered():
    slugs = {c["category"] for c in themes.categories()}
    assert "networking" in slugs


def test_networking_search_prefix_ranked():
    results = themes.search("networking", "cerf")
    assert results, "expected at least one match for 'cerf'"
    assert all(r["category"] == "networking" for r in results)
    # Prefix match ("Cerfnet") ranks before a mid-string match ("Vint Cerf").
    assert results[0]["name"] == "Cerfnet"


def test_networking_has_a_substantial_catalogue():
    assert len(themes.THEMES["networking"]) >= 100
