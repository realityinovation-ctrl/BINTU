import pytest


@pytest.fixture(autouse=True)
def isolate_clerk_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BINTU_ENV", "development")
    monkeypatch.delenv("CLERK_SECRET_KEY", raising=False)
    monkeypatch.delenv("CLERK_AUTHORIZED_PARTIES", raising=False)
    monkeypatch.delenv("BINTU_CORS_ORIGINS", raising=False)
    monkeypatch.delenv("BINTU_DEMO_ORGANIZATION_ID", raising=False)
    monkeypatch.delenv("BINTU_MIGRATION_USER_ID", raising=False)
