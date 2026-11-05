"""Verify a Clerk session token. The diagnostic core never imports this module."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any, Protocol

from fastapi import Request

from bintu.auth.authorization import (
    AuthenticatedContext,
    AuthenticationError,
    bintu_role,
    resolve_permissions,
)
from bintu.config.settings import authorized_parties

logger = logging.getLogger("bintu.authentication")


class RequestAuthenticator(Protocol):
    def authenticate(self, request: Request) -> AuthenticatedContext: ...


LOCAL_USER_ID = "user_local"
LOCAL_ORGANIZATION_ID = "org_local"


class LocalRequestAuthenticator:
    """Atelier unique, sans jeton. Les diagnostics restent isolés par organization_id."""

    def authenticate(self, request: Request) -> AuthenticatedContext:
        del request
        role = "member"
        return AuthenticatedContext(
            user_id=LOCAL_USER_ID,
            organization_id=LOCAL_ORGANIZATION_ID,
            role=role,
            permissions=resolve_permissions(role, None),
        )


class TokenVerifier(Protocol):
    def __call__(
        self,
        request: Request,
        *,
        secret_key: str,
        authorized_parties: list[str],
    ) -> Any: ...


def context_from_payload(payload: dict[str, Any]) -> AuthenticatedContext:
    user_id = payload.get("sub")
    if not isinstance(user_id, str) or not user_id.strip():
        raise AuthenticationError("missing-subject")

    organization_id = payload.get("org_id")
    role_claim = payload.get("org_role")
    raw_permissions = payload.get("org_permissions")
    organization = payload.get("o")
    if isinstance(organization, dict):
        if not isinstance(organization_id, str) or not organization_id.strip():
            organization_id = organization.get("id")
        if not isinstance(role_claim, str) or not role_claim.strip():
            role_claim = organization.get("rol")

    if payload.get("sts") == "pending":
        organization_id = None
        role_claim = None
        raw_permissions = None

    organization_value = (
        organization_id.strip()
        if isinstance(organization_id, str) and organization_id.strip()
        else None
    )
    role = bintu_role(role_claim)
    return AuthenticatedContext(
        user_id=user_id.strip(),
        organization_id=organization_value,
        role=role,
        permissions=resolve_permissions(role, raw_permissions),
    )


def _reason_code(reason: object) -> str:
    name = getattr(reason, "name", None)
    if isinstance(name, str) and name:
        return name
    return "signed-out"


def clerk_verify(
    request: Request,
    *,
    secret_key: str,
    authorized_parties: list[str],
) -> Any:
    from clerk_backend_api import Clerk
    from clerk_backend_api.security.types import AuthenticateRequestOptions

    sdk = Clerk(bearer_auth=secret_key or None)
    try:
        return sdk.authenticate_request(
            request,
            AuthenticateRequestOptions(
                secret_key=secret_key or None,
                authorized_parties=list(authorized_parties),
                accepts_token=["session_token"],
            ),
        )
    finally:
        sdk.__exit__(None, None, None)


class ClerkRequestAuthenticator:
    """Official Clerk `authenticate_request` for SDK 7.0.0. Session tokens only."""

    def __init__(
        self,
        secret_key: str,
        parties: list[str],
        *,
        verify: TokenVerifier = clerk_verify,
    ) -> None:
        self._secret_key = secret_key
        self._parties = list(parties)
        self._verify = verify

    @classmethod
    def from_environment(cls) -> ClerkRequestAuthenticator:
        import os

        return cls(
            secret_key=os.environ.get("CLERK_SECRET_KEY", ""),
            parties=authorized_parties(),
        )

    def authenticate(self, request: Request) -> AuthenticatedContext:
        if not self._parties:
            raise AuthenticationError("authorized-parties-missing")
        try:
            state = self._verify(
                request,
                secret_key=self._secret_key,
                authorized_parties=self._parties,
            )
        except AuthenticationError:
            raise
        except Exception as exc:
            logger.warning(
                "session verification failed: %s", type(exc).__name__
            )
            raise AuthenticationError("verification-failed") from None
        if not getattr(state, "is_signed_in", False) or not isinstance(
            getattr(state, "payload", None), dict
        ):
            code = _reason_code(getattr(state, "reason", None))
            logger.info("session rejected: %s", code)
            raise AuthenticationError(code)
        return context_from_payload(state.payload)
