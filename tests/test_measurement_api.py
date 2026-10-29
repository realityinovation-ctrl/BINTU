import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from bintu_agent_core.measurement_catalog import MEASUREMENT_CATALOG
from bintu_agent_core.meta_provider import MetaAIProvider
from bintu_agent_core.models import (
    AgentDecision,
    AskTechnicianArguments,
    HypothesisId,
    InvestigationState,
    InvestigationStatus,
    RequestMeasurementArguments,
    ToolName,
)
from bintu_agent_core.sqlite_store import SQLiteInvestigationStore
from bintu_backend.app import create_app


CATALOG_CASES = [
    ("dc_voltage", "Tension DC", "V", 38.4),
    ("dc_current", "Courant DC", "A", 8.2),
    ("ac_voltage", "Tension AC", "V", 230.0),
    ("ac_current", "Courant AC", "A", 3.6),
    ("ac_power", "Puissance AC", "W", 842.5),
]


def ask_decision() -> AgentDecision:
    return AgentDecision(
        tool_name=ToolName.ASK_TECHNICIAN,
        arguments=AskTechnicianArguments(
            question="La valeur affichée est-elle stable ?",
            distinguishes=[HypothesisId.H1, HypothesisId.H2],
        ),
        reason="Poursuivre après la mesure.",
    )


def measurement_decision(
    measurement_type: str, unit: str, location: str = "sortie panneaux"
) -> AgentDecision:
    return AgentDecision(
        tool_name=ToolName.REQUEST_MEASUREMENT,
        arguments=RequestMeasurementArguments(
            measurement_type=measurement_type,
            location=location,
            unit=unit,
            distinguishes=[HypothesisId.H1, HypothesisId.H2],
        ),
        reason="Obtenir une mesure réelle du technicien.",
    )


class SequencedProvider:
    def __init__(self, decisions: list[AgentDecision]) -> None:
        self.decisions = decisions
        self.seen_states: list[InvestigationState] = []

    def decide_next(self, state: InvestigationState) -> AgentDecision:
        self.seen_states.append(state.model_copy(deep=True))
        return self.decisions.pop(0)


def measurement_app(
    tmp_path: Path,
    measurement_type: str = "dc_voltage",
    unit: str = "V",
) -> tuple[TestClient, Path, SequencedProvider]:
    provider = SequencedProvider(
        [measurement_decision(measurement_type, unit), ask_decision()]
    )
    database = tmp_path / "measurements.sqlite3"
    client = TestClient(
        create_app(
            database_path=database,
            provider_factory=lambda: provider,
        )
    )
    return client, database, provider


def create_waiting_measurement(client: TestClient) -> str:
    response = client.post(
        "/api/investigations",
        json={"problem": "Production photovoltaïque faible."},
    )
    assert response.status_code == 201
    return response.json()["investigation_id"]


def measurement_payload(
    measurement_type: str = "dc_voltage",
    value: float = 38.4,
    unit: str = "V",
    location: str = "sortie panneaux",
) -> dict[str, object]:
    return {
        "measurement_type": measurement_type,
        "value": value,
        "unit": unit,
        "location": location,
    }


def post_measurement(
    client: TestClient,
    investigation_id: str,
    payload: dict[str, object] | None = None,
    raw: str | None = None,
):
    if raw is not None:
        return client.post(
            f"/api/investigations/{investigation_id}/measurement",
            content=raw,
            headers={"Content-Type": "application/json"},
        )
    return client.post(
        f"/api/investigations/{investigation_id}/measurement",
        json=payload or measurement_payload(),
    )


def test_catalog_is_closed_and_exposed_by_backend(tmp_path: Path) -> None:
    client, _, _ = measurement_app(tmp_path)
    investigation_id = create_waiting_measurement(client)

    catalog = client.get(f"/api/investigations/{investigation_id}").json()[
        "state"
    ]["measurement_catalog"]

    assert catalog == [
        {
            "measurement_type": spec.measurement_type,
            "label": spec.label,
            "unit": spec.unit,
        }
        for spec in MEASUREMENT_CATALOG.values()
    ]
    assert [item["measurement_type"] for item in catalog] == [
        "dc_voltage",
        "dc_current",
        "ac_voltage",
        "ac_current",
        "ac_power",
    ]


@pytest.mark.parametrize(
    ("measurement_type", "label", "unit", "value"),
    CATALOG_CASES,
)
def test_each_catalog_measurement_is_validated_and_persisted(
    tmp_path: Path,
    measurement_type: str,
    label: str,
    unit: str,
    value: float,
) -> None:
    del label
    client, database, provider = measurement_app(
        tmp_path, measurement_type, unit
    )
    investigation_id = create_waiting_measurement(client)

    response = post_measurement(
        client,
        investigation_id,
        measurement_payload(measurement_type, value, unit),
    )
    reloaded = client.get(f"/api/investigations/{investigation_id}")
    stored = SQLiteInvestigationStore(database).get_investigation(
        investigation_id
    )

    assert response.status_code == 200
    assert response.json() == reloaded.json()
    measurement = response.json()["state"]["measurements"][0]
    assert measurement["measurement_type"] == measurement_type
    assert measurement["value"] == value
    assert measurement["unit"] == unit
    assert measurement["location"] == "sortie panneaux"
    assert measurement["source_type"] == "measurement"
    stored_measurement = next(iter(stored.measurements.values()))
    assert stored_measurement.model_dump(mode="json") == {
        key: value
        for key, value in measurement.items()
        if key != "source_type"
    }
    evidence = next(iter(stored.evidence.values()))
    observation = next(iter(stored.observations.values()))
    assert evidence.source_type.value == "measurement"
    assert observation.source_type.value == "measurement"
    assert observation.id == evidence.observation_id
    assert observation.value == value
    assert observation.unit == unit
    assert stored_measurement.source_id == "action-1"
    seen_measurement = next(iter(provider.seen_states[1].measurements.values()))
    assert seen_measurement.value == value
    assert seen_measurement.measurement_type == measurement_type


def test_measurement_updates_timeline_without_hypothesis_or_image(
    tmp_path: Path,
) -> None:
    client, database, _ = measurement_app(tmp_path)
    investigation_id = create_waiting_measurement(client)

    response = post_measurement(client, investigation_id)
    state = SQLiteInvestigationStore(database).get_investigation(
        investigation_id
    )

    assert response.status_code == 200
    event_types = [event.event_type.value for event in state.timeline]
    assert "observation_added" in event_types
    assert "evidence_added" in event_types
    assert all(
        hypothesis.status.value == "unexplored"
        for hypothesis in state.hypotheses.values()
    )
    assert all(verification.impacts == [] for verification in state.verifications.values())
    assert {
        observation.source_type.value for observation in state.observations.values()
    } == {"measurement"}
    assert list(database.parent.glob("*.png")) == []
    assert list(database.parent.glob("*.jpg")) == []
    assert state.conclusion is None


def test_unknown_measurement_type_is_rejected(tmp_path: Path) -> None:
    client, database, _ = measurement_app(tmp_path)
    investigation_id = create_waiting_measurement(client)
    before = client.get(f"/api/investigations/{investigation_id}").json()

    response = post_measurement(
        client,
        investigation_id,
        measurement_payload("voltage", 38.4, "V"),
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Unknown measurement type"
    assert client.get(f"/api/investigations/{investigation_id}").json() == before
    assert SQLiteInvestigationStore(database).get_investigation(
        investigation_id
    ).measurements == {}


def test_incorrect_unit_is_rejected(tmp_path: Path) -> None:
    client, _, _ = measurement_app(tmp_path)
    investigation_id = create_waiting_measurement(client)
    before = client.get(f"/api/investigations/{investigation_id}").json()

    response = post_measurement(
        client,
        investigation_id,
        measurement_payload(unit="mV"),
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Unit does not match measurement type"
    assert client.get(f"/api/investigations/{investigation_id}").json() == before


@pytest.mark.parametrize(
    "raw",
    [
        '{"measurement_type":"dc_voltage","value":"abc","unit":"V","location":"sortie panneaux"}',
        '{"measurement_type":"dc_voltage","value":NaN,"unit":"V","location":"sortie panneaux"}',
        '{"measurement_type":"dc_voltage","value":Infinity,"unit":"V","location":"sortie panneaux"}',
        '{"measurement_type":"dc_voltage","value":38.4,"unit":"V","location":" "}',
    ],
)
def test_invalid_measurement_values_are_rejected(
    tmp_path: Path, raw: str
) -> None:
    client, _, _ = measurement_app(tmp_path)
    investigation_id = create_waiting_measurement(client)
    before = client.get(f"/api/investigations/{investigation_id}").json()

    response = post_measurement(client, investigation_id, raw=raw)

    assert response.status_code == 422
    if '"value":' in raw and '"location":" "' not in raw:
        assert response.json() == {
            "detail": "A finite numeric measurement is required"
        }
    assert client.get(f"/api/investigations/{investigation_id}").json() == before


def test_missing_investigation_is_404(tmp_path: Path) -> None:
    client, _, _ = measurement_app(tmp_path)

    response = post_measurement(client, "missing")

    assert response.status_code == 404
    assert response.json() == {"detail": "Investigation not found"}


@pytest.mark.parametrize(
    "status",
    [
        InvestigationStatus.COMPLETED,
        InvestigationStatus.INSUFFICIENT_INFORMATION,
    ],
)
def test_finished_investigation_rejects_measurement(
    tmp_path: Path, status: InvestigationStatus
) -> None:
    client, database, _ = measurement_app(tmp_path)
    investigation_id = create_waiting_measurement(client)
    store = SQLiteInvestigationStore(database)
    state = store.get_investigation(investigation_id)
    state.status = status
    state.pending_action = None
    state.conclusion = None
    store.save_investigation(state)

    response = post_measurement(client, investigation_id)

    assert response.status_code == 409
    assert store.get_investigation(investigation_id).measurements == {}


def test_existing_measurement_cannot_be_replaced(tmp_path: Path) -> None:
    client, database, _ = measurement_app(tmp_path)
    investigation_id = create_waiting_measurement(client)
    created = post_measurement(client, investigation_id)
    assert created.status_code == 200

    response = post_measurement(
        client,
        investigation_id,
        measurement_payload(value=99.0),
    )
    stored = SQLiteInvestigationStore(database).get_investigation(
        investigation_id
    )

    assert response.status_code == 409
    assert len(stored.measurements) == 1
    assert next(iter(stored.measurements.values())).value == 38.4


def test_measurement_reaches_next_provider_context(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    client, _, provider = measurement_app(tmp_path)
    investigation_id = create_waiting_measurement(client)
    assert post_measurement(client, investigation_id).status_code == 200
    measured_state = provider.seen_states[1]
    monkeypatch.setenv("MODEL_API_KEY", "not-a-real-key")
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        content = json.dumps(
            {
                "tool_name": "ask_technician",
                "arguments": {
                    "question": "Confirmez-vous cette mesure ?",
                    "distinguishes": ["H1", "H2"],
                },
                "reason": "Vérifier la stabilité.",
            }
        )
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": content}}]},
            request=request,
        )

    decision = MetaAIProvider(
        client=httpx.Client(transport=httpx.MockTransport(handler))
    ).decide_next(measured_state)

    assert decision.tool_name is ToolName.ASK_TECHNICIAN
    sent_state = json.loads(captured["body"]["messages"][1]["content"])[
        "investigation_state"
    ]
    assert sent_state["measurements"]
    measurement = next(iter(sent_state["measurements"].values()))
    assert measurement["measurement_type"] == "dc_voltage"
    assert measurement["value"] == 38.4
    assert measurement["unit"] == "V"
    assert "not-a-real-key" not in json.dumps(captured["body"])
