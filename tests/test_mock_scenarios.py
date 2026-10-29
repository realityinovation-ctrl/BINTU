import json
from pathlib import Path

from bintu_agent_core.engine import InvestigationEngine
from bintu_agent_core.models import (
    AgentDecision,
    EvidenceRelation,
    EvidenceSourceType,
    EvidenceStrength,
    HypothesisId,
    HypothesisImpact,
    HypothesisStatus,
    InvestigationState,
    InvestigationStatus,
)
from bintu_agent_core.provider import MockAIProvider


FIXTURES = Path(__file__).parent / "fixtures"


def engine_for(name: str) -> InvestigationEngine:
    decisions = json.loads((FIXTURES / name).read_text(encoding="utf-8"))
    return InvestigationEngine(
        InvestigationState(investigation_id=f"inv-{name}"),
        MockAIProvider(decisions),
    )


def test_normal_full_battery_scenario() -> None:
    engine = engine_for("normal_battery_full.json")

    engine.advance()
    engine.submit_technician_answer(
        "answer-full",
        "Oui, la batterie affiche 100 %.",
        impacts=[
            HypothesisImpact(
                hypothesis_id=HypothesisId.H0,
                relation=EvidenceRelation.SUPPORTING,
                strength=EvidenceStrength.STRONG,
            ),
            HypothesisImpact(
                hypothesis_id=HypothesisId.H3,
                relation=EvidenceRelation.CONTRADICTORY,
                strength=EvidenceStrength.INDICATIVE,
            ),
        ],
    )
    engine.advance()

    assert engine.state.status is InvestigationStatus.COMPLETED
    assert engine.state.conclusion is not None
    assert "batterie est pleine" in engine.state.conclusion.diagnosis
    assert (
        engine.state.hypotheses[HypothesisId.H0].status
        is HypothesisStatus.SUPPORTED
    )


def test_degraded_cable_scenario() -> None:
    engine = engine_for("degraded_cable.json")

    engine.advance()
    engine.submit_measurement("m-array", 400.0)
    engine.advance()
    engine.submit_measurement("m-inverter", 315.0)
    engine.advance()
    engine.apply_verification_impacts(
        "verification:action-3",
        [
            HypothesisImpact(
                hypothesis_id=HypothesisId.H1,
                relation=EvidenceRelation.CONTRADICTORY,
                strength=EvidenceStrength.INDICATIVE,
            ),
            HypothesisImpact(
                hypothesis_id=HypothesisId.H2,
                relation=EvidenceRelation.SUPPORTING,
                strength=EvidenceStrength.STRONG,
            ),
        ],
    )
    engine.advance()

    assert engine.state.status is InvestigationStatus.COMPLETED
    comparison = engine.state.observations["observation:comparison-3"]
    assert comparison.value == 85.0
    assert (
        engine.state.hypotheses[HypothesisId.H2].status
        is HypothesisStatus.SUPPORTED
    )


def test_photo_dust_is_weakened_when_measurements_point_elsewhere() -> None:
    engine = engine_for("dust_photo_measurement_trap.json")

    engine.advance()
    engine.submit_image_analysis(
        "image-dust",
        "Un dépôt de poussière est visible.",
        certainty=0.65,
        impacts=[
            HypothesisImpact(
                hypothesis_id=HypothesisId.H1,
                relation=EvidenceRelation.SUPPORTING,
                strength=EvidenceStrength.INDICATIVE,
            )
        ],
    )
    engine.advance()
    engine.submit_measurement("m-array", 398.0)
    engine.advance()
    engine.submit_measurement("m-inverter", 300.0)
    engine.advance()
    engine.apply_verification_impacts(
        "verification:action-4",
        [
            HypothesisImpact(
                hypothesis_id=HypothesisId.H1,
                relation=EvidenceRelation.CONTRADICTORY,
                strength=EvidenceStrength.INDICATIVE,
            ),
            HypothesisImpact(
                hypothesis_id=HypothesisId.H2,
                relation=EvidenceRelation.SUPPORTING,
                strength=EvidenceStrength.STRONG,
            ),
        ],
    )
    engine.advance()

    image_evidence = engine.state.evidence["image-dust"]
    image_observation = engine.state.observations[image_evidence.observation_id]
    assert image_evidence.source_type is EvidenceSourceType.IMAGE_ANALYSIS
    assert image_evidence.certainty == 0.65
    assert image_observation.statement == "Un dépôt de poussière est visible."
    assert (
        engine.state.hypotheses[HypothesisId.H1].status
        is HypothesisStatus.WEAKENED
    )
    assert (
        engine.state.hypotheses[HypothesisId.H2].status
        is HypothesisStatus.SUPPORTED
    )


def test_insufficient_information_scenario() -> None:
    engine = engine_for("insufficient_information.json")

    engine.advance()
    engine.submit_technician_answer(
        "answer-unavailable", "Impossible de relever l'affichage."
    )
    engine.advance()

    assert engine.state.status is InvestigationStatus.INSUFFICIENT_INFORMATION
    assert engine.state.conclusion is None


def test_mock_replays_copies_in_order() -> None:
    raw = json.loads(
        (FIXTURES / "normal_battery_full.json").read_text(encoding="utf-8")
    )
    provider = MockAIProvider(raw)
    state = InvestigationState(investigation_id="inv-copy")

    first = provider.decide_next(state)
    assert isinstance(first, AgentDecision)
    assert provider.remaining == 1
