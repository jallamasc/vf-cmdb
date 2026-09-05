"""Phase 4 Sub-phase E — curated stencil source catalogue (Requirement 22).

Two sources, both browsed through the same category -> file -> fetch shape:

- ``"github"`` — bhdicaire/visioStencils, browsed LIVE via the real GitHub
  Contents API (verified against the actual repo while building this: top
  level under ``Stencils/`` is a set of category folders — "Computer Racks",
  "IT Vendors", "IT Generic", ... — and each category's own files are a FLAT
  list, e.g. ``Stencils/IT Vendors/A10 Networks Thunder v2020.vss``). No
  fabricated data — every category/file returned here comes straight from a
  live API call.
- ``"visiocafe"`` — VisioCafe has no API and no crawlable directory structure
  (it's a hand-built HTML site with per-vendor pages, confirmed by fetching
  it directly). There is nothing to enumerate programmatically, so this
  source is a HAND-MAINTAINED catalogue an administrator populates with
  real, personally-verified download links (``VISIOCAFE_CATEGORIES`` below).
  It starts EMPTY on purpose — guessing at vendor page URLs would risk
  shipping broken or wrong links. The full pipeline (category/file/fetch)
  works identically for this source the moment real entries are added.
"""
from __future__ import annotations

import urllib.parse
from dataclasses import dataclass
from typing import Optional

import httpx

GITHUB_REPO = "bhdicaire/visioStencils"
GITHUB_STENCILS_PATH = "Stencils"
GITHUB_API_BASE = f"https://api.github.com/repos/{GITHUB_REPO}/contents"
GITHUB_TIMEOUT = 10.0

VSS_EXTENSIONS = (".vss", ".vssx")

SOURCES = ("github", "visiocafe")


@dataclass
class StencilFile:
    name: str
    download_url: str
    size: Optional[int] = None


class UnknownSource(ValueError):
    pass


class UnknownCategory(ValueError):
    pass


class SourceUnavailable(RuntimeError):
    """A live source (GitHub) could not be reached."""


# ---------------------------------------------------------------------------
# VisioCafe — see module docstring. Populate with entries an administrator
# has personally verified, e.g.:
#   VISIOCAFE_CATEGORIES["Cisco"] = [
#       StencilFile(name="Cisco Network.vss", download_url="https://.../cisco.vss"),
#   ]
# ---------------------------------------------------------------------------
VISIOCAFE_CATEGORIES: dict[str, list[StencilFile]] = {}


def _github_get(path_segment: str) -> list[dict]:
    url = f"{GITHUB_API_BASE}/{path_segment}"
    try:
        resp = httpx.get(
            url,
            timeout=GITHUB_TIMEOUT,
            headers={"Accept": "application/vnd.github+json"},
            follow_redirects=True,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise SourceUnavailable(f"Could not reach GitHub: {exc}") from exc
    data = resp.json()
    if not isinstance(data, list):
        raise SourceUnavailable(f"Unexpected GitHub response listing '{path_segment}'")
    return data


def list_categories(source: str) -> list[dict[str, str]]:
    """[{key, label}] for a source. ``key`` is what the caller passes back
    into list_files()/resolve_file()."""
    if source == "github":
        entries = _github_get(GITHUB_STENCILS_PATH)
        return [
            {"key": e["name"], "label": e["name"]}
            for e in entries
            if e.get("type") == "dir"
        ]
    if source == "visiocafe":
        return [{"key": k, "label": k} for k in VISIOCAFE_CATEGORIES]
    raise UnknownSource(f"Unknown stencil source '{source}'. Known: {', '.join(SOURCES)}")


def list_files(source: str, category: str) -> list[StencilFile]:
    """.vss/.vssx files in a category. One level of defensive recursion into
    any nested subdirectory — the repo's current layout is flat within each
    category (verified live), but this avoids silently hiding files should
    that ever change upstream."""
    if source == "github":
        path_segment = f"{GITHUB_STENCILS_PATH}/{urllib.parse.quote(category)}"
        entries = _github_get(path_segment)
        files: list[StencilFile] = []
        for e in entries:
            if e.get("type") == "file" and e["name"].lower().endswith(VSS_EXTENSIONS):
                files.append(
                    StencilFile(name=e["name"], download_url=e["download_url"], size=e.get("size"))
                )
            elif e.get("type") == "dir":
                nested_segment = f"{path_segment}/{urllib.parse.quote(e['name'])}"
                for ne in _github_get(nested_segment):
                    if ne.get("type") == "file" and ne["name"].lower().endswith(VSS_EXTENSIONS):
                        files.append(
                            StencilFile(
                                name=f"{e['name']}/{ne['name']}",
                                download_url=ne["download_url"],
                                size=ne.get("size"),
                            )
                        )
        return files
    if source == "visiocafe":
        if category not in VISIOCAFE_CATEGORIES:
            raise UnknownCategory(f"Unknown VisioCafe category '{category}'")
        return VISIOCAFE_CATEGORIES[category]
    raise UnknownSource(f"Unknown stencil source '{source}'. Known: {', '.join(SOURCES)}")


def resolve_file(source: str, category: str, filename: str) -> StencilFile:
    """The single StencilFile matching ``filename`` within a category.

    Raises FileNotFoundError when no match exists (also propagates
    UnknownSource/UnknownCategory/SourceUnavailable from list_files()).
    """
    for f in list_files(source, category):
        if f.name == filename:
            return f
    raise FileNotFoundError(f"'{filename}' not found in {source}/{category}")
