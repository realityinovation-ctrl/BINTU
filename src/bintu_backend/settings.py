"""Environment boundaries for Clerk. No secret is logged or defaulted."""

from __future__ import annotations

import os

DEVELOPMENT_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)


def is_production() -> bool:
    return os.environ.get("BINTU_ENV", "development").strip().lower() == "production"


def _csv(name: str) -> list[str]:
    return [
        item.strip()
        for item in os.environ.get(name, "").split(",")
        if item.strip()
    ]


def cors_origins() -> list[str]:
    configured = _csv("BINTU_CORS_ORIGINS")
    if configured:
        return configured
    if is_production():
        return []
    return list(DEVELOPMENT_ORIGINS)


def authorized_parties() -> list[str]:
    configured = _csv("CLERK_AUTHORIZED_PARTIES")
    if configured:
        return configured
    if is_production():
        return []
    return list(DEVELOPMENT_ORIGINS)
