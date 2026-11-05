"""Bearer session authenticator backed by MySQL auth_sessions."""

from __future__ import annotations

from fastapi import Request

from bintu.auth.authorization import (
    AuthenticatedContext,
    AuthenticationError,
    resolve_permissions,
)
from bintu.persistence.user_store import UserStore


class SessionRequestAuthenticator:
    """Reads `Authorization: Bearer <token>` and resolves a BINTU session."""

    def __init__(self, users: UserStore) -> None:
        self._users = users

    def authenticate(self, request: Request) -> AuthenticatedContext:
        token = _bearer_token(request)
        if not token:
            raise AuthenticationError("missing-bearer")
        resolved = self._users.resolve_token(token)
        if resolved is None:
            raise AuthenticationError("session-invalid")
        user, _quota = resolved
        role = "member"
        return AuthenticatedContext(
            user_id=user.id,
            organization_id=user.organization_id,
            role=role,
            permissions=resolve_permissions(role, None),
        )

    def authenticate_token(self, token: str) -> AuthenticatedContext:
        resolved = self._users.resolve_token(token)
        if resolved is None:
            raise AuthenticationError("session-invalid")
        user, _quota = resolved
        role = "member"
        return AuthenticatedContext(
            user_id=user.id,
            organization_id=user.organization_id,
            role=role,
            permissions=resolve_permissions(role, None),
        )


class HybridRequestAuthenticator:
    """Prefer Bearer sessions when present; else fall back to local atelier."""

    def __init__(
        self,
        sessions: SessionRequestAuthenticator,
        *,
        require_session: bool,
        local_fallback,
    ) -> None:
        self._sessions = sessions
        self._require_session = require_session
        self._local = local_fallback

    def authenticate(self, request: Request) -> AuthenticatedContext:
        token = _bearer_token(request)
        if token:
            return self._sessions.authenticate(request)
        if self._require_session:
            raise AuthenticationError("missing-bearer")
        return self._local.authenticate(request)


def _bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization") or request.headers.get(
        "Authorization"
    )
    if not header:
        return None
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token or None
