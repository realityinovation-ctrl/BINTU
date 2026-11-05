"""Verify Google ID tokens issued via Google Cloud Console (OAuth client)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import httpx

from bintu.auth.authorization import AuthenticationError
from bintu.core.errors import ProviderHTTPError, ProviderTimeoutError

GOOGLE_TOKENINFO = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_ALLOWED_ISSUERS = {
    "accounts.google.com",
    "https://accounts.google.com",
}


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str
    name: str | None
    picture: str | None
    email_verified: bool


def google_client_id() -> str:
    return (
        os.environ.get("GOOGLE_CLIENT_ID", "").strip()
        or os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "").strip()
    )


def google_auth_enabled() -> bool:
    return bool(google_client_id())


def verify_google_id_token(
    id_token: str, *, timeout: float = 12.0
) -> GoogleIdentity:
    client_id = google_client_id()
    if not client_id:
        raise AuthenticationError("google-not-configured")
    token = id_token.strip()
    if len(token) < 40:
        raise AuthenticationError("invalid-google-token")

    try:
        response = httpx.get(
            GOOGLE_TOKENINFO,
            params={"id_token": token},
            timeout=timeout,
        )
    except httpx.TimeoutException as exc:
        raise ProviderTimeoutError("Google token verification timed out") from exc
    except httpx.RequestError as exc:
        raise ProviderHTTPError("Google token verification failed") from exc

    if response.status_code == 400:
        raise AuthenticationError("invalid-google-token")
    if response.is_error:
        raise ProviderHTTPError(
            f"Google tokeninfo returned HTTP {response.status_code}"
        )

    try:
        payload: dict[str, Any] = response.json()
    except ValueError as exc:
        raise AuthenticationError("invalid-google-token") from exc

    aud = str(payload.get("aud") or "")
    if aud != client_id:
        raise AuthenticationError("google-audience-mismatch")

    iss = str(payload.get("iss") or "")
    if iss not in GOOGLE_ALLOWED_ISSUERS:
        raise AuthenticationError("google-issuer-invalid")

    email = str(payload.get("email") or "").strip().lower()
    sub = str(payload.get("sub") or "").strip()
    if not email or not sub:
        raise AuthenticationError("google-identity-incomplete")

    verified = str(payload.get("email_verified") or "").lower() in {
        "true",
        "1",
    }
    if not verified:
        raise AuthenticationError("google-email-unverified")

    name = payload.get("name")
    picture = payload.get("picture")
    return GoogleIdentity(
        sub=sub,
        email=email,
        name=str(name).strip() if isinstance(name, str) and name.strip() else None,
        picture=(
            str(picture).strip()
            if isinstance(picture, str) and picture.strip()
            else None
        ),
        email_verified=True,
    )
