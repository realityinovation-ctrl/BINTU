"""Apply numbered SQL migrations under backend/migrations/.

Shared by desk and mobile: one MySQL schema, one runner.
Fresh installs still start from bdd.sql ; upgrades use this module.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pymysql
from pymysql.cursors import DictCursor

from bintu.config.settings import mysql_settings

logger = logging.getLogger("bintu.schema_migrate")

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"
_FILE_RE = re.compile(r"^(\d{3})_.+\.sql$", re.IGNORECASE)


@dataclass(frozen=True)
class MigrationFile:
    version: str
    path: Path


def list_migration_files(directory: Path | None = None) -> list[MigrationFile]:
    root = directory or MIGRATIONS_DIR
    if not root.is_dir():
        return []
    found: list[MigrationFile] = []
    for path in sorted(root.glob("*.sql")):
        if not _FILE_RE.match(path.name):
            continue
        found.append(MigrationFile(version=path.stem, path=path))
    return found


def split_sql_statements(script: str) -> list[str]:
    """Split a migration file into executable statements (no DELIMITER support)."""

    cleaned_lines: list[str] = []
    for raw in script.splitlines():
        line = raw.rstrip()
        stripped = line.strip()
        if stripped.startswith("--"):
            continue
        cleaned_lines.append(line)
    blob = "\n".join(cleaned_lines)
    parts = [part.strip() for part in blob.split(";")]
    return [part for part in parts if part]


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _connect(config: dict[str, Any] | None = None):
    settings = dict(config or mysql_settings())
    return pymysql.connect(
        host=str(settings["host"]),
        port=int(settings["port"]),
        user=str(settings["user"]),
        password=str(settings["password"]),
        database=str(settings["database"]),
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=True,
    )


def _ensure_tracking_table(cursor: DictCursor) -> None:
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(128) NOT NULL,
          applied_at VARCHAR(40) NOT NULL,
          PRIMARY KEY (version)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )


def _applied_versions(cursor: DictCursor) -> set[str]:
    cursor.execute("SELECT version FROM schema_migrations")
    rows = cursor.fetchall() or []
    return {str(row["version"]) for row in rows}


def apply_migrations(
    *,
    directory: Path | None = None,
    config: dict[str, Any] | None = None,
    dry_run: bool = False,
) -> list[str]:
    """Apply pending migrations. Returns the list of newly applied versions."""

    pending_files = list_migration_files(directory)
    connection = _connect(config)
    applied_now: list[str] = []
    try:
        with connection.cursor() as cursor:
            _ensure_tracking_table(cursor)
            already = _applied_versions(cursor)
            for item in pending_files:
                if item.version in already:
                    continue
                script = item.path.read_text(encoding="utf-8")
                statements = split_sql_statements(script)
                if dry_run:
                    logger.info("dry-run would apply %s (%s statements)", item.version, len(statements))
                    applied_now.append(item.version)
                    continue
                logger.info("applying migration %s", item.version)
                for statement in statements:
                    cursor.execute(statement)
                cursor.execute(
                    """
                    INSERT INTO schema_migrations (version, applied_at)
                    VALUES (%s, %s)
                    """,
                    (item.version, _utc_now()),
                )
                applied_now.append(item.version)
                logger.info("applied migration %s", item.version)
    finally:
        connection.close()
    return applied_now


def status(
    *,
    directory: Path | None = None,
    config: dict[str, Any] | None = None,
) -> dict[str, object]:
    files = list_migration_files(directory)
    connection = _connect(config)
    try:
        with connection.cursor() as cursor:
            _ensure_tracking_table(cursor)
            already = _applied_versions(cursor)
    finally:
        connection.close()
    pending = [item.version for item in files if item.version not in already]
    return {
        "available": [item.version for item in files],
        "applied": sorted(already),
        "pending": pending,
    }
