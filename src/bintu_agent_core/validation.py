"""Backend-enforced decision and electrical-safety guardrails."""

from __future__ import annotations

import json
import unicodedata

from bintu_agent_core.errors import (
    DecisionValidationError,
    SafetyViolationError,
)
from bintu_agent_core.measurement_catalog import MEASUREMENT_CATALOG
from bintu_agent_core.models import (
    AgentDecision,
    CompareMeasurementsArguments,
    EvidenceRelation,
    EvidenceSourceType,
    EvidenceStrength,
    FinishInvestigationArguments,
    FinishOutcome,
    GenerateReportArguments,
    HypothesisImpact,
    HypothesisStatus,
    HypothesisUpdate,
    InvestigationState,
    RequestMeasurementArguments,
)


HIGH_CONFIDENCE_LIMIT = 0.7


def _normalized_text(decision: AgentDecision) -> str:
    serialized = json.dumps(
        {
            "reason": decision.reason,
            "arguments": decision.arguments.model_dump(mode="json"),
        },
        ensure_ascii=False,
    )
    normalized = unicodedata.normalize("NFKD", serialized)
    return "".join(char for char in normalized if not unicodedata.combining(char)).lower()


def validate_safety(decision: AgentDecision) -> None:
    text = _normalized_text(decision)
    operations = (
        "ouvrir",
        "deconnect",
        "debranch",
        "retirer",
        "disconnect",
        "unplug",
        "open",
        "remove",
    )
    conductors = (
        "conducteur",
        "cable",
        "connecteur",
        "borne",
        "fil",
        "wire",
        "connector",
        "terminal",
    )
    energized = (
        "sous tension",
        "alimente",
        "energized",
        "powered",
        "live conductor",
        "live cable",
        "live wire",
    )
    if (
        any(term in text for term in operations)
        and any(term in text for term in conductors)
        and any(term in text for term in energized)
    ):
        raise SafetyViolationError(
            "opening or disconnecting an energized conductor is forbidden"
        )


def validate_decision(
    state: InvestigationState, decision: AgentDecision
) -> None:
    if not decision.reason.strip():
        raise DecisionValidationError("reason must not be blank")

    distinguishes = decision.arguments.distinguishes
    if len(distinguishes) != len(set(distinguishes)):
        raise DecisionValidationError("distinguishes must not contain duplicates")

    arguments = decision.arguments
    if isinstance(arguments, RequestMeasurementArguments):
        spec = MEASUREMENT_CATALOG.get(arguments.measurement_type)
        if spec is None:
            raise DecisionValidationError(
                f"unknown measurement_type: {arguments.measurement_type!r}"
            )
        if arguments.unit != spec.unit:
            raise DecisionValidationError(
                f"{arguments.measurement_type} requires unit {spec.unit!r}"
            )

    if isinstance(arguments, CompareMeasurementsArguments):
        unknown_measurements = set(arguments.measurement_ids) - set(state.measurements)
        if unknown_measurements:
            raise DecisionValidationError(
                f"comparison references unknown measurements: "
                f"{sorted(unknown_measurements)}"
            )
        units = {
            state.measurements[measurement_id].unit
            for measurement_id in arguments.measurement_ids
        }
        if len(units) != 1:
            raise DecisionValidationError(
                "measurements with different units cannot be compared"
            )

    if isinstance(arguments, FinishInvestigationArguments):
        unknown_evidence = set(arguments.evidence) - set(state.evidence)
        if unknown_evidence:
            raise DecisionValidationError(
                f"conclusion references unknown evidence: {sorted(unknown_evidence)}"
            )
        _validate_diagnosis_confidence(state, arguments)

    if (
        isinstance(arguments, GenerateReportArguments)
        and arguments.investigation_id != state.investigation_id
    ):
        raise DecisionValidationError(
            "report investigation_id does not match the current investigation"
        )

    _validate_hypothesis_updates(state, decision)
    validate_safety(decision)


def _validate_hypothesis_updates(
    state: InvestigationState, decision: AgentDecision
) -> None:
    updates = decision.hypothesis_updates
    hypothesis_ids = [update.hypothesis_id for update in updates]
    if len(hypothesis_ids) != len(set(hypothesis_ids)):
        raise DecisionValidationError(
            "a decision cannot update the same hypothesis twice"
        )
    allowed = set(decision.arguments.distinguishes)
    from bintu_agent_core.engine import InvestigationEngine

    for update in updates:
        if update.hypothesis_id not in allowed:
            raise DecisionValidationError(
                "hypothesis update is outside distinguishes: "
                f"{update.hypothesis_id.value}"
            )
        if not update.evidence_ids:
            raise DecisionValidationError(
                "hypothesis update requires evidence_ids"
            )
        unknown = set(update.evidence_ids) - set(state.evidence)
        if unknown:
            raise DecisionValidationError(
                "hypothesis update references unknown evidence: "
                f"{sorted(unknown)}"
            )
        if update.status is HypothesisStatus.ELIMINATED and (
            update.relation is not EvidenceRelation.CONTRADICTORY
            or update.strength is not EvidenceStrength.STRONG
        ):
            raise DecisionValidationError(
                "hypothesis elimination requires strong contradictory evidence"
            )
        derived = InvestigationEngine._derive_hypothesis_status(
            state.hypotheses[update.hypothesis_id].status,
            HypothesisImpact(
                hypothesis_id=update.hypothesis_id,
                relation=update.relation,
                strength=update.strength,
            ),
        )
        if update.status is not derived:
            raise DecisionValidationError(
                "proposed hypothesis status does not match core derivation: "
                f"{update.hypothesis_id.value} -> {derived.value}"
            )


def _validate_diagnosis_confidence(
    state: InvestigationState, arguments: FinishInvestigationArguments
) -> None:
    if (
        arguments.outcome is not FinishOutcome.DIAGNOSED
        or arguments.confidence <= HIGH_CONFIDENCE_LIMIT
    ):
        return
    cited = [state.evidence[evidence_id] for evidence_id in arguments.evidence]
    if all(
        evidence.source_type is EvidenceSourceType.IMAGE_ANALYSIS
        for evidence in cited
    ):
        raise DecisionValidationError(
            "high-confidence diagnosis cannot rely only on image analysis"
        )
    if not any(
        evidence.source_type is EvidenceSourceType.MEASUREMENT
        for evidence in cited
    ):
        raise DecisionValidationError(
            "high-confidence diagnosis requires measurement evidence"
        )
