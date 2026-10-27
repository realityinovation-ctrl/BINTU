import pytest

from bintu_agent_core.engine import InvestigationEngine
from bintu_agent_core.errors import DecisionValidationError, SafetyViolationError
from bintu_agent_core.models import (
    AgentDecision,
    AskTechnicianArguments,
    Evidence,
    EvidenceRelation,
    EvidenceSourceType,
    FinishInvestigationArguments,
    FinishOutcome,
    HypothesisId,
    HypothesisStatus,
    HypothesisUpdate,
    InvestigationState,
    ToolName,
)
from bintu_agent_core.provider import MockAIProvider
from bintu_agent_core.validation import validate_decision


def state_with_evidence() -> InvestigationState:
    state = InvestigationState(investigation_id="inv-1")
    state.evidence["e-1"] = Evidence(
        id="e-1",
        source_type=EvidenceSourceType.TECHNICIAN_ANSWER,
        source_id="action-0",
        statement="La tension reste nulle malgré un ensoleillement établi.",
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


def test_elimination_requires_contradictory_evidence() -> None:
    state = state_with_evidence()
    decision = AgentDecision(
        tool_name=ToolName.ASK_TECHNICIAN,
        arguments=AskTechnicianArguments(
            question="Un défaut est-il affiché ?",
            distinguishes=[HypothesisId.H0, HypothesisId.H2],
            hypothesis_updates=[
                HypothesisUpdate(
                    hypothesis_id=HypothesisId.H0,
                    new_status=HypothesisStatus.ELIMINATED,
                    evidence_ids=["e-1"],
                    evidence_relation=EvidenceRelation.SUPPORTING,
                )
            ],
        ),
        reason="Poursuivre la vérification.",
    )

    with pytest.raises(DecisionValidationError, match="contradictory evidence"):
        validate_decision(state, decision)


def test_valid_elimination_is_applied_and_logged() -> None:
    state = state_with_evidence()
    decision = AgentDecision(
        tool_name=ToolName.ASK_TECHNICIAN,
        arguments=AskTechnicianArguments(
            question="Un défaut est-il affiché ?",
            distinguishes=[HypothesisId.H0, HypothesisId.H2],
            hypothesis_updates=[
                HypothesisUpdate(
                    hypothesis_id=HypothesisId.H0,
                    new_status=HypothesisStatus.ELIMINATED,
                    evidence_ids=["e-1"],
                    evidence_relation=EvidenceRelation.CONTRADICTORY,
                )
            ],
        ),
        reason="Poursuivre la vérification.",
    )

    InvestigationEngine(state, MockAIProvider([decision])).advance()

    assert (
        state.hypotheses[HypothesisId.H0].status
        is HypothesisStatus.ELIMINATED
    )
    assert state.hypotheses[
        HypothesisId.H0
    ].contradictory_evidence_ids == ["e-1"]


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
