"""The versioned parity fixtures must match a fresh Python execution."""

from scripts.export_parity_fixtures import FIXTURE_ROOT, export_fixtures


def test_parity_fixtures_match_the_python_core() -> None:
    fresh = export_fixtures(root=None)
    written = {
        path.relative_to(FIXTURE_ROOT).as_posix(): path.read_text(encoding="utf-8")
        for path in FIXTURE_ROOT.rglob("*.json")
    }

    assert written == fresh
