"""Running-version source of truth for the backend.

The version is baked into the image at build time via the ``VF_VERSION`` /
``VF_GIT_SHA`` / ``VF_BUILT_AT`` environment variables (set in the
Containerfile) and resolved here with safe fallbacks, so the version is never
duplicated as a literal across the codebase.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class VersionInfo:
    version: str  # e.g. "1.5.0" or "dev"
    git_sha: str  # e.g. "a1b2c3d" or "unknown"
    built_at: str  # ISO-8601 or "unknown"


@lru_cache
def get_version_info() -> VersionInfo:
    """Resolve the running version from the environment, once per process.

    Empty-string env values are treated as unset (the ``or`` guards), so a
    Containerfile ``ENV VF_VERSION=""`` does not produce an empty version.
    """
    return VersionInfo(
        version=os.getenv("VF_VERSION", "dev").strip() or "dev",
        git_sha=os.getenv("VF_GIT_SHA", "unknown").strip() or "unknown",
        built_at=os.getenv("VF_BUILT_AT", "unknown").strip() or "unknown",
    )
