import pytest
from pydantic import ValidationError

from bintu_agent_core.models import (
    AgentDecision,
    AskTechnicianArguments,
    EvidenceSourceType,
    FinishInvestigationArguments,
    FinishOutcome,
    HypothesisId,
    InvestigationState,
    Observation,
    RequestMeasurementArguments,
    ToolName,
)


def test_new_investigation_defaults_to_the_photovoltaic_system() -> None:
    state = InvestigationState(investigation_id="inv-1")

    assert state.system.domain == "photovoltaic"
    assert state.system.type == "photovoltaic_installation"
    assert state.system.manufacturer is None
    assert state.system.model is None
    assert state.system.characteristics == {}


def test_image_analysis_requires_certainty() -> None:
    with pytest.raises(ValidationError, match="requires certainty"):
        Observation(
            id="e1",
            source_type=EvidenceSourceType.IMAGE_ANALYSIS,
            source_id="image-1",
            statement="Dépôt visible",
        )


def test_non_image_evidence_rejects_certainty() -> None:
    with pytest.raises(ValidationError, match="only valid"):
        Observation(
            id="e1",
            source_type=EvidenceSourceType.OBSERVATION,
            source_id="observation-1",
            statement="Onduleur allumé",
            certainty=0.9,
        )


def test_decision_requires_non_empty_reason_and_distinguishes() -> None:
    with pytest.raises(ValidationError):
        AgentDecision(
            tool_name=ToolName.ASK_TECHNICIAN,
            arguments=AskTechnicianArguments(
                question="Quel est l'état de charge ?",
                distinguishes=[],
            ),
            reason="",
        )


def test_decision_arguments_must_match_tool() -> None:
    with pytest.raises(ValidationError, match="requires"):
        AgentDecision(
            tool_name=ToolName.ASK_TECHNICIAN,
            arguments=RequestMeasurementArguments(
                measurement_type="dc_voltage",
                location="sortie panneau",
                unit="V",
                distinguishes=[HypothesisId.H1, HypothesisId.H2],
            ),
            reason="Distinguer un défaut de production d'un défaut de chaîne.",
        )


def test_diagnosed_outcome_requires_diagnosis() -> None:
    with pytest.raises(ValidationError, match="requires a diagnosis"):
        FinishInvestigationArguments(
            outcome=FinishOutcome.DIAGNOSED,
            diagnosis=None,
            confidence=0.8,
            evidence=["e1"],
            distinguishes=[HypothesisId.H0, HypothesisId.H3],
        )


def test_provider_decision_cannot_contain_hypothesis_updates() -> None:
    with pytest.raises(ValidationError, match="hypothesis_updates"):
        AgentDecision.model_validate(
            {
                "tool_name": "ask_technician",
                "arguments": {
                    "question": "Quel état est affiché ?",
                    "distinguishes": ["H0", "H3"],
                    "hypothesis_updates": [],
                },
                "reason": "Obtenir une observation.",
            }
        )
