"""Minimal SQLite persistence for complete InvestigationState snapshots."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from pydantic import ValidationError

from bintu_agent_core.errors import (
    InvestigationNotFoundError,
    PersistenceError,
    StateCorruptionError,
)
from bintu_agent_core.models import InvestigationState


SCHEMA_VERSION = 1


@dataclass(frozen=True)
class InvestigationSummary:
    id: str
    created_at: str
    updated_at: str
    status: str


class SQLiteInvestigationStore:
    """Persist each investigation as one versioned, lossless JSON snapshot."""

    def __init__(self, database_path: str | Path) -> None:
        self.database_path = Path(database_path)
        try:
            self.database_path.parent.mkdir(parents=True, exist_ok=True)
            with self._connection() as connection:
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS investigations (
                        id TEXT PRIMARY KEY,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        status TEXT NOT NULL,
                        state_json TEXT NOT NULL,
                        organization_id TEXT,
                        created_by_user_id TEXT,
                        state_schema_version INTEGER NOT NULL DEFAULT 1,
                        state_revision INTEGER NOT NULL DEFAULT 1
                    )
                    """
                )
                _ensure_ownership_columns(connection)
        except (OSError, sqlite3.Error) as exc:
            raise PersistenceError("failed to initialize SQLite store") from exc

    def create_investigation(self) -> InvestigationState:
        state = InvestigationState(investigation_id=str(uuid4()))
        timestamp = _utc_now()
        state_json = _serialize_state(state)
        try:
            with self._connection() as connection:
                connection.execute(
                    """
                    INSERT INTO investigations
                        (id, created_at, updated_at, status, state_json)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        state.investigation_id,
                        timestamp,
                        timestamp,
                        state.status.value,
                        state_json,
                    ),
                )
        except sqlite3.Error as exc:
            raise PersistenceError("failed to create investigation") from exc
        return state

    def create_in_organization(
        self, organization_id: str, created_by_user_id: str
    ) -> InvestigationState:
        if not organization_id or not created_by_user_id:
            raise PersistenceError("investigation owner is required")
        state = InvestigationState(investigation_id=str(uuid4()))
        timestamp = _utc_now()
        state_json = _serialize_state(state)
        try:
            with self._connection() as connection:
                connection.execute(
                    """
                    INSERT INTO investigations (
                        id, created_at, updated_at, status, state_json,
                        organization_id, created_by_user_id,
                        state_schema_version, state_revision
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        state.investigation_id,
                        timestamp,
                        timestamp,
                        state.status.value,
                        state_json,
                        organization_id,
                        created_by_user_id,
                        SCHEMA_VERSION,
                        1,
                    ),
                )
        except sqlite3.Error as exc:
            raise PersistenceError("failed to create investigation") from exc
        return state

    def get_investigation(self, investigation_id: str) -> InvestigationState:
        try:
            with self._connection() as connection:
                row = connection.execute(
                    """
                    SELECT id, status, state_json
                    FROM investigations
                    WHERE id = ?
                    """,
                    (investigation_id,),
                ).fetchone()
        except sqlite3.Error as exc:
            raise PersistenceError("failed to read investigation") from exc
        if row is None:
            raise InvestigationNotFoundError(
                f"investigation not found: {investigation_id}"
            )
        return _deserialize_state(
            state_json=row["state_json"],
            expected_id=row["id"],
            expected_status=row["status"],
        )

    def get_in_organization(
        self, investigation_id: str, organization_id: str
    ) -> InvestigationState:
        try:
            with self._connection() as connection:
                row = connection.execute(
                    """
                    SELECT id, status, state_json
                    FROM investigations
                    WHERE id = ? AND organization_id = ?
                    """,
                    (investigation_id, organization_id),
                ).fetchone()
        except sqlite3.Error as exc:
            raise PersistenceError("failed to read investigation") from exc
        if row is None:
            raise InvestigationNotFoundError(
                f"investigation not found: {investigation_id}"
            )
        return _deserialize_state(
            state_json=row["state_json"],
            expected_id=row["id"],
            expected_status=row["status"],
        )

    def save_investigation(self, state: InvestigationState) -> None:
        self._save(state, organization_id=None)

    def save_in_organization(
        self, state: InvestigationState, organization_id: str
    ) -> None:
        self._save(state, organization_id=organization_id)

    def _save(
        self, state: InvestigationState, *, organization_id: str | None
    ) -> None:
        state_json = _serialize_state(state)
        if organization_id is None:
            statement = """
                UPDATE investigations
                SET updated_at = ?, status = ?, state_json = ?,
                    state_schema_version = ?,
                    state_revision = state_revision + 1
                WHERE id = ?
            """
            parameters: tuple[object, ...] = (
                _utc_now(),
                state.status.value,
                state_json,
                SCHEMA_VERSION,
                state.investigation_id,
            )
        else:
            statement = """
                UPDATE investigations
                SET updated_at = ?, status = ?, state_json = ?,
                    state_schema_version = ?,
                    state_revision = state_revision + 1
                WHERE id = ? AND organization_id = ?
            """
            parameters = (
                _utc_now(),
                state.status.value,
                state_json,
                SCHEMA_VERSION,
                state.investigation_id,
                organization_id,
            )
        try:
            with self._connection() as connection:
                cursor = connection.execute(statement, parameters)
        except sqlite3.Error as exc:
            raise PersistenceError("failed to save investigation") from exc
        if cursor.rowcount == 0:
            raise InvestigationNotFoundError(
                f"investigation not found: {state.investigation_id}"
            )

    def list_investigations(
        self, limit: int = 100
    ) -> list[InvestigationSummary]:
        if isinstance(limit, bool) or limit < 1:
            raise ValueError("limit must be a positive integer")
        try:
            with self._connection() as connection:
                rows = connection.execute(
                    """
                    SELECT id, created_at, updated_at, status
                    FROM investigations
                    ORDER BY updated_at DESC, id ASC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
        except sqlite3.Error as exc:
            raise PersistenceError("failed to list investigations") from exc
        return [
            InvestigationSummary(
                id=row["id"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                status=row["status"],
            )
            for row in rows
        ]

    def list_in_organization(
        self, organization_id: str, limit: int = 100
    ) -> list[InvestigationSummary]:
        if isinstance(limit, bool) or limit < 1:
            raise ValueError("limit must be a positive integer")
        try:
            with self._connection() as connection:
                rows = connection.execute(
                    """
                    SELECT id, created_at, updated_at, status
                    FROM investigations
                    WHERE organization_id = ?
                    ORDER BY updated_at DESC, id ASC
                    LIMIT ?
                    """,
                    (organization_id, limit),
                ).fetchall()
        except sqlite3.Error as exc:
            raise PersistenceError("failed to list investigations") from exc
        return [
            InvestigationSummary(
                id=row["id"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                status=row["status"],
            )
            for row in rows
        ]

    def delete_investigation(self, investigation_id: str) -> None:
        try:
            with self._connection() as connection:
                cursor = connection.execute(
                    "DELETE FROM investigations WHERE id = ?",
                    (investigation_id,),
                )
        except sqlite3.Error as exc:
            raise PersistenceError("failed to delete investigation") from exc
        if cursor.rowcount == 0:
            raise InvestigationNotFoundError(
                f"investigation not found: {investigation_id}"
            )

    def delete_in_organization(
        self, investigation_id: str, organization_id: str
    ) -> None:
        try:
            with self._connection() as connection:
                cursor = connection.execute(
                    """
                    DELETE FROM investigations
                    WHERE id = ? AND organization_id = ?
                    """,
                    (investigation_id, organization_id),
                )
        except sqlite3.Error as exc:
            raise PersistenceError("failed to delete investigation") from exc
        if cursor.rowcount == 0:
            raise InvestigationNotFoundError(
                f"investigation not found: {investigation_id}"
            )

    def bind_owner(
        self,
        investigation_id: str,
        organization_id: str,
        created_by_user_id: str,
    ) -> None:
        try:
            with self._connection() as connection:
                cursor = connection.execute(
                    """
                    UPDATE investigations
                    SET organization_id = ?, created_by_user_id = ?
                    WHERE id = ? AND organization_id IS NULL
                    """,
                    (organization_id, created_by_user_id, investigation_id),
                )
        except sqlite3.Error as exc:
            raise PersistenceError("failed to bind investigation") from exc
        if cursor.rowcount != 1:
            raise InvestigationNotFoundError(
                f"investigation not found: {investigation_id}"
            )

    def claim_unassigned(
        self, organization_id: str, created_by_user_id: str
    ) -> int:
        try:
            with self._connection() as connection:
                cursor = connection.execute(
                    """
                    UPDATE investigations
                    SET organization_id = ?, created_by_user_id = ?,
                        state_revision = 1
                    WHERE organization_id IS NULL
                    """,
                    (organization_id, created_by_user_id),
                )
        except sqlite3.Error as exc:
            raise PersistenceError("failed to claim investigations") from exc
        return int(cursor.rowcount)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        connection = self._connect()
        try:
            with connection:
                yield connection
        finally:
            connection.close()


def _ensure_ownership_columns(connection: sqlite3.Connection) -> None:
    existing = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(investigations)")
    }
    additions = (
        ("organization_id", "ALTER TABLE investigations ADD COLUMN organization_id TEXT"),
        (
            "created_by_user_id",
            "ALTER TABLE investigations ADD COLUMN created_by_user_id TEXT",
        ),
        (
            "state_schema_version",
            "ALTER TABLE investigations ADD COLUMN state_schema_version INTEGER NOT NULL DEFAULT 1",
        ),
        (
            "state_revision",
            "ALTER TABLE investigations ADD COLUMN state_revision INTEGER NOT NULL DEFAULT 1",
        ),
    )
    for name, statement in additions:
        if name not in existing:
            connection.execute(statement)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_legacy_system(state_payload: dict) -> dict:
    """Read a stored photovoltaic installation as a generic diagnosed system."""

    if "system" in state_payload or "installation" not in state_payload:
        return state_payload
    installation = state_payload["installation"]
    if not isinstance(installation, dict):
        return state_payload
    characteristics = {
        key: value for key, value in installation.items() if value is not None
    }
    normalized = {
        key: value for key, value in state_payload.items() if key != "installation"
    }
    normalized["system"] = {
        "domain": "photovoltaic",
        "type": "photovoltaic_installation",
        "manufacturer": None,
        "model": None,
        "characteristics": characteristics,
    }
    return normalized


def _serialize_state(state: InvestigationState) -> str:
    payload = {
        "schema_version": SCHEMA_VERSION,
        **state.model_dump(mode="json"),
    }
    return json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def _deserialize_state(
    state_json: str, expected_id: str, expected_status: str
) -> InvestigationState:
    try:
        payload = json.loads(state_json)
    except (json.JSONDecodeError, TypeError) as exc:
        raise StateCorruptionError("state_json is not valid JSON") from exc
    if not isinstance(payload, dict):
        raise StateCorruptionError("state_json must contain a JSON object")
    if payload.get("schema_version") != SCHEMA_VERSION:
        raise StateCorruptionError(
            f"unsupported schema_version: {payload.get('schema_version')!r}"
        )

    state_payload = _normalize_legacy_system(
        {key: value for key, value in payload.items() if key != "schema_version"}
    )
    try:
        restored = InvestigationState.model_validate(state_payload)
    except ValidationError as exc:
        raise StateCorruptionError(
            "state_json does not match InvestigationState"
        ) from exc

    canonical = restored.model_dump(mode="json")
    if canonical != state_payload:
        raise StateCorruptionError(
            "state_json would require reconstruction or default values"
        )
    if restored.investigation_id != expected_id:
        raise StateCorruptionError(
            "state_json investigation_id does not match its database row"
        )
    if restored.status.value != expected_status:
        raise StateCorruptionError(
            "state_json status does not match its database row"
        )
    return restored
