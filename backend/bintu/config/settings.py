"""Environment boundaries for Clerk. No secret is logged or defaulted."""

from __future__ import annotations

import os

DEVELOPMENT_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:19006",
    "http://127.0.0.1:19006",
    "http://172.20.10.2:8081"
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


def mysql_settings() -> dict[str, str | int]:
    """XAMPP defaults: root on 127.0.0.1:3306, database bintu, empty password."""

    raw_port = os.environ.get("MYSQL_PORT", "3306").strip() or "3306"
    try:
        port = int(raw_port)
    except ValueError as exc:
        raise RuntimeError("MYSQL_PORT must be an integer") from exc
    return {
        "host": os.environ.get("MYSQL_HOST", "127.0.0.1").strip() or "127.0.0.1",
        "port": port,
        "user": os.environ.get("MYSQL_USER", "root").strip() or "root",
        "password": os.environ.get("MYSQL_PASSWORD", ""),
        "database": os.environ.get("MYSQL_DATABASE", "bintu").strip() or "bintu",
    }


def authorized_parties() -> list[str]:
    configured = _csv("CLERK_AUTHORIZED_PARTIES")
    if configured:
        return configured
    if is_production():
        return []
    return list(DEVELOPMENT_ORIGINS)


def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return max(0, int(raw))
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer") from exc


def _float_env(name: str, default: float) -> float:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return max(0.0, float(raw))
    except ValueError as exc:
        raise RuntimeError(f"{name} must be a number") from exc


def session_ttl_hours() -> int:
    """Durée d'une session Bearer (style ChatGPT free au démarrage)."""

    return _int_env("BINTU_SESSION_TTL_HOURS", 12)


def free_messages_limit() -> int:
    return _int_env("BINTU_FREE_MESSAGES_PER_DAY", 40)


def free_live_minutes_limit() -> float:
    return _float_env("BINTU_FREE_LIVE_MINUTES_PER_DAY", 15.0)


def free_investigations_limit() -> int:
    return _int_env("BINTU_FREE_INVESTIGATIONS_PER_DAY", 5)


def require_google_auth() -> bool:
    """Si GOOGLE_CLIENT_ID est défini, les routes métier exigent une session."""

    forced = os.environ.get("BINTU_REQUIRE_AUTH", "").strip().lower()
    if forced in {"1", "true", "yes"}:
        return True
    if forced in {"0", "false", "no"}:
        return False
    from bintu.auth.google import google_auth_enabled

    return google_auth_enabled()
