"""Authenticated contexts for tests. No Clerk secret and no network."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI

from bintu_agent_core.sqlite_store import SQLiteInvestigationStore
from bintu_backend.app import create_app
from bintu_backend.authentication import FixedAuthenticator
from bintu_backend.authorization import (
    ROLE_PERMISSIONS,
    AuthenticatedContext,
)


TEST_ORGANIZATION_ID = "org_test_alpha"
OTHER_ORGANIZATION_ID = "org_test_beta"
TEST_USER_ID = "user_test_technician"


def context_for(
    role: str,
    *,
    organization_id: str | None = TEST_ORGANIZATION_ID,
    user_id: str | None = None,
    permissions: frozenset[str] | None = None,
) -> AuthenticatedContext:
    return AuthenticatedContext(
        user_id=user_id or f"user_test_{role}",
        organization_id=organization_id,
        role=role,
        permissions=permissions
        if permissions is not None
        else ROLE_PERMISSIONS[role],
    )


def member_authenticator() -> FixedAuthenticator:
    return FixedAuthenticator(
        context_for("member", user_id=TEST_USER_ID)
    )


def authenticated_app(**kwargs: Any) -> FastAPI:
    kwargs.setdefault("authenticator", member_authenticator())
    return create_app(**kwargs)


def bind_investigation(database: Path, investigation_id: str) -> None:
    SQLiteInvestigationStore(database).bind_owner(
        investigation_id, TEST_ORGANIZATION_ID, TEST_USER_ID
    )
