"""Phase 4 Sub-phase E — Stencil_Conversion_Service.

Converts a downloaded ``.vss``/``.vssx`` Visio stencil file into one
standalone SVG per shape master, using the ``vss2svg-conv`` CLI from
libvisio2svg (built from source in ``backend/Containerfile`` — see that file
for the build recipe and the rationale for choosing it over LibreOffice
headless).

This module never assumes the binary is installed on the host running the
code: local dev machines and the test environment outside the container
image don't have it (it can't even be compiled on macOS — it depends on
Linux-only tooling). Every entry point degrades to a clear, typed error
instead of crashing when it's missing, and callers (the fetch endpoint) are
expected to surface that error to the administrator rather than silently
doing nothing (Requirement 22.5 — a failed fetch/convert must never leave a
partially-applied stencil).
"""
from __future__ import annotations

import re
import secrets
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

VSS2SVG_BIN = "vss2svg-conv"

# Where converted shape previews are cached so they can be served over HTTP
# for the picker's thumbnails, keyed by an opaque per-fetch token. This is
# deliberately SEPARATE from backend/static/stencils/ (the permanent,
# per-device-type cache Task 14 built) — nothing here is "applied" until the
# administrator explicitly picks one shape and it goes through the existing
# upload endpoint, so a failed or abandoned fetch never touches a real
# stencil (Requirement 22.5).
_STATIC_ROOT = Path(__file__).resolve().parent.parent / "static"
PREVIEW_DIR = _STATIC_ROOT / "stencil_previews"

_TOKEN_RE = re.compile(r"^[a-f0-9]{16,64}$")
_FILENAME_RE = re.compile(r"^[A-Za-z0-9 _.-]+\.svg$")


class InvalidPreviewRef(ValueError):
    """Raised when a preview token or filename fails validation, including
    an attempt to escape PREVIEW_DIR via a crafted filename."""

# Generous default — real stencil files are small (a few hundred KB at most)
# and the tool is a lightweight native converter, not a full office suite.
DEFAULT_TIMEOUT_SECONDS = 60


class ConversionUnavailable(RuntimeError):
    """Raised when the vss2svg-conv binary isn't installed on this host."""


class ConversionFailed(RuntimeError):
    """Raised when vss2svg-conv ran but exited non-zero, timed out, or
    produced no shapes."""


@dataclass
class ConvertedShape:
    """One shape master converted out of a stencil file."""

    title: str
    svg_path: Path


def binary_available() -> bool:
    """Whether the vss2svg-conv CLI is on PATH. Pure, cheap, safe to call
    from a route handler before doing any real work."""
    return shutil.which(VSS2SVG_BIN) is not None


def _title_from_filename(svg_path: Path) -> str:
    """vss2svg-conv names each output file after the shape's own title
    (e.g. ``WS-C2960CX-8PC-L Front.svg``). Only underscores are converted to
    spaces — hyphens are a normal, allowed character in real model names
    (``WS-C2960CX-8PC-L``) and must be preserved as-is."""
    return svg_path.stem.replace("_", " ").strip()


def convert_stencil(
    source_path: Path, timeout: int = DEFAULT_TIMEOUT_SECONDS
) -> list[ConvertedShape]:
    """Convert a ``.vss``/``.vssx`` file into one SVG per shape master.

    Returns a list of :class:`ConvertedShape`, each pointing at a file inside
    a freshly-created temp directory. That directory is deliberately NOT
    removed by this function — the caller (the fetch endpoint) needs the
    files to survive long enough to be served as preview thumbnails, and
    owns their eventual cleanup.

    Raises:
        FileNotFoundError: ``source_path`` doesn't exist.
        ConversionUnavailable: the CLI isn't installed on this host.
        ConversionFailed: the CLI ran but exited non-zero, timed out, or
            produced no SVG files at all.
    """
    if not source_path.exists():
        raise FileNotFoundError(f"Stencil file not found: {source_path}")
    if not binary_available():
        raise ConversionUnavailable(
            f"{VSS2SVG_BIN} is not installed on this host. It is built from "
            "source in the Containerfile (Phase 4 Sub-phase E) and is only "
            "available when running inside that container image."
        )

    out_dir = Path(tempfile.mkdtemp(prefix="stencil_convert_"))
    try:
        result = subprocess.run(
            [VSS2SVG_BIN, "-i", str(source_path), "-o", str(out_dir)],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        shutil.rmtree(out_dir, ignore_errors=True)
        raise ConversionFailed(
            f"{VSS2SVG_BIN} timed out after {timeout}s converting {source_path.name}"
        ) from exc

    if result.returncode != 0:
        shutil.rmtree(out_dir, ignore_errors=True)
        detail = (result.stderr or result.stdout or "").strip()
        raise ConversionFailed(
            f"{VSS2SVG_BIN} exited {result.returncode} converting {source_path.name}"
            + (f": {detail}" if detail else "")
        )

    shapes = [
        ConvertedShape(title=_title_from_filename(p), svg_path=p)
        for p in sorted(out_dir.glob("*.svg"))
    ]
    if not shapes:
        shutil.rmtree(out_dir, ignore_errors=True)
        raise ConversionFailed(
            f"{VSS2SVG_BIN} produced no shapes for {source_path.name} "
            "(the file may not be a valid Visio stencil)."
        )
    return shapes


def new_preview_token() -> str:
    """An opaque, filesystem-safe identifier for one fetch's set of preview
    shapes. Random, not derived from user input, so it can't be crafted."""
    return secrets.token_hex(8)


def _safe_preview_filename(title: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9 _.-]", "_", title).strip()
    return (safe or "shape") + ".svg"


def save_previews(token: str, shapes: list[ConvertedShape]) -> list[dict[str, str]]:
    """Copy converted shape SVGs into the servable preview cache under
    ``token``, sanitizing each shape's title into a safe filename.

    Returns ``[{"title": ..., "filename": ...}]`` — the caller builds public
    preview URLs from (token, filename).
    """
    if not _TOKEN_RE.match(token):
        raise InvalidPreviewRef(f"Invalid preview token '{token}'")
    out_dir = PREVIEW_DIR / token
    out_dir.mkdir(parents=True, exist_ok=True)
    saved: list[dict[str, str]] = []
    seen: set[str] = set()
    for shape in shapes:
        filename = _safe_preview_filename(shape.title)
        # Two shapes sanitizing to the same filename (rare, but possible if
        # titles differ only by a stripped character) get a numeric suffix
        # instead of one silently overwriting the other.
        base, ext = filename[:-4], filename[-4:]
        n = 1
        while filename in seen:
            n += 1
            filename = f"{base} ({n}){ext}"
        seen.add(filename)
        (out_dir / filename).write_bytes(shape.svg_path.read_bytes())
        saved.append({"title": shape.title, "filename": filename})
    return saved


def preview_path(token: str, filename: str) -> Path:
    """Resolve (token, filename) to a path INSIDE PREVIEW_DIR, or raise
    InvalidPreviewRef — the charset checks plus the resolved-path containment
    check together rule out any path-traversal attempt."""
    if not _TOKEN_RE.match(token):
        raise InvalidPreviewRef(f"Invalid preview token '{token}'")
    if not _FILENAME_RE.match(filename):
        raise InvalidPreviewRef(f"Invalid preview filename '{filename}'")
    root = PREVIEW_DIR.resolve()
    path = (PREVIEW_DIR / token / filename).resolve()
    if root not in path.parents:
        raise InvalidPreviewRef("Preview path escapes the cache directory")
    return path
