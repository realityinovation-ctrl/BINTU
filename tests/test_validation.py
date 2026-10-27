import pytest

from bintu_agent_core.engine import InvestigationEngine
from bintu_agent_core.errors import DecisionValidationError, SafetyViolationError
from bintu_agent_core.models import (
    AgentDecision,
    AskTechnicianArguments,
    Evidence,
    EvidenceRelation,
    EvidenceStrength,
    EvidenceSourceType,
    FinishInvestigationArguments,
    FinishOutcome,
    HypothesisId,
    HypothesisImpact,
    HypothesisStatus,
    InvestigationState,
    Observation,
    ToolName,
)
from bintu_agent_core.provider import MockAIProvider
from bintu_agent_core.validation import validate_decision


def state_with_evidence() -> InvestigationState:
    state = InvestigationState(investigation_id="inv-1")
    state.observations["observation:e-1"] = Observation(
        id="observation:e-1",
        source_type=EvidenceSourceType.TECHNICIAN_ANSWER,
        source_id="action-0",
        statement="La tension reste nulle malgré un ensoleillement établi.",
    )
    state.evidence["e-1"] = Evidence(
        id="e-1",
        observation_id="observation:e-1",
        source_type=EvidenceSourceType.TECHNICIAN_ANSWER,
        source_id="action-0",
    )
    return state


def test_finish_rejects_unknown_evidence() -> None:
    decision = AgentDecision(
        tool_name=ToolName.FINISH_INVESTIGATION,
        arguments=FinishInvestigationArguments(
            outcome=FinishOutcome.DIAGNOSED,
            diagnosis="Défaut de chaîne.",
            confidence=0.7,
            evidence=["missing"],
            distinguishes=[HypothesisId.H1, HypothesisId.H2],
        ),
        reason="Les mesures convergent.",
    )

    with pytest.raises(DecisionValidationError, match="unknown evidence"):
        validate_decision(InvestigationState(investigation_id="inv-1"), decision)


def hypothesis_question() -> AgentDecision:
    return AgentDecision(
        tool_name=ToolName.ASK_TECHNICIAN,
        arguments=AskTechnicianArguments(
            question="Un défaut est-il affiché ?",
            distinguishes=[HypothesisId.H0, HypothesisId.H2],
        ),
        reason="Poursuivre la vérification.",
    )


def test_strong_supporting_result_cannot_eliminate_hypothesis() -> None:
    state = InvestigationState(investigation_id="inv-1")
    engine = InvestigationEngine(state, MockAIProvider([hypothesis_question()]))
    engine.advance()
    engine.submit_technician_answer(
        "e-1",
        "Aucun défaut affiché.",
        impacts=[
            HypothesisImpact(
                hypothesis_id=HypothesisId.H0,
                relation=EvidenceRelation.SUPPORTING,
                strength=EvidenceStrength.STRONG,
            )
        ],
    )

    assert state.hypotheses[HypothesisId.H0].status is HypothesisStatus.SUPPORTED


def test_strong_contradictory_result_is_applied_and_logged() -> None:
    state = InvestigationState(investigation_id="inv-1")
    engine = InvestigationEngine(state, MockAIProvider([hypothesis_question()]))
    engine.advance()
    engine.submit_technician_answer(
        "e-1",
        "Défaut électrique affiché.",
        impacts=[
            HypothesisImpact(
                hypothesis_id=HypothesisId.H0,
                relation=EvidenceRelation.CONTRADICTORY,
                strength=EvidenceStrength.STRONG,
            )
        ],
    )

    assert state.hypotheses[HypothesisId.H0].status is HypothesisStatus.ELIMINATED
    assert state.hypotheses[HypothesisId.H0].contradictory_evidence_ids == ["e-1"]


def test_decision_cannot_mutate_hypothesis_before_tool_result() -> None:
    state = InvestigationState(investigation_id="inv-1")
    decision = AgentDecision(
        tool_name=ToolName.ASK_TECHNICIAN,
        arguments=AskTechnicianArguments(
            question="Un défaut est-il affiché ?",
            distinguishes=[HypothesisId.H0, HypothesisId.H2],
        ),
        reason="Poursuivre la vérification.",
    )
    InvestigationEngine(state, MockAIProvider([decision])).advance()

    assert state.hypotheses[HypothesisId.H0].status is HypothesisStatus.UNEXPLORED
    assert state.evidence == {}


def test_invalid_tool_result_is_rejected_before_observation_or_evidence() -> None:
    state = InvestigationState(investigation_id="inv-1")
    engine = InvestigationEngine(state, MockAIProvider([hypothesis_question()]))
    engine.advance()

    with pytest.raises(DecisionValidationError, match="not listed"):
        engine.submit_technician_answer(
            "e-1",
            "Batterie en défaut.",
            impacts=[
                HypothesisImpact(
                    hypothesis_id=HypothesisId.H3,
                    relation=EvidenceRelation.SUPPORTING,
                    strength=EvidenceStrength.STRONG,
                )
            ],
        )

    assert state.observations == {}
    assert state.evidence == {}
    assert state.verifications == {}


def test_dangerous_energized_conductor_request_is_rejected() -> None:
    decision = AgentDecision(
        tool_name=ToolName.ASK_TECHNICIAN,
        arguments=AskTechnicianArguments(
            question="Déconnectez le câble sous tension puis inspectez-le.",
            distinguishes=[HypothesisId.H1, HypothesisId.H2],
        ),
        reason="Inspecter la connexion.",
    )

    with pytest.raises(SafetyViolationError):
        validate_decision(InvestigationState(investigation_id="inv-1"), decision)


def test_blank_operational_reason_is_rejected() -> None:
    decision = AgentDecision(
        tool_name=ToolName.ASK_TECHNICIAN,
        arguments=AskTechnicianArguments(
            question="Un défaut est-il affiché ?",
            distinguishes=[HypothesisId.H2, HypothesisId.H3],
        ),
        reason="   ",
    )

    with pytest.raises(DecisionValidationError, match="reason"):
        validate_decision(InvestigationState(investigation_id="inv-1"), decision)
