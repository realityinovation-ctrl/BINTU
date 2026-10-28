import json
from pathlib import Path

import pytest

from bintu_agent_core.engine import InvestigationEngine
from bintu_agent_core.errors import DecisionValidationError
from bintu_agent_core.models import (
    AgentDecision,
    Evidence,
    EvidenceRelation,
    EvidenceSourceType,
    EvidenceStrength,
    FinishInvestigationArguments,
    FinishOutcome,
    HypothesisId,
    HypothesisImpact,
    HypothesisStatus,
    InvestigationState,
    InvestigationStatus,
    Observation,
    Problem,
    ToolName,
)
from bintu_agent_core.provider import MockAIProvider
from bintu_agent_core.report import investigation_report
from bintu_agent_core.sqlite_store import SQLiteInvestigationStore
from bintu_agent_core.validation import validate_decision


FIXTURE = Path(__file__).parent / "fixtures" / "full_investigation_scenario.json"
PROBLEM = (
    "La production photovoltaïque a fortement diminué depuis quelques jours."
)


class RecordingProvider(MockAIProvider):
    def __init__(self, decisions: list[dict]) -> None:
        super().__init__(decisions)
        self.tools: list[ToolName] = []
        self.inputs: list[InvestigationState] = []

    def decide_next(self, state: InvestigationState) -> AgentDecision:
        before = state.model_dump(mode="json")
        self.inputs.append(state.model_copy(deep=True))
        decision = super().decide_next(state)
        if state.model_dump(mode="json") != before:
            raise AssertionError("provider mutated the investigation state")
        self.tools.append(decision.tool_name)
        return decision


def decisions() -> list[dict]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def indicative(
    hypothesis_id: HypothesisId, relation: EvidenceRelation
) -> HypothesisImpact:
    return HypothesisImpact(
        hypothesis_id=hypothesis_id,
        relation=relation,
        strength=EvidenceStrength.INDICATIVE,
    )


def test_multimodal_scenario_uses_real_core_transitions(tmp_path: Path) -> None:
    script = decisions()
    store = SQLiteInvestigationStore(tmp_path / "full.sqlite3")
    state = store.create_investigation()
    state.problem = Problem(description=PROBLEM)
    statuses = [state.status]
    first = RecordingProvider(script[:2])
    engine = InvestigationEngine(state, first)

    engine.advance()
    statuses.append(state.status)
    engine.submit_technician_answer(
        "answer-history",
        "L'installation fonctionnait normalement auparavant.",
        impacts=[indicative(HypothesisId.H0, EvidenceRelation.CONTRADICTORY)],
    )
    statuses.append(state.status)
    assert state.hypotheses[HypothesisId.H0].status is HypothesisStatus.WEAKENED
    assert state.hypotheses[HypothesisId.H1].status is HypothesisStatus.UNEXPLORED

    engine.advance()
    statuses.append(state.status)
    engine.submit_image_analysis(
        "image-dust",
        "Une couche de poussière couvre une grande partie de plusieurs panneaux.",
        0.62,
        impacts=[indicative(HypothesisId.H1, EvidenceRelation.SUPPORTING)],
    )
    statuses.append(state.status)
    assert state.hypotheses[HypothesisId.H1].status is HypothesisStatus.PLAUSIBLE
    assert state.hypotheses[HypothesisId.H1].status is not HypothesisStatus.SUPPORTED

    store.save_investigation(state)
    restored = store.get_investigation(state.investigation_id)
    assert restored.model_dump(mode="json") == state.model_dump(mode="json")

    second = RecordingProvider(script[2:])
    engine = InvestigationEngine(restored, second)
    engine.advance()
    statuses.append(restored.status)
    engine.submit_measurement(
        "m-panels",
        31.5,
        impacts=[indicative(HypothesisId.H2, EvidenceRelation.SUPPORTING)],
    )
    statuses.append(restored.status)
    engine.advance()
    statuses.append(restored.status)
    store.save_investigation(restored)
    final = store.get_investigation(restored.investigation_id)

    assert final.model_dump(mode="json") == restored.model_dump(mode="json")
    assert statuses == [
        InvestigationStatus.INVESTIGATING,
        InvestigationStatus.WAITING_FOR_TECHNICIAN,
        InvestigationStatus.INVESTIGATING,
        InvestigationStatus.WAITING_FOR_TECHNICIAN,
        InvestigationStatus.INVESTIGATING,
        InvestigationStatus.WAITING_FOR_TECHNICIAN,
        InvestigationStatus.INVESTIGATING,
        InvestigationStatus.COMPLETED,
    ]
    assert [tool.value for tool in first.tools + second.tools] == [
        "ask_technician",
        "analyze_image",
        "request_measurement",
        "finish_investigation",
    ]
    assert {
        evidence.source_type
        for evidence in final.evidence.values()
    } == {
        EvidenceSourceType.TECHNICIAN_ANSWER,
        EvidenceSourceType.IMAGE_ANALYSIS,
        EvidenceSourceType.MEASUREMENT,
    }
    assert all(
        hypothesis.status is not HypothesisStatus.ELIMINATED
        for hypothesis in final.hypotheses.values()
    )
    assert final.hypotheses[HypothesisId.H2].status is HypothesisStatus.PLAUSIBLE
    assert final.conclusion is not None
    assert final.conclusion.evidence_ids == [
        "answer-history",
        "image-dust",
        "m-panels",
    ]
    assert final.measurements["m-panels"].value == 31.5
    assert final.measurements["m-panels"].unit == "V"
    report = investigation_report(final)
    assert report["problem"] == PROBLEM
    assert report["diagnosis"] == final.conclusion.diagnosis
    assert report["confidence"] == 0.62
    assert [item["source_type"] for item in report["cited_evidence"]] == [
        "technician_answer",
        "image_analysis",
        "measurement",
    ]
    assert report["measurements"][0]["value"] == 31.5
    assert [event["sequence"] for event in report["timeline"]] == list(
        range(1, len(final.timeline) + 1)
    )
    assert first.inputs[1].observations
    assert second.inputs[0].measurements == {}
    assert second.inputs[1].measurements


def finish_decision(
    evidence_ids: list[str], confidence: float
) -> AgentDecision:
    return AgentDecision(
        tool_name=ToolName.FINISH_INVESTIGATION,
        arguments=FinishInvestigationArguments(
            outcome=FinishOutcome.DIAGNOSED,
            diagnosis="Diagnostic proposé.",
            confidence=confidence,
            evidence=evidence_ids,
            distinguishes=[HypothesisId.H1],
        ),
        reason="Conclure à partir des preuves citées.",
    )


def state_with_evidence(source_type: EvidenceSourceType) -> InvestigationState:
    state = InvestigationState(investigation_id="inv-negative")
    state.observations["observation:e-1"] = Observation(
        id="observation:e-1",
        source_type=source_type,
        source_id="source-1",
        statement="Fait enregistré.",
        certainty=0.5 if source_type is EvidenceSourceType.IMAGE_ANALYSIS else None,
    )
    state.evidence["e-1"] = Evidence(
        id="e-1",
        observation_id="observation:e-1",
        source_type=source_type,
        source_id="source-1",
        certainty=0.5 if source_type is EvidenceSourceType.IMAGE_ANALYSIS else None,
    )
    return state


def assert_rejected_without_mutation(
    state: InvestigationState, decision: AgentDecision, match: str
) -> None:
    before = state.model_dump(mode="json")
    with pytest.raises(DecisionValidationError, match=match):
        validate_decision(state, decision)
    engine = InvestigationEngine(state, MockAIProvider([decision]))
    with pytest.raises(DecisionValidationError, match=match):
        engine.advance()
    assert state.model_dump(mode="json") == before


def test_diagnosis_citing_unknown_evidence_is_rejected() -> None:
    state = state_with_evidence(EvidenceSourceType.MEASUREMENT)
    assert_rejected_without_mutation(
        state, finish_decision(["missing"], 0.4), "unknown evidence"
    )


def test_high_confidence_without_measurement_is_rejected() -> None:
    state = state_with_evidence(EvidenceSourceType.TECHNICIAN_ANSWER)
    assert_rejected_without_mutation(
        state,
        finish_decision(["e-1"], 0.71),
        "requires measurement evidence",
    )


def test_high_confidence_from_image_only_is_rejected() -> None:
    state = state_with_evidence(EvidenceSourceType.IMAGE_ANALYSIS)
    assert_rejected_without_mutation(
        state,
        finish_decision(["e-1"], 0.9),
        "only on image analysis",
    )


def test_moderate_confidence_without_measurement_remains_allowed() -> None:
    state = state_with_evidence(EvidenceSourceType.TECHNICIAN_ANSWER)
    validate_decision(state, finish_decision(["e-1"], 0.7))
