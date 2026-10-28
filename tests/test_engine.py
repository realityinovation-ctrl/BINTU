import pytest

from bintu_agent_core.engine import InvestigationEngine
from bintu_agent_core.errors import (
    InvalidStateTransitionError,
    ScriptExhaustedError,
    UnsupportedToolError,
)
from bintu_agent_core.models import (
    AgentDecision,
    AskTechnicianArguments,
    FinishInvestigationArguments,
    FinishOutcome,
    GenerateReportArguments,
    HypothesisId,
    InvestigationState,
    InvestigationStatus,
    RequestMeasurementArguments,
    ToolName,
)
from bintu_agent_core.provider import MockAIProvider


def ask_decision() -> AgentDecision:
    return AgentDecision(
        tool_name=ToolName.ASK_TECHNICIAN,
        arguments=AskTechnicianArguments(
            question="La batterie indique-t-elle une charge complète ?",
            distinguishes=[HypothesisId.H0, HypothesisId.H3],
        ),
        reason="Vérifier si l'arrêt de charge correspond à un état normal.",
    )


def test_question_pauses_and_answer_resumes_investigation() -> None:
    state = InvestigationState(investigation_id="inv-1")
    engine = InvestigationEngine(state, MockAIProvider([ask_decision()]))

    engine.advance()

    assert state.status is InvestigationStatus.WAITING_FOR_TECHNICIAN
    assert state.pending_action is not None

    engine.submit_technician_answer("answer-1", "Oui, charge affichée à 100 %.")

    assert state.status is InvestigationStatus.INVESTIGATING
    assert state.pending_action is None
    assert state.evidence["answer-1"].source_id == "action-1"
    assert [event.sequence for event in state.timeline] == list(
        range(1, len(state.timeline) + 1)
    )


def test_measurement_uses_requested_metadata_without_inventing_installation() -> None:
    decision = AgentDecision(
        tool_name=ToolName.REQUEST_MEASUREMENT,
        arguments=RequestMeasurementArguments(
            measurement_type="dc_voltage",
            location="sortie chaîne PV",
            unit="V",
            distinguishes=[HypothesisId.H1, HypothesisId.H2],
        ),
        reason="Comparer la production du champ à l'entrée de l'onduleur.",
    )
    state = InvestigationState(investigation_id="inv-1")
    engine = InvestigationEngine(state, MockAIProvider([decision]))

    engine.advance()
    engine.submit_measurement("m-1", 382.4)

    assert state.measurements["m-1"].value == 382.4
    observation_id = state.evidence["m-1"].observation_id
    assert state.observations[observation_id].value == 382.4
    assert all(value is None for value in state.installation.model_dump().values())


def test_step_limit_ends_without_forcing_a_diagnosis() -> None:
    state = InvestigationState(investigation_id="inv-1", max_steps=1)
    engine = InvestigationEngine(state, MockAIProvider([ask_decision()]))
    engine.advance()
    engine.submit_technician_answer("answer-1", "Je ne peux pas vérifier.")

    engine.advance()

    assert state.status is InvestigationStatus.INSUFFICIENT_INFORMATION
    assert state.conclusion is None
    status_event = state.timeline[-1]
    assert status_event.details["to"] == "insufficient_information"
    assert "maximal" in status_event.summary


def test_completed_state_cannot_advance() -> None:
    state = InvestigationState(investigation_id="inv-1")
    provider = MockAIProvider([ask_decision()])
    engine = InvestigationEngine(state, provider)
    engine.advance()
    engine.submit_technician_answer("answer-1", "Batterie pleine.")
    provider = MockAIProvider(
        [
            AgentDecision(
                tool_name=ToolName.FINISH_INVESTIGATION,
                arguments=FinishInvestigationArguments(
                    outcome=FinishOutcome.DIAGNOSED,
                    diagnosis="Conditions normales : batterie pleine.",
                        confidence=0.7,
                    evidence=["answer-1"],
                    distinguishes=[HypothesisId.H0, HypothesisId.H3],
                ),
                reason="La preuve reçue explique l'arrêt de charge.",
            )
        ]
    )
    engine.provider = provider
    engine.advance()

    assert state.status is InvestigationStatus.COMPLETED
    with pytest.raises(InvalidStateTransitionError):
        engine.advance()


def test_exhausted_mock_is_not_converted_to_insufficient_information() -> None:
    state = InvestigationState(investigation_id="inv-1")
    engine = InvestigationEngine(state, MockAIProvider([]))

    with pytest.raises(ScriptExhaustedError):
        engine.advance()

    assert state.status is InvestigationStatus.INVESTIGATING
    assert state.step_count == 0
    assert state.timeline == []


def test_deferred_report_tool_does_not_mutate_state() -> None:
    state = InvestigationState(investigation_id="inv-1")
    decision = AgentDecision(
        tool_name=ToolName.GENERATE_REPORT,
        arguments=GenerateReportArguments(
            investigation_id="inv-1",
            distinguishes=[HypothesisId.H0],
        ),
        reason="Produire le rapport de cette investigation.",
    )
    engine = InvestigationEngine(state, MockAIProvider([decision]))

    with pytest.raises(UnsupportedToolError):
        engine.advance()

    assert state.step_count == 0
    assert state.timeline == []
