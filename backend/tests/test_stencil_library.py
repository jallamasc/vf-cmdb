"""Phase 4 Task 29 — Stencil_Conversion_Service (Requirement 22.3/22.5).

Feature: phase-4-ux-graphical-views. The real ``vss2svg-conv`` binary is
built from source inside the Containerfile and cannot be compiled on macOS
(it's Linux-only tooling) — it is NOT installed on the machine running this
test suite, by design. So most of these tests mock ``subprocess.run`` to
verify this module's OWN logic (temp dir handling, title parsing, error
propagation) rather than depending on the real tool. One real,
skip-cleanly-when-unavailable test is included for when this DOES run inside
the container (or a CI image that has the binary installed).
"""
from pathlib import Path
from unittest.mock import patch

import pytest

from app import stencil_library as sl


def test_binary_available_reflects_which(tmp_path):
    with patch("shutil.which", return_value=None):
        assert sl.binary_available() is False
    with patch("shutil.which", return_value="/usr/bin/vss2svg-conv"):
        assert sl.binary_available() is True


def test_convert_stencil_missing_source_file_raises(tmp_path):
    missing = tmp_path / "nope.vss"
    with pytest.raises(FileNotFoundError):
        sl.convert_stencil(missing)


def test_convert_stencil_raises_when_binary_unavailable(tmp_path):
    source = tmp_path / "sample.vss"
    source.write_bytes(b"not a real stencil")
    with patch.object(sl, "binary_available", return_value=False):
        with pytest.raises(sl.ConversionUnavailable):
            sl.convert_stencil(source)


def test_convert_stencil_success_parses_shape_titles(tmp_path):
    """Mirrors the real tool: writes SVG files named after each shape's
    title into the output dir, exits 0. Verifies title parsing (underscores
    -> spaces, hyphens preserved) and that files are returned sorted."""
    source = tmp_path / "sample.vss"
    source.write_bytes(b"not a real stencil")
    out_dir = tmp_path / "out"
    out_dir.mkdir()

    def fake_mkdtemp(prefix=None):
        return str(out_dir)

    def fake_run(cmd, capture_output, text, timeout):
        (out_dir / "WS-C2960CX-8PC-L_Front.svg").write_text("<svg/>")
        (out_dir / "WS-C2960CX-8PC-L_Rear.svg").write_text("<svg/>")
        return type("R", (), {"returncode": 0, "stdout": "", "stderr": ""})()

    with patch.object(sl, "binary_available", return_value=True), \
         patch("tempfile.mkdtemp", side_effect=fake_mkdtemp), \
         patch("subprocess.run", side_effect=fake_run):
        shapes = sl.convert_stencil(source)

    assert len(shapes) == 2
    titles = sorted(s.title for s in shapes)
    assert titles == ["WS-C2960CX-8PC-L Front", "WS-C2960CX-8PC-L Rear"]
    for s in shapes:
        assert s.svg_path.exists()


def test_convert_stencil_raises_on_nonzero_exit(tmp_path):
    source = tmp_path / "sample.vss"
    source.write_bytes(b"not a real stencil")

    def fake_run(cmd, capture_output, text, timeout):
        return type("R", (), {"returncode": 1, "stdout": "", "stderr": "bad file"})()

    with patch.object(sl, "binary_available", return_value=True), \
         patch("subprocess.run", side_effect=fake_run):
        with pytest.raises(sl.ConversionFailed, match="bad file"):
            sl.convert_stencil(source)


def test_convert_stencil_raises_when_no_shapes_produced(tmp_path):
    source = tmp_path / "sample.vss"
    source.write_bytes(b"not a real stencil")

    def fake_run(cmd, capture_output, text, timeout):
        return type("R", (), {"returncode": 0, "stdout": "", "stderr": ""})()

    with patch.object(sl, "binary_available", return_value=True), \
         patch("subprocess.run", side_effect=fake_run):
        with pytest.raises(sl.ConversionFailed, match="no shapes"):
            sl.convert_stencil(source)


def test_convert_stencil_raises_on_timeout(tmp_path):
    import subprocess as sp

    source = tmp_path / "sample.vss"
    source.write_bytes(b"not a real stencil")

    def fake_run(cmd, capture_output, text, timeout):
        raise sp.TimeoutExpired(cmd, timeout)

    with patch.object(sl, "binary_available", return_value=True), \
         patch("subprocess.run", side_effect=fake_run):
        with pytest.raises(sl.ConversionFailed, match="timed out"):
            sl.convert_stencil(source, timeout=5)


@pytest.mark.skipif(
    not sl.binary_available(),
    reason="vss2svg-conv not installed on this host (Linux-only, built in the "
    "container image) — this test only runs inside that image or a CI "
    "environment with the binary present.",
)
def test_convert_real_sample_stencil():
    """Runs for real only where the binary AND a sample fixture both exist."""
    fixture = Path(__file__).parent / "fixtures" / "sample.vss"
    if not fixture.exists():
        pytest.skip("no tests/fixtures/sample.vss fixture checked in")
    shapes = sl.convert_stencil(fixture)
    assert len(shapes) > 0
    for shape in shapes:
        assert shape.svg_path.read_text().strip().startswith("<?xml") or \
            "<svg" in shape.svg_path.read_text()
