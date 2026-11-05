"""Production secrets / CORS hardening."""

from __future__ import annotations

import pytest

from bintu.config.settings import (
    cors_origins,
    trusted_proxies,
    validate_production_settings,
)


def test_cors_fail_closed_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BINTU_ENV", "production")
    monkeypatch.delenv("BINTU_CORS_ORIGINS", raising=False)
    assert cors_origins() == []


def test_cors_explicit_origins(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BINTU_ENV", "production")
    monkeypatch.setenv(
        "BINTU_CORS_ORIGINS",
        "https://app.bintu.example, https://vite.local",
    )
    assert cors_origins() == [
        "https://app.bintu.example",
        "https://vite.local",
    ]


def test_trusted_proxies_empty_by_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("BINTU_TRUSTED_PROXIES", raising=False)
    assert trusted_proxies() == []


def test_validate_production_requires_google_and_cors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BINTU_ENV", "production")
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("BINTU_CORS_ORIGINS", raising=False)
    monkeypatch.setenv("MYSQL_ALLOW_EMPTY_PASSWORD", "true")
    with pytest.raises(RuntimeError) as exc:
        validate_production_settings()
    message = str(exc.value)
    assert "GOOGLE_CLIENT_ID" in message
    assert "BINTU_CORS_ORIGINS" in message
    assert "sk_" not in message
    assert "password" not in message.lower() or "MYSQL_PASSWORD" in message


def test_validate_production_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BINTU_ENV", "production")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "client.apps.googleusercontent.com")
    monkeypatch.setenv("BINTU_CORS_ORIGINS", "https://app.example")
    monkeypatch.setenv("MYSQL_PASSWORD", "not-a-secret-for-tests")
    validate_production_settings()


def test_validate_skipped_outside_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BINTU_ENV", "development")
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    validate_production_settings()
