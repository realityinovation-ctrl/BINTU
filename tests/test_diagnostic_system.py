"""The diagnostic core stores a system, not a photovoltaic installation."""

import json
import sqlite3
from pathlib import Path

import pytest

from bintu_agent_core.engine import InvestigationEngine
from bintu_agent_core.errors import DecisionValidationError
from bintu_agent_core.meta_provider import SYSTEM_PROMPT
from bintu_agent_core.models import (
    AgentDecision,
    AskTechnicianArguments,
    DiagnosticSystem,
    Evidence,
    EvidenceSourceType,
    HypothesisId,
    InvestigationState,
    Observation,
    Problem,
    RequestMeasurementArguments,
    ToolName,
)
from bintu_agent_core.provider import MockAIProvider
from bintu_agent_core.sqlite_store import SQLiteInvestigationStore
from bintu_agent_core.validation import validate_decision
from bintu_backend.image import IMAGE_SYSTEM_PROMPT


def test_photovoltaic_diagnostic_keeps_the_current_domain() -> None:
    state = InvestigationState(
        investigation_id="inv-pv",
        problem=Problem(description="Production faible."),
    )
    decision = AgentDecision(
        tool_name=ToolName.ASK_TECHNICIAN,
        arguments=AskTechnicianArguments(
            question="Depuis quand ?",
            distinguishes=[HypothesisId.H0, HypothesisId.H1],
        ),
        reason="Dater le symptôme.",
    )
    engine = InvestigationEngine(state, MockAIProvider([decision]))

    engine.advance()

    assert state.system.domain == "photovoltaic"
    assert state.system.type == "photovoltaic_installation"
    assert state.pending_action is not None
    assert set(state.hypotheses) == set(HypothesisId)


def test_electric_motor_does_not_require_photovoltaic_fields() -> None:
    state = InvestigationState(
        investigation_id="inv-motor",
        problem=Problem(description="Le moteur chauffe au démarrage."),
        system=DiagnosticSystem(
            domain="electrical",
            type="electric_motor",
            manufacturer="Nord",
            model="SK 90",
        ),
    )
    state.observations["observation:answer-1"] = Observation(
        id="observation:answer-1",
        source_type=EvidenceSourceType.TECHNICIAN_ANSWER,
        source_id="action-1",
        statement="Le roulement côté accouplement est chaud.",
    )
    state.evidence["answer-1"] = Evidence(
        id="answer-1",
        observation_id="observation:answer-1",
        source_type=EvidenceSourceType.TECHNICIAN_ANSWER,
        source_id="action-1",
    )
    payload = state.model_dump(mode="json")

    assert payload["system"]["domain"] == "electrical"
    assert payload["system"]["type"] == "electric_motor"
    assert payload["system"]["characteristics"] == {}
    assert "panel_count" not in json.dumps(payload["system"])
    assert "installation" not in payload
    assert set(payload["hypotheses"]) == {"H0", "H1", "H2", "H3"}
    assert state.observations["observation:answer-1"].statement.startswith(
        "Le roulement"
    )


def test_generic_system_round_trips_through_sqlite(tmp_path: Path) -> None:
    store = SQLiteInvestigationStore(tmp_path / "motor.sqlite3")
    state = store.create_investigation()
    state.problem = Problem(description="Le moteur chauffe au démarrage.")
    state.system = DiagnosticSystem(
        domain="electrical",
        type="electric_motor",
        characteristics={"rated_power_kw": 4},
    )

    store.save_investigation(state)
    restored = store.get_investigation(state.investigation_id)

    assert restored.system.domain == "electrical"
    assert restored.system.type == "electric_motor"
    assert restored.system.characteristics == {"rated_power_kw": 4}
    assert restored.problem is not None
    assert restored.problem.description == "Le moteur chauffe au démarrage."


def test_legacy_installation_is_read_as_a_photovoltaic_system(tmp_path: Path) -> None:
    database = tmp_path / "legacy.sqlite3"
    store = SQLiteInvestigationStore(database)
    state = store.create_investigation()
    with sqlite3.connect(database) as connection:
        raw = connection.execute(
            "SELECT state_json FROM investigations WHERE id = ?",
            (state.investigation_id,),
        ).fetchone()[0]
        payload = json.loads(raw)
        payload.pop("system")
        payload["installation"] = {
            "nominal_power_kwp": None,
            "panel_count": 12,
            "inverter_model": None,
            "battery_present": False,
            "battery_capacity_kwh": None,
            "system_voltage_v": None,
        }
        connection.execute(
            "UPDATE investigations SET state_json = ? WHERE id = ?",
            (json.dumps(payload), state.investigation_id),
        )

    restored = store.get_investigation(state.investigation_id)

    assert restored.system.domain == "photovoltaic"
    assert restored.system.type == "photovoltaic_installation"
    assert restored.system.characteristics["panel_count"] == 12
    assert restored.system.characteristics["battery_present"] is False


def test_existing_measurement_validation_still_applies_to_another_domain() -> None:
    state = InvestigationState(
        investigation_id="inv-motor",
        system=DiagnosticSystem(domain="electrical", type="electric_motor"),
    )
    decision = AgentDecision(
        tool_name=ToolName.REQUEST_MEASUREMENT,
        arguments=RequestMeasurementArguments(
            measurement_type="dc_voltage",
            location="bornes moteur",
            unit="A",
            distinguishes=[HypothesisId.H1],
        ),
        reason="Unité incompatible.",
    )

    with pytest.raises(DecisionValidationError, match="requires unit"):
        validate_decision(state, decision)


def test_provider_context_can_describe_a_non_photovoltaic_system() -> None:
    state = InvestigationState(
        investigation_id="inv-motor",
        problem=Problem(description="Le moteur chauffe au démarrage."),
        system=DiagnosticSystem(domain="electrical", type="electric_motor"),
    )
    context = {
        "agent_decision_schema": AgentDecision.model_json_schema(),
        "investigation_state": state.model_dump(mode="json"),
    }

    assert context["investigation_state"]["system"]["domain"] == "electrical"
    assert context["investigation_state"]["system"]["type"] == "electric_motor"
    assert "tool_name" in context["agent_decision_schema"]["properties"]
    assert "photovoltaic" not in SYSTEM_PROMPT.lower()
    assert "photovoltaic" not in IMAGE_SYSTEM_PROMPT.lower()
