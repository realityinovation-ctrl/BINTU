import pytest
from pydantic import ValidationError

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
    InvestigationStatus,
    Observation,
    RequestMeasurementArguments,
    ToolName,
    Verification,
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


def test_impact_with_unknown_evidence_is_rejected_without_state_change() -> None:
    state = InvestigationState(investigation_id="inv-1")
    state.verifications["verification:action-1"] = Verification(
        id="verification:action-1",
        action_id="action-1",
        distinguishes=[HypothesisId.H0],
        observation_ids=["observation:missing"],
        evidence_ids=["evidence:missing"],
    )
    engine = InvestigationEngine(state, MockAIProvider([]))
    before = state.model_dump(mode="json")

    with pytest.raises(DecisionValidationError, match="unknown evidence"):
        engine.apply_verification_impacts(
            "verification:action-1",
            [
                HypothesisImpact(
                    hypothesis_id=HypothesisId.H0,
                    relation=EvidenceRelation.SUPPORTING,
                    strength=EvidenceStrength.STRONG,
                )
            ],
        )

    assert state.model_dump(mode="json") == before


def test_direct_elimination_without_contradiction_is_rejected_unchanged() -> None:
    state = InvestigationState(investigation_id="inv-1")
    before = state.model_dump(mode="json")

    with pytest.raises(ValidationError, match="new_status"):
        HypothesisImpact.model_validate(
            {
                "hypothesis_id": "H0",
                "relation": "supporting",
                "strength": "strong",
                "new_status": "eliminated",
            }
        )

    assert state.model_dump(mode="json") == before


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


def test_measurement_decision_must_use_closed_catalog() -> None:
    decision = AgentDecision(
        tool_name=ToolName.REQUEST_MEASUREMENT,
        arguments=RequestMeasurementArguments(
            measurement_type="voltage",
            location="sortie panneaux",
            unit="V",
            distinguishes=[HypothesisId.H1],
        ),
        reason="Demander une mesure catalogue.",
    )

    with pytest.raises(DecisionValidationError, match="unknown measurement_type"):
        validate_decision(InvestigationState(investigation_id="inv-1"), decision)


def test_measurement_decision_rejects_mismatched_unit() -> None:
    decision = AgentDecision(
        tool_name=ToolName.REQUEST_MEASUREMENT,
        arguments=RequestMeasurementArguments(
            measurement_type="dc_voltage",
            location="sortie panneaux",
            unit="A",
            distinguishes=[HypothesisId.H1],
        ),
        reason="Demander une mesure catalogue.",
    )

    with pytest.raises(DecisionValidationError, match="requires unit"):
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


def _ask(question: str) -> AgentDecision:
    return AgentDecision(
        tool_name=ToolName.ASK_TECHNICIAN,
        arguments=AskTechnicianArguments(
            question=question,
            distinguishes=[HypothesisId.H0, HypothesisId.H2],
        ),
        reason="Obtenir une observation manquante.",
    )


def _measure(measurement_type: str, unit: str, location: str = "onduleur") -> AgentDecision:
    return AgentDecision(
        tool_name=ToolName.REQUEST_MEASUREMENT,
        arguments=RequestMeasurementArguments(
            measurement_type=measurement_type,
            location=location,
            unit=unit,
            distinguishes=[HypothesisId.H1, HypothesisId.H2],
        ),
        reason="Mesurer le point demandé.",
    )


def test_same_action_without_new_context_is_repetitive() -> None:
    decision = _ask("Le disjoncteur AC est-il enclenché ?")
    state = InvestigationState(investigation_id="inv-loop")
    engine = InvestigationEngine(state, MockAIProvider([decision, decision]))
    engine.advance()
    engine.submit_technician_answer("answer-1", "Oui, il est enclenché.")

    with pytest.raises(DecisionValidationError, match="repetitive action"):
        engine.advance()

    assert state.step_count == 1
    assert state.pending_action is None
    assert set(state.evidence) == {"answer-1"}


def test_same_measurement_without_new_evidence_is_repetitive() -> None:
    decision = _measure("dc_voltage", "V")
    state = InvestigationState(investigation_id="inv-loop")
    engine = InvestigationEngine(state, MockAIProvider([decision, decision]))
    engine.advance()
    engine.submit_measurement("m-dc", 310.0)
    for event in state.timeline:
        if event.details.get("signature"):
            event.details["signature"] = None

    with pytest.raises(DecisionValidationError, match="repetitive action"):
        engine.advance()

    assert list(state.measurements) == ["m-dc"]
    assert state.step_count == 1


def test_same_tool_with_different_arguments_is_not_repetitive() -> None:
    state = InvestigationState(investigation_id="inv-loop")
    engine = InvestigationEngine(
        state,
        MockAIProvider([_measure("dc_voltage", "V"), _measure("dc_current", "A")]),
    )
    engine.advance()
    engine.submit_measurement("m-voltage", 300.0)

    engine.advance()

    assert state.pending_action is not None
    assert state.pending_action.decision.arguments.measurement_type == "dc_current"


def test_same_measurement_is_allowed_after_new_evidence() -> None:
    voltage = _measure("dc_voltage", "V", "chaîne 1")
    state = InvestigationState(investigation_id="inv-loop")
    engine = InvestigationEngine(
        state,
        MockAIProvider([voltage, _ask("Un ombrage est-il apparu ?"), voltage]),
    )
    engine.advance()
    engine.submit_measurement("m-1", 280.0)
    engine.advance()
    engine.submit_technician_answer("answer-shade", "Oui, sur la rangée basse.")

    engine.advance()

    assert state.pending_action is not None
    assert state.pending_action.decision.arguments.measurement_type == "dc_voltage"
    assert state.step_count == 3


def test_a_different_action_after_the_previous_one_is_allowed() -> None:
    state = InvestigationState(investigation_id="inv-loop")
    engine = InvestigationEngine(
        state,
        MockAIProvider([_ask("Quelle est la météo ?"), _measure("ac_power", "W")]),
    )
    engine.advance()
    engine.submit_technician_answer("answer-weather", "Ciel dégagé.")

    engine.advance()

    assert state.pending_action.decision.tool_name is ToolName.REQUEST_MEASUREMENT


def test_valid_finish_is_not_blocked_as_repetitive() -> None:
    state = InvestigationState(investigation_id="inv-loop")
    finish = AgentDecision(
        tool_name=ToolName.FINISH_INVESTIGATION,
        arguments=FinishInvestigationArguments(
            outcome=FinishOutcome.DIAGNOSED,
            diagnosis="Le champ produit, l'onduleur ne délivre pas.",
            confidence=0.7,
            evidence=["answer-1"],
            distinguishes=[HypothesisId.H2, HypothesisId.H3],
        ),
        reason="La réponse cite le symptôme utile.",
    )
    engine = InvestigationEngine(state, MockAIProvider([_ask("L'onduleur affiche-t-il un défaut ?"), finish]))
    engine.advance()
    engine.submit_technician_answer("answer-1", "Oui, défaut d'isolement.")

    engine.advance()

    assert state.status is InvestigationStatus.COMPLETED
    assert state.conclusion is not None
    assert state.conclusion.evidence_ids == ["answer-1"]


def test_repetition_guard_does_not_bypass_existing_validation() -> None:
    state = InvestigationState(investigation_id="inv-loop")
    invalid = AgentDecision(
        tool_name=ToolName.REQUEST_MEASUREMENT,
        arguments=RequestMeasurementArguments(
            measurement_type="dc_voltage",
            location="onduleur",
            unit="A",
            distinguishes=[HypothesisId.H2],
        ),
        reason="Unité incompatible.",
    )
    engine = InvestigationEngine(state, MockAIProvider([invalid]))

    with pytest.raises(DecisionValidationError, match="requires unit"):
        engine.advance()

    assert state.step_count == 0
    assert state.timeline == []


def test_repetitive_attempts_do_not_pass_the_step_limit() -> None:
    state = InvestigationState(investigation_id="inv-loop", max_steps=2)
    repeated = _ask("Le sectionneur DC est-il fermé ?")
    engine = InvestigationEngine(
        state,
        MockAIProvider([repeated, repeated, repeated, repeated, _ask("Depuis quand ?")]),
    )
    engine.advance()
    engine.submit_technician_answer("answer-1", "Oui.")
    for _ in range(3):
        with pytest.raises(DecisionValidationError, match="repetitive action"):
            engine.advance()

    assert state.step_count == 1
    engine.advance()
    engine.submit_technician_answer("answer-2", "Depuis trois jours.")
    engine.advance()

    assert state.step_count == 2
    assert state.status is InvestigationStatus.INSUFFICIENT_INFORMATION
    assert state.conclusion is None
