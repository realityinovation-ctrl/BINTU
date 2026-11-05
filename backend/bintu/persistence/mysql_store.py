"""MySQL persistence for complete InvestigationState snapshots."""

from __future__ import annotations

import json
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import pymysql
from pydantic import ValidationError
from pymysql.cursors import DictCursor

from bintu.config.settings import mysql_settings
from bintu.core.errors import (
    InvestigationNotFoundError,
    PersistenceError,
    StateCorruptionError,
)
from bintu.core.models import InvestigationState

# v2: problem_summary column + assistant_context in JSON (additive).
SCHEMA_VERSION = 2
SUPPORTED_SCHEMA_VERSIONS = {1, 2}


@dataclass(frozen=True)
class InvestigationSummary:
    id: str
    created_at: str
    updated_at: str
    status: str
    problem_summary: str | None = None


class MySQLInvestigationStore:
    """Persist each investigation as one versioned JSON snapshot in MySQL."""

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        self._config = dict(config or mysql_settings())
        try:
            with self._connection() as cursor:
                cursor.execute(
                    """
                    SELECT COUNT(*) AS present
                    FROM information_schema.tables
                    WHERE table_schema = %s AND table_name = 'investigations'
                    """,
                    (self._config["database"],),
                )
                row = cursor.fetchone()
                if row is None or int(row["present"]) != 1:
                    raise PersistenceError(
                        "MySQL schema is missing. Import backend/bdd.sql into the bintu database."
                    )
                _ensure_problem_summary_column(cursor)
                _backfill_problem_summaries(cursor)
        except PersistenceError:
            raise
        except pymysql.Error as exc:
            raise PersistenceError("failed to connect to MySQL") from exc

    def create_in_organization(
        self, organization_id: str, created_by_user_id: str
    ) -> InvestigationState:
        if not organization_id or not created_by_user_id:
            raise PersistenceError("investigation owner is required")
        state = InvestigationState(investigation_id=str(uuid4()))
        timestamp = _utc_now()
        try:
            with self._connection() as cursor:
                cursor.execute(
                    """
                    INSERT INTO investigations (
                        id, created_at, updated_at, status, problem_summary,
                        state_json, organization_id, created_by_user_id,
                        state_schema_version, state_revision
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        state.investigation_id,
                        timestamp,
                        timestamp,
                        state.status.value,
                        _problem_summary(state),
                        _serialize_state(state),
                        organization_id,
                        created_by_user_id,
                        SCHEMA_VERSION,
                        1,
                    ),
                )
        except pymysql.Error as exc:
            raise PersistenceError("failed to create investigation") from exc
        return state

    def get_in_organization(
        self, investigation_id: str, organization_id: str
    ) -> InvestigationState:
        try:
            with self._connection() as cursor:
                cursor.execute(
                    """
                    SELECT id, status, state_json
                    FROM investigations
                    WHERE id = %s AND organization_id = %s
                    """,
                    (investigation_id, organization_id),
                )
                row = cursor.fetchone()
        except pymysql.Error as exc:
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

    def save_in_organization(
        self, state: InvestigationState, organization_id: str
    ) -> None:
        try:
            with self._connection() as cursor:
                cursor.execute(
                    """
                    UPDATE investigations
                    SET updated_at = %s, status = %s, problem_summary = %s,
                        state_json = %s, state_schema_version = %s,
                        state_revision = state_revision + 1
                    WHERE id = %s AND organization_id = %s
                    """,
                    (
                        _utc_now(),
                        state.status.value,
                        _problem_summary(state),
                        _serialize_state(state),
                        SCHEMA_VERSION,
                        state.investigation_id,
                        organization_id,
                    ),
                )
                found = cursor.rowcount
        except pymysql.Error as exc:
            raise PersistenceError("failed to save investigation") from exc
        if found == 0:
            raise InvestigationNotFoundError(
                f"investigation not found: {state.investigation_id}"
            )

    def list_in_organization(
        self, organization_id: str, limit: int = 100
    ) -> list[InvestigationSummary]:
        if isinstance(limit, bool) or limit < 1:
            raise ValueError("limit must be a positive integer")
        try:
            with self._connection() as cursor:
                cursor.execute(
                    """
                    SELECT id, created_at, updated_at, status, problem_summary
                    FROM investigations
                    WHERE organization_id = %s
                    ORDER BY updated_at DESC, id ASC
                    LIMIT %s
                    """,
                    (organization_id, limit),
                )
                rows = cursor.fetchall()
        except pymysql.Error as exc:
            raise PersistenceError("failed to list investigations") from exc
        return [
            InvestigationSummary(
                id=row["id"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                status=row["status"],
                problem_summary=(
                    str(row["problem_summary"]).strip()
                    if row.get("problem_summary")
                    else None
                ),
            )
            for row in rows
        ]

    def delete_in_organization(
        self, investigation_id: str, organization_id: str
    ) -> None:
        try:
            with self._connection() as cursor:
                cursor.execute(
                    """
                    DELETE FROM investigations
                    WHERE id = %s AND organization_id = %s
                    """,
                    (investigation_id, organization_id),
                )
                found = cursor.rowcount
        except pymysql.Error as exc:
            raise PersistenceError("failed to delete investigation") from exc
        if found == 0:
            raise InvestigationNotFoundError(
                f"investigation not found: {investigation_id}"
            )

    def claim_unassigned(self, organization_id: str, created_by_user_id: str) -> int:
        try:
            with self._connection() as cursor:
                cursor.execute(
                    """
                    UPDATE investigations
                    SET organization_id = %s, created_by_user_id = %s,
                        state_revision = 1
                    WHERE organization_id IS NULL
                    """,
                    (organization_id, created_by_user_id),
                )
                return int(cursor.rowcount)
        except pymysql.Error as exc:
            raise PersistenceError("failed to claim investigations") from exc

    def save_overlay(self, investigation_id: str, payload: dict[str, Any]) -> None:
        confidence = payload.get("confidence_score")
        try:
            with self._connection() as cursor:
                cursor.execute(
                    """
                    INSERT INTO overlay_payloads (
                        investigation_id, step_id, confidence_score,
                        payload_json, created_at
                    )
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (
                        investigation_id,
                        str(payload.get("step_id") or ""),
                        confidence,
                        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                        _utc_now(),
                    ),
                )
        except pymysql.Error as exc:
            raise PersistenceError("failed to save overlay payload") from exc

    @contextmanager
    def _connection(self) -> Iterator[DictCursor]:
        try:
            connection = pymysql.connect(
                host=str(self._config["host"]),
                port=int(self._config["port"]),
                user=str(self._config["user"]),
                password=str(self._config["password"]),
                database=str(self._config["database"]),
                charset="utf8mb4",
                cursorclass=DictCursor,
                autocommit=False,
            )
        except pymysql.Error as exc:
            raise PersistenceError("failed to connect to MySQL") from exc
        try:
            with connection.cursor() as cursor:
                yield cursor
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()


def _ensure_problem_summary_column(cursor: DictCursor) -> None:
    cursor.execute(
        """
        SELECT COUNT(*) AS present
        FROM information_schema.COLUMNS
        WHERE table_schema = DATABASE()
          AND table_name = 'investigations'
          AND column_name = 'problem_summary'
        """
    )
    row = cursor.fetchone()
    if row is not None and int(row["present"]) == 1:
        return
    cursor.execute(
        """
        ALTER TABLE investigations
        ADD COLUMN problem_summary VARCHAR(512) NULL AFTER status
        """
    )


def _backfill_problem_summaries(cursor: DictCursor) -> None:
    """Fill empty problem_summary from state_json for history list."""

    cursor.execute(
        """
        SELECT id, state_json
        FROM investigations
        WHERE problem_summary IS NULL OR problem_summary = ''
        LIMIT 200
        """
    )
    rows = cursor.fetchall() or []
    for row in rows:
        try:
            payload = json.loads(row["state_json"])
        except (TypeError, json.JSONDecodeError, ValueError):
            continue
        if not isinstance(payload, dict):
            continue
        problem = payload.get("problem")
        text = None
        if isinstance(problem, dict):
            raw = problem.get("description")
            if isinstance(raw, str) and raw.strip():
                text = " ".join(raw.split())[:512]
        if not text:
            continue
        cursor.execute(
            """
            UPDATE investigations
            SET problem_summary = %s
            WHERE id = %s AND (problem_summary IS NULL OR problem_summary = '')
            """,
            (text, row["id"]),
        )


def _problem_summary(state: InvestigationState) -> str | None:
    if state.problem is None:
        return None
    text = " ".join(state.problem.description.split())
    return text[:512] if text else None


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_legacy_system(state_payload: dict[str, Any]) -> dict[str, Any]:
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
    payload = {"schema_version": SCHEMA_VERSION, **state.model_dump(mode="json")}
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _deserialize_state(
    state_json: str, expected_id: str, expected_status: str
) -> InvestigationState:
    try:
        payload = json.loads(state_json)
    except (json.JSONDecodeError, TypeError) as exc:
        raise StateCorruptionError("state_json is not valid JSON") from exc
    if not isinstance(payload, dict):
        raise StateCorruptionError("state_json must contain a JSON object")
    version = payload.get("schema_version")
    if version not in SUPPORTED_SCHEMA_VERSIONS:
        raise StateCorruptionError(
            f"unsupported schema_version: {version!r}"
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
    if restored.investigation_id != expected_id:
        raise StateCorruptionError(
            "state_json investigation_id does not match its database row"
        )
    if restored.status.value != expected_status:
        raise StateCorruptionError(
            "state_json status does not match its database row"
        )
    return restored
