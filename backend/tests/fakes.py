"""In-memory doubles for FastAPI tests (no MySQL)."""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from bintu.core.errors import InvestigationNotFoundError
from bintu.core.models import InvestigationState
from bintu.persistence.mysql_store import InvestigationSummary
from bintu.persistence.user_store import (
    QuotaExceededError,
    QuotaSnapshot,
    SessionBundle,
    UserRecord,
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@dataclass
class MemoryInvestigationStore:
    _rows: dict[str, tuple[str, InvestigationState]] = field(default_factory=dict)
    _overlays: dict[str, dict[str, Any]] = field(default_factory=dict)

    def claim_unassigned(self, organization_id: str, user_id: str) -> int:
        del organization_id, user_id
        return 0

    def create_in_organization(
        self, organization_id: str, created_by_user_id: str
    ) -> InvestigationState:
        del created_by_user_id
        state = InvestigationState(investigation_id=str(uuid4()))
        self._rows[state.investigation_id] = (organization_id, state)
        return state

    def get_in_organization(
        self, investigation_id: str, organization_id: str
    ) -> InvestigationState:
        row = self._rows.get(investigation_id)
        if row is None or row[0] != organization_id:
            raise InvestigationNotFoundError(
                f"investigation not found: {investigation_id}"
            )
        return row[1]

    def save_in_organization(
        self, state: InvestigationState, organization_id: str
    ) -> None:
        self._rows[state.investigation_id] = (organization_id, state)

    def delete_in_organization(
        self, investigation_id: str, organization_id: str
    ) -> None:
        row = self._rows.get(investigation_id)
        if row is not None and row[0] == organization_id:
            del self._rows[investigation_id]

    def list_in_organization(
        self, organization_id: str, *, limit: int = 50
    ) -> list[InvestigationSummary]:
        now = _utc_now()
        items: list[InvestigationSummary] = []
        for investigation_id, (org, state) in self._rows.items():
            if org != organization_id:
                continue
            problem = (
                state.problem.description if state.problem is not None else None
            )
            items.append(
                InvestigationSummary(
                    id=investigation_id,
                    created_at=now,
                    updated_at=now,
                    status=state.status.value,
                    problem_summary=problem,
                )
            )
            if len(items) >= limit:
                break
        return items

    def save_overlay(
        self, investigation_id: str, payload: dict[str, Any]
    ) -> None:
        self._overlays[investigation_id] = payload


@dataclass
class MemoryUserStore:
    _users_by_sub: dict[str, UserRecord] = field(default_factory=dict)
    _sessions: dict[str, tuple[str, str]] = field(default_factory=dict)
    _quotas: dict[str, dict[str, int | float]] = field(default_factory=dict)
    messages_limit: int = 40
    investigations_limit: int = 5
    live_minutes_limit: float = 15.0

    def upsert_google_user(
        self,
        *,
        google_sub: str,
        email: str,
        name: str | None,
        picture_url: str | None,
    ) -> UserRecord:
        existing = self._users_by_sub.get(google_sub)
        if existing:
            user = UserRecord(
                id=existing.id,
                google_sub=google_sub,
                email=email.strip().lower(),
                name=name,
                picture_url=picture_url,
                organization_id=existing.organization_id,
                plan=existing.plan,
            )
        else:
            user_id = str(uuid4())
            user = UserRecord(
                id=user_id,
                google_sub=google_sub,
                email=email.strip().lower(),
                name=name,
                picture_url=picture_url,
                organization_id=f"org_user_{user_id}",
                plan="free",
            )
        self._users_by_sub[google_sub] = user
        return user

    def create_session(
        self, user: UserRecord, *, user_agent: str | None = None
    ) -> SessionBundle:
        del user_agent
        token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + timedelta(hours=12)
        self._sessions[_hash_token(token)] = (user.id, expires.isoformat())
        return SessionBundle(
            access_token=token,
            expires_at=expires.strftime("%Y-%m-%dT%H:%M:%SZ"),
            user=user,
            quota=self.get_quota(user.id),
        )

    def resolve_token(
        self, access_token: str
    ) -> tuple[UserRecord, QuotaSnapshot] | None:
        row = self._sessions.get(_hash_token(access_token))
        if row is None:
            return None
        user_id, expires = row
        if expires <= datetime.now(timezone.utc).isoformat():
            return None
        user = next(
            (u for u in self._users_by_sub.values() if u.id == user_id), None
        )
        if user is None:
            return None
        return user, self.get_quota(user_id)

    def revoke_token(self, access_token: str) -> None:
        self._sessions.pop(_hash_token(access_token), None)

    def get_quota(self, user_id: str) -> QuotaSnapshot:
        period = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        raw = self._quotas.setdefault(
            user_id,
            {
                "period": period,
                "messages_used": 0,
                "investigations_used": 0,
                "live_minutes_used": 0.0,
            },
        )
        messages_used = int(raw["messages_used"])
        investigations_used = int(raw["investigations_used"])
        live_used = float(raw["live_minutes_used"])
        return QuotaSnapshot(
            period_date=str(raw["period"]),
            messages_used=messages_used,
            messages_limit=self.messages_limit,
            messages_remaining=max(0, self.messages_limit - messages_used),
            live_minutes_used=live_used,
            live_minutes_limit=self.live_minutes_limit,
            live_minutes_remaining=max(0.0, self.live_minutes_limit - live_used),
            investigations_used=investigations_used,
            investigations_limit=self.investigations_limit,
            investigations_remaining=max(
                0, self.investigations_limit - investigations_used
            ),
        )

    def consume_message(self, user_id: str) -> QuotaSnapshot:
        quota = self.get_quota(user_id)
        if quota.messages_remaining <= 0:
            raise QuotaExceededError("messages", 0)
        self._quotas[user_id]["messages_used"] = quota.messages_used + 1
        return self.get_quota(user_id)

    def consume_investigation(self, user_id: str) -> QuotaSnapshot:
        quota = self.get_quota(user_id)
        if quota.investigations_remaining <= 0:
            raise QuotaExceededError("investigations", 0)
        self._quotas[user_id]["investigations_used"] = (
            quota.investigations_used + 1
        )
        return self.get_quota(user_id)

    def consume_live_minutes(
        self, user_id: str, minutes: float
    ) -> QuotaSnapshot:
        if minutes <= 0:
            return self.get_quota(user_id)
        quota = self.get_quota(user_id)
        if quota.live_minutes_remaining < minutes:
            raise QuotaExceededError("live_minutes", quota.live_minutes_remaining)
        self._quotas[user_id]["live_minutes_used"] = (
            quota.live_minutes_used + minutes
        )
        return self.get_quota(user_id)
