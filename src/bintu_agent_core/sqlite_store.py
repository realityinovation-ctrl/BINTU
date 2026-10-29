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
                        state_json TEXT NOT NULL
                    )
                    """
                )
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

    def save_investigation(self, state: InvestigationState) -> None:
        state_json = _serialize_state(state)
        try:
            with self._connection() as connection:
                cursor = connection.execute(
                    """
                    UPDATE investigations
                    SET updated_at = ?, status = ?, state_json = ?
                    WHERE id = ?
                    """,
                    (
                        _utc_now(),
                        state.status.value,
                        state_json,
                        state.investigation_id,
                    ),
                )
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


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


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

    state_payload = {
        key: value for key, value in payload.items() if key != "schema_version"
    }
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
