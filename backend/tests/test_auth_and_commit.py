"""Google auth (mocked token) + message commit true/false + health."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from bintu.api.app import create_app
from bintu.auth.google import GoogleIdentity
from bintu.core.models import (
    AgentDecision,
    AskTechnicianArguments,
    HypothesisId,
    InvestigationState,
    ToolName,
)
from bintu.core.models import EquipmentDossier
from tests.fakes import MemoryInvestigationStore, MemoryUserStore


class AskingProvider:
    def decide_next(self, state: InvestigationState) -> AgentDecision:
        question = "Quel état est affiché ?"
        if state.observations:
            question = "Depuis quand cette observation est-elle constatée ?"
        return AgentDecision(
            tool_name=ToolName.ASK_TECHNICIAN,
            arguments=AskTechnicianArguments(
                question=question,
                distinguishes=[HypothesisId.H0, HypothesisId.H2],
            ),
            reason="Obtenir une observation.",
        )


@pytest.fixture
def users() -> MemoryUserStore:
    return MemoryUserStore()


@pytest.fixture
def store() -> MemoryInvestigationStore:
    return MemoryInvestigationStore()


@pytest.fixture(autouse=True)
def _no_network_research(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "bintu.api.app.research_equipment",
        lambda problem: EquipmentDossier(
            query=problem, lookup_status="unavailable"
        ),
    )


def _app(
    monkeypatch: pytest.MonkeyPatch,
    *,
    store: MemoryInvestigationStore,
    users: MemoryUserStore,
    google: bool = True,
) -> TestClient:
    if google:
        monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com")
        monkeypatch.setenv("BINTU_REQUIRE_AUTH", "1")
    else:
        monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
        monkeypatch.setenv("BINTU_REQUIRE_AUTH", "0")
    app = create_app(
        store=store,
        provider_factory=AskingProvider,
        user_store=users,
    )
    return TestClient(app)


def test_health_public(
    monkeypatch: pytest.MonkeyPatch,
    store: MemoryInvestigationStore,
    users: MemoryUserStore,
) -> None:
    client = _app(monkeypatch, store=store, users=users, google=False)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_auth_config_exposes_google_client(
    monkeypatch: pytest.MonkeyPatch,
    store: MemoryInvestigationStore,
    users: MemoryUserStore,
) -> None:
    client = _app(monkeypatch, store=store, users=users, google=True)
    response = client.get("/api/auth/config")
    assert response.status_code == 200
    body = response.json()
    assert body["auth_required"] is True
    assert body["google_enabled"] is True
    assert body["google_client_id"] == "test-client.apps.googleusercontent.com"


def test_google_login_me_logout(
    monkeypatch: pytest.MonkeyPatch,
    store: MemoryInvestigationStore,
    users: MemoryUserStore,
) -> None:
    monkeypatch.setattr(
        "bintu.api.app.verify_google_id_token",
        lambda _token: GoogleIdentity(
            sub="google-sub-1",
            email="tech@bintu.test",
            name="Tech Bintu",
            picture=None,
            email_verified=True,
        ),
    )
    client = _app(monkeypatch, store=store, users=users, google=True)

    denied = client.get("/api/investigations")
    assert denied.status_code == 401

    login = client.post(
        "/api/auth/google",
        json={"id_token": "x" * 40},
    )
    assert login.status_code == 200
    session = login.json()
    token = session["access_token"]
    assert session["user"]["email"] == "tech@bintu.test"
    assert "apps.googleusercontent" not in str(session)

    me = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me.status_code == 200
    assert me.json()["user"]["email"] == "tech@bintu.test"

    listed = client.get(
        "/api/investigations",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert listed.status_code == 200

    logout = client.post(
        "/api/auth/logout",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert logout.status_code == 204
    after = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert after.status_code == 401


def test_message_commit_true_advances_graph(
    monkeypatch: pytest.MonkeyPatch,
    store: MemoryInvestigationStore,
    users: MemoryUserStore,
) -> None:
    monkeypatch.setattr(
        "bintu.api.app.verify_google_id_token",
        lambda _token: GoogleIdentity(
            sub="google-sub-2",
            email="ops@bintu.test",
            name="Ops",
            picture=None,
            email_verified=True,
        ),
    )
    client = _app(monkeypatch, store=store, users=users, google=True)
    token = client.post(
        "/api/auth/google", json={"id_token": "y" * 40}
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    created = client.post(
        "/api/investigations",
        headers=headers,
        json={"problem": "Production solaire anormalement faible."},
    )
    assert created.status_code == 201
    body = created.json()
    investigation_id = body["investigation_id"]
    assert body["status"] == "waiting_for_technician"
    revision_before = body.get("state_revision") or body.get("revision")

    wait = client.post(
        f"/api/investigations/{investigation_id}/message",
        headers=headers,
        json={"message": "note de contexte", "commit": False},
    )
    assert wait.status_code == 200
    wait_body = wait.json()
    assert wait_body["status"] == "waiting_for_technician"

    observations_before = len(
        store.get_in_organization(
            investigation_id,
            client.get("/api/auth/me", headers=headers).json()["user"][
                "organization_id"
            ],
        ).observations
    )

    committed = client.post(
        f"/api/investigations/{investigation_id}/message",
        headers=headers,
        json={"message": "Aucun défaut affiché.", "commit": True},
    )
    assert committed.status_code == 200
    committed_body = committed.json()
    # Après commit + advance, le provider re-pose une question → waiting.
    assert committed_body["status"] == "waiting_for_technician"
    org_id = client.get("/api/auth/me", headers=headers).json()["user"][
        "organization_id"
    ]
    state = store.get_in_organization(investigation_id, org_id)
    assert len(state.observations) > observations_before
    assert wait_body["status"] == "waiting_for_technician"
    del revision_before
