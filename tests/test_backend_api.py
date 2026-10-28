from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from bintu_agent_core.errors import ProviderHTTPError
from bintu_agent_core.models import (
    AgentDecision,
    AskTechnicianArguments,
    HypothesisId,
    InvestigationState,
    RequestMeasurementArguments,
    ToolName,
)
from bintu_agent_core.sqlite_store import SQLiteInvestigationStore
from bintu_backend.app import create_app


class AskingProvider:
    def decide_next(self, state: InvestigationState) -> AgentDecision:
        del state
        return AgentDecision(
            tool_name=ToolName.ASK_TECHNICIAN,
            arguments=AskTechnicianArguments(
                question="Quel état est affiché par l'onduleur ?",
                distinguishes=[HypothesisId.H0, HypothesisId.H2],
            ),
            reason="Obtenir une observation du technicien.",
        )


class FailingProvider:
    def __init__(self, detail: str = "simulated provider failure") -> None:
        self.detail = detail

    def decide_next(self, state: InvestigationState) -> AgentDecision:
        del state
        raise ProviderHTTPError(self.detail)


class MeasurementThenQuestionProvider:
    def __init__(self) -> None:
        self.calls = 0

    def decide_next(self, state: InvestigationState) -> AgentDecision:
        del state
        self.calls += 1
        if self.calls == 1:
            return AgentDecision(
                tool_name=ToolName.REQUEST_MEASUREMENT,
                arguments=RequestMeasurementArguments(
                    measurement_type="dc_voltage",
                    location="bornes de la batterie",
                    unit="V",
                    distinguishes=[HypothesisId.H2, HypothesisId.H3],
                ),
                reason="Vérifier la tension réellement disponible.",
            )
        return AskingProvider().decide_next(
            InvestigationState(investigation_id="provider-context")
        )


@pytest.fixture
def api(tmp_path: Path) -> tuple[TestClient, Path]:
    database = tmp_path / "api.sqlite3"
    app = create_app(
        database_path=database,
        provider_factory=AskingProvider,
    )
    return TestClient(app), database


def create_investigation(client: TestClient) -> dict:
    response = client.post(
        "/api/investigations",
        json={"problem": "Production solaire anormalement faible."},
    )
    assert response.status_code == 201
    return response.json()


def test_health_works(api: tuple[TestClient, Path]) -> None:
    client, _ = api

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_local_frontend_cors_is_allowed(api: tuple[TestClient, Path]) -> None:
    client, _ = api

    response = client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == (
        "http://localhost:5173"
    )


def test_create_investigation_returns_initial_action(
    api: tuple[TestClient, Path],
) -> None:
    client, _ = api

    body = create_investigation(client)

    assert body["investigation_id"]
    assert body["status"] == "waiting_for_technician"
    assert body["state"]["problem"]["description"] == (
        "Production solaire anormalement faible."
    )
    assert body["state"]["pending_action"]["tool_name"] == "ask_technician"
    assert all(
        value is None for value in body["state"]["installation"].values()
    )


def test_get_existing_investigation(api: tuple[TestClient, Path]) -> None:
    client, _ = api
    created = create_investigation(client)

    response = client.get(
        f"/api/investigations/{created['investigation_id']}"
    )

    assert response.status_code == 200
    assert response.json() == created


def test_get_missing_investigation_returns_404(
    api: tuple[TestClient, Path],
) -> None:
    client, _ = api

    response = client.get("/api/investigations/missing")

    assert response.status_code == 404
    assert response.json() == {"detail": "Investigation not found"}


def test_message_updates_existing_investigation(
    api: tuple[TestClient, Path],
) -> None:
    client, _ = api
    created = create_investigation(client)

    response = client.post(
        f"/api/investigations/{created['investigation_id']}/message",
        json={"message": "Aucun code défaut n'est affiché."},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "waiting_for_technician"
    assert body["state"]["observations"][0]["statement"] == (
        "Aucun code défaut n'est affiché."
    )
    assert body["state"]["pending_action"]["tool_name"] == "ask_technician"


def test_message_for_missing_investigation_returns_404(
    api: tuple[TestClient, Path],
) -> None:
    client, _ = api

    response = client.post(
        "/api/investigations/missing/message",
        json={"message": "Réponse."},
    )

    assert response.status_code == 404


def test_message_result_is_persisted(
    api: tuple[TestClient, Path],
) -> None:
    client, database = api
    created = create_investigation(client)
    investigation_id = created["investigation_id"]
    client.post(
        f"/api/investigations/{investigation_id}/message",
        json={"message": "Onduleur allumé sans alarme."},
    )

    state = SQLiteInvestigationStore(database).get_investigation(
        investigation_id
    )

    assert len(state.observations) == 1
    assert next(iter(state.observations.values())).statement == (
        "Onduleur allumé sans alarme."
    )
    assert len(state.evidence) == 1


def test_numeric_message_records_requested_measurement(tmp_path: Path) -> None:
    database = tmp_path / "api.sqlite3"
    provider = MeasurementThenQuestionProvider()
    client = TestClient(
        create_app(
            database_path=database,
            provider_factory=lambda: provider,
        )
    )
    created = create_investigation(client)

    response = client.post(
        f"/api/investigations/{created['investigation_id']}/message",
        json={"message": "12,7"},
    )

    assert response.status_code == 200
    measurements = response.json()["state"]["measurements"]
    assert measurements[0]["value"] == 12.7
    assert measurements[0]["unit"] == "V"


def test_investigations_are_isolated(api: tuple[TestClient, Path]) -> None:
    client, _ = api
    first = create_investigation(client)
    second = create_investigation(client)
    client.post(
        f"/api/investigations/{first['investigation_id']}/message",
        json={"message": "Observation propre à la première."},
    )

    first_state = client.get(
        f"/api/investigations/{first['investigation_id']}"
    ).json()
    second_state = client.get(
        f"/api/investigations/{second['investigation_id']}"
    ).json()

    assert len(first_state["state"]["observations"]) == 1
    assert second_state["state"]["observations"] == []


def test_provider_error_returns_clean_502(tmp_path: Path) -> None:
    database = tmp_path / "api.sqlite3"
    app = create_app(
        database_path=database,
        provider_factory=FailingProvider,
    )
    client = TestClient(app)

    response = client.post(
        "/api/investigations", json={"problem": "Test provider."}
    )

    assert response.status_code == 502
    assert response.json() == {"detail": "AI provider unavailable"}
    assert SQLiteInvestigationStore(database).list_investigations() == []


def test_api_key_is_never_exposed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    secret = "secret-value-that-must-not-leak"
    monkeypatch.setenv("MODEL_API_KEY", secret)
    app = create_app(
        database_path=tmp_path / "api.sqlite3",
        provider_factory=lambda: FailingProvider(f"failure with {secret}"),
    )
    client = TestClient(app)

    response = client.post(
        "/api/investigations", json={"problem": "Test secret."}
    )

    assert response.status_code == 502
    assert secret not in response.text
