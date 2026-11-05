"""Unit tests for migration discovery (no MySQL required)."""

from __future__ import annotations

from pathlib import Path

from bintu.persistence.schema_migrate import list_migration_files, split_sql_statements


def test_list_migration_files_ordered(tmp_path: Path) -> None:
    (tmp_path / "002_b.sql").write_text("SELECT 2;", encoding="utf-8")
    (tmp_path / "001_a.sql").write_text("SELECT 1;", encoding="utf-8")
    (tmp_path / "readme.txt").write_text("skip", encoding="utf-8")
    (tmp_path / "bad.sql").write_text("SELECT 0;", encoding="utf-8")

    files = list_migration_files(tmp_path)
    assert [item.version for item in files] == ["001_a", "002_b"]


def test_split_sql_ignores_line_comments() -> None:
    script = """
-- comment
CREATE TABLE IF NOT EXISTS demo (id INT);
-- another
INSERT INTO demo (id) VALUES (1);
"""
    statements = split_sql_statements(script)
    assert len(statements) == 2
    assert statements[0].startswith("CREATE TABLE")
    assert statements[1].startswith("INSERT INTO")


def test_packaged_migrations_follow_naming() -> None:
    root = Path(__file__).resolve().parents[1] / "migrations"
    files = list_migration_files(root)
    assert files, "migrations/ should contain numbered SQL files"
    assert files[0].version.startswith("001_")
    versions = [item.version for item in files]
    assert versions == sorted(versions)
