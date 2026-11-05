"""MySQL persistence for Google users, sessions and daily ChatGPT-like quotas."""

from __future__ import annotations

import hashlib
import secrets
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator
from uuid import uuid4

import pymysql
from pymysql.cursors import DictCursor

from bintu.config.settings import (
    free_investigations_limit,
    free_live_minutes_limit,
    free_messages_limit,
    mysql_settings,
    session_ttl_hours,
)
from bintu.core.errors import PersistenceError


@dataclass(frozen=True)
class UserRecord:
    id: str
    google_sub: str
    email: str
    name: str | None
    picture_url: str | None
    organization_id: str
    plan: str


@dataclass(frozen=True)
class QuotaSnapshot:
    period_date: str
    messages_used: int
    messages_limit: int
    messages_remaining: int
    live_minutes_used: float
    live_minutes_limit: float
    live_minutes_remaining: float
    investigations_used: int
    investigations_limit: int
    investigations_remaining: int


@dataclass(frozen=True)
class SessionBundle:
    access_token: str
    expires_at: str
    user: UserRecord
    quota: QuotaSnapshot


class QuotaExceededError(Exception):
    def __init__(self, kind: str, remaining: int | float = 0) -> None:
        super().__init__(kind)
        self.kind = kind
        self.remaining = remaining


class UserStore:
    def __init__(self, config: dict[str, Any] | None = None) -> None:
        self._config = dict(config or mysql_settings())
        try:
            with self._connection() as cursor:
                for table in ("users", "auth_sessions", "usage_quotas"):
                    cursor.execute(
                        """
                        SELECT COUNT(*) AS present
                        FROM information_schema.tables
                        WHERE table_schema = %s AND table_name = %s
                        """,
                        (self._config["database"], table),
                    )
                    row = cursor.fetchone()
                    if row is None or int(row["present"]) != 1:
                        raise PersistenceError(
                            "MySQL auth schema missing. Re-import backend/bdd.sql (v3)."
                        )
        except PersistenceError:
            raise
        except pymysql.Error as exc:
            raise PersistenceError("failed to connect to MySQL auth tables") from exc

    def upsert_google_user(
        self,
        *,
        google_sub: str,
        email: str,
        name: str | None,
        picture_url: str | None,
    ) -> UserRecord:
        now = _utc_now()
        email_n = email.strip().lower()
        try:
            with self._connection() as cursor:
                cursor.execute(
                    "SELECT * FROM users WHERE google_sub = %s LIMIT 1",
                    (google_sub,),
                )
                row = cursor.fetchone()
                if row:
                    cursor.execute(
                        """
                        UPDATE users
                        SET email = %s, name = %s, picture_url = %s,
                            updated_at = %s, last_login_at = %s
                        WHERE id = %s
                        """,
                        (
                            email_n,
                            name,
                            picture_url,
                            now,
                            now,
                            row["id"],
                        ),
                    )
                    return _user_from_row(
                        {
                            **row,
                            "email": email_n,
                            "name": name,
                            "picture_url": picture_url,
                        }
                    )

                user_id = str(uuid4())
                org_id = f"org_user_{user_id}"
                cursor.execute(
                    """
                    INSERT INTO users (
                      id, google_sub, email, name, picture_url,
                      organization_id, plan, created_at, updated_at, last_login_at
                    ) VALUES (%s,%s,%s,%s,%s,%s,'free',%s,%s,%s)
                    """,
                    (
                        user_id,
                        google_sub,
                        email_n,
                        name,
                        picture_url,
                        org_id,
                        now,
                        now,
                        now,
                    ),
                )
                return UserRecord(
                    id=user_id,
                    google_sub=google_sub,
                    email=email_n,
                    name=name,
                    picture_url=picture_url,
                    organization_id=org_id,
                    plan="free",
                )
        except pymysql.Error as exc:
            raise PersistenceError("failed to upsert user") from exc

    def create_session(
        self, user: UserRecord, *, user_agent: str | None = None
    ) -> SessionBundle:
        now = datetime.now(timezone.utc)
        expires = now + timedelta(hours=session_ttl_hours())
        token = secrets.token_urlsafe(32)
        token_hash = _hash_token(token)
        session_id = str(uuid4())
        try:
            with self._connection() as cursor:
                cursor.execute(
                    """
                    INSERT INTO auth_sessions (
                      id, user_id, token_hash, created_at, expires_at,
                      last_seen_at, user_agent
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s)
                    """,
                    (
                        session_id,
                        user.id,
                        token_hash,
                        _fmt(now),
                        _fmt(expires),
                        _fmt(now),
                        (user_agent or "")[:512] or None,
                    ),
                )
                quota = self._ensure_quota(cursor, user.id)
        except pymysql.Error as exc:
            raise PersistenceError("failed to create session") from exc
        return SessionBundle(
            access_token=token,
            expires_at=_fmt(expires),
            user=user,
            quota=quota,
        )

    def resolve_token(self, access_token: str) -> tuple[UserRecord, QuotaSnapshot] | None:
        if not access_token or len(access_token) < 16:
            return None
        token_hash = _hash_token(access_token)
        now = _utc_now()
        try:
            with self._connection() as cursor:
                cursor.execute(
                    """
                    SELECT s.id AS session_id, s.expires_at, s.revoked_at,
                           u.id, u.google_sub, u.email, u.name, u.picture_url,
                           u.organization_id, u.plan
                    FROM auth_sessions s
                    JOIN users u ON u.id = s.user_id
                    WHERE s.token_hash = %s
                    LIMIT 1
                    """,
                    (token_hash,),
                )
                row = cursor.fetchone()
                if row is None:
                    return None
                if row.get("revoked_at"):
                    return None
                if str(row["expires_at"]) <= now:
                    return None
                cursor.execute(
                    "UPDATE auth_sessions SET last_seen_at = %s WHERE id = %s",
                    (now, row["session_id"]),
                )
                user = UserRecord(
                    id=str(row["id"]),
                    google_sub=str(row["google_sub"]),
                    email=str(row["email"]),
                    name=row.get("name"),
                    picture_url=row.get("picture_url"),
                    organization_id=str(row["organization_id"]),
                    plan=str(row.get("plan") or "free"),
                )
                quota = self._ensure_quota(cursor, user.id)
                return user, quota
        except pymysql.Error as exc:
            raise PersistenceError("failed to resolve session") from exc

    def revoke_token(self, access_token: str) -> None:
        token_hash = _hash_token(access_token)
        now = _utc_now()
        try:
            with self._connection() as cursor:
                cursor.execute(
                    """
                    UPDATE auth_sessions
                    SET revoked_at = %s
                    WHERE token_hash = %s AND revoked_at IS NULL
                    """,
                    (now, token_hash),
                )
        except pymysql.Error as exc:
            raise PersistenceError("failed to revoke session") from exc

    def get_quota(self, user_id: str) -> QuotaSnapshot:
        try:
            with self._connection() as cursor:
                return self._ensure_quota(cursor, user_id)
        except pymysql.Error as exc:
            raise PersistenceError("failed to read quota") from exc

    def consume_message(self, user_id: str) -> QuotaSnapshot:
        return self._consume(user_id, "messages")

    def consume_investigation(self, user_id: str) -> QuotaSnapshot:
        return self._consume(user_id, "investigations")

    def consume_live_minutes(self, user_id: str, minutes: float) -> QuotaSnapshot:
        if minutes <= 0:
            return self.get_quota(user_id)
        try:
            with self._connection() as cursor:
                quota = self._ensure_quota(cursor, user_id)
                if quota.live_minutes_remaining < minutes:
                    raise QuotaExceededError(
                        "live_minutes", quota.live_minutes_remaining
                    )
                cursor.execute(
                    """
                    UPDATE usage_quotas
                    SET live_minutes_used = live_minutes_used + %s, updated_at = %s
                    WHERE user_id = %s AND period_date = %s
                    """,
                    (minutes, _utc_now(), user_id, quota.period_date),
                )
                return self._ensure_quota(cursor, user_id)
        except QuotaExceededError:
            raise
        except pymysql.Error as exc:
            raise PersistenceError("failed to consume live quota") from exc

    def _consume(self, user_id: str, kind: str) -> QuotaSnapshot:
        try:
            with self._connection() as cursor:
                quota = self._ensure_quota(cursor, user_id)
                if kind == "messages":
                    if quota.messages_remaining <= 0:
                        raise QuotaExceededError("messages", 0)
                    cursor.execute(
                        """
                        UPDATE usage_quotas
                        SET messages_used = messages_used + 1, updated_at = %s
                        WHERE user_id = %s AND period_date = %s
                        """,
                        (_utc_now(), user_id, quota.period_date),
                    )
                elif kind == "investigations":
                    if quota.investigations_remaining <= 0:
                        raise QuotaExceededError("investigations", 0)
                    cursor.execute(
                        """
                        UPDATE usage_quotas
                        SET investigations_used = investigations_used + 1, updated_at = %s
                        WHERE user_id = %s AND period_date = %s
                        """,
                        (_utc_now(), user_id, quota.period_date),
                    )
                else:
                    raise PersistenceError(f"unknown quota kind: {kind}")
                return self._ensure_quota(cursor, user_id)
        except QuotaExceededError:
            raise
        except pymysql.Error as exc:
            raise PersistenceError("failed to consume quota") from exc

    def _ensure_quota(self, cursor: DictCursor, user_id: str) -> QuotaSnapshot:
        period = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        cursor.execute(
            """
            SELECT * FROM usage_quotas
            WHERE user_id = %s AND period_date = %s
            LIMIT 1
            """,
            (user_id, period),
        )
        row = cursor.fetchone()
        if row is None:
            cursor.execute(
                """
                INSERT INTO usage_quotas (
                  user_id, period_date, messages_used, messages_limit,
                  live_minutes_used, live_minutes_limit,
                  investigations_used, investigations_limit, updated_at
                ) VALUES (%s,%s,0,%s,0,%s,0,%s,%s)
                """,
                (
                    user_id,
                    period,
                    free_messages_limit(),
                    free_live_minutes_limit(),
                    free_investigations_limit(),
                    _utc_now(),
                ),
            )
            cursor.execute(
                """
                SELECT * FROM usage_quotas
                WHERE user_id = %s AND period_date = %s
                LIMIT 1
                """,
                (user_id, period),
            )
            row = cursor.fetchone()
        assert row is not None
        return _quota_from_row(row)

    @contextmanager
    def _connection(self) -> Iterator[DictCursor]:
        conn = pymysql.connect(
            host=self._config["host"],
            port=int(self._config["port"]),
            user=self._config["user"],
            password=self._config["password"],
            database=self._config["database"],
            charset="utf8mb4",
            cursorclass=DictCursor,
            autocommit=True,
        )
        try:
            with conn.cursor() as cursor:
                yield cursor
        finally:
            conn.close()


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _utc_now() -> str:
    return _fmt(datetime.now(timezone.utc))


def _fmt(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _user_from_row(row: dict[str, Any]) -> UserRecord:
    return UserRecord(
        id=str(row["id"]),
        google_sub=str(row["google_sub"]),
        email=str(row["email"]),
        name=row.get("name"),
        picture_url=row.get("picture_url"),
        organization_id=str(row["organization_id"]),
        plan=str(row.get("plan") or "free"),
    )


def _quota_from_row(row: dict[str, Any]) -> QuotaSnapshot:
    msg_used = int(row["messages_used"])
    msg_lim = int(row["messages_limit"])
    live_used = float(row["live_minutes_used"])
    live_lim = float(row["live_minutes_limit"])
    inv_used = int(row["investigations_used"])
    inv_lim = int(row["investigations_limit"])
    return QuotaSnapshot(
        period_date=str(row["period_date"]),
        messages_used=msg_used,
        messages_limit=msg_lim,
        messages_remaining=max(0, msg_lim - msg_used),
        live_minutes_used=live_used,
        live_minutes_limit=live_lim,
        live_minutes_remaining=max(0.0, live_lim - live_used),
        investigations_used=inv_used,
        investigations_limit=inv_lim,
        investigations_remaining=max(0, inv_lim - inv_used),
    )
