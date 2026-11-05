"""The versioned HTTP fixtures must match a fresh FastAPI execution."""

from scripts.export_http_fixtures import FIXTURE_ROOT, export_fixtures


def test_http_fixtures_match_the_python_api() -> None:
    fresh = export_fixtures(root=None)
    written = {
        path.relative_to(FIXTURE_ROOT).as_posix(): path.read_bytes()
        for path in FIXTURE_ROOT.rglob("*")
        if path.is_file()
    }

    assert written == fresh
