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
    AnalyzeImageArguments,
    AskTechnicianArguments,
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
    TimelineEventType,
)


HIGH_CONFIDENCE_LIMIT = 0.7


def _fold(value: str) -> str:
    return " ".join(value.split()).casefold()


def action_signature(decision: AgentDecision) -> list[str] | None:
    """Stable identity of an action. A valid finish is never repetitive."""

    arguments = decision.arguments
    if isinstance(arguments, (FinishInvestigationArguments, GenerateReportArguments)):
        return None
    if isinstance(arguments, AskTechnicianArguments):
        return ["ask_technician", _fold(arguments.question)]
    if isinstance(arguments, RequestMeasurementArguments):
        return [
            "request_measurement",
            arguments.measurement_type.strip(),
            arguments.unit.strip(),
            _fold(arguments.location),
        ]
    if isinstance(arguments, AnalyzeImageArguments):
        return ["analyze_image", _fold(arguments.focus)]
    if isinstance(arguments, CompareMeasurementsArguments):
        return ["compare_measurements", *sorted(arguments.measurement_ids)]
    return None


def _direct_evidence(state: InvestigationState, action_id: object) -> set[str]:
    if not isinstance(action_id, str):
        return set()
    evidence_ids: set[str] = set()
    for verification in state.verifications.values():
        if verification.action_id == action_id:
            evidence_ids.update(verification.evidence_ids)
    return evidence_ids


def _evidence_after(state: InvestigationState, evidence_id: str) -> set[str]:
    keys = list(state.evidence)
    if evidence_id not in keys:
        return set()
    return set(keys[keys.index(evidence_id) + 1 :])


def _measurement_repeat_without_later_evidence(
    state: InvestigationState, signature: list[str]
) -> bool:
    if signature[0] != "request_measurement":
        return False
    _, measurement_type, unit, location = signature
    for measurement in state.measurements.values():
        if (
            measurement.measurement_type == measurement_type
            and measurement.unit == unit
            and _fold(measurement.location) == location
            and not _evidence_after(state, measurement.id)
        ):
            return True
    return False


def assert_decision_is_not_repetitive(
    state: InvestigationState, decision: AgentDecision
) -> None:
    """Reject an action already tried when no later evidence justifies it."""

    signature = action_signature(decision)
    if signature is None:
        return
    last_match = None
    for event in state.timeline:
        if (
            event.event_type is TimelineEventType.DECISION_RECORDED
            and event.details.get("signature") == signature
        ):
            last_match = event
    if last_match is None:
        if _measurement_repeat_without_later_evidence(state, signature):
            raise DecisionValidationError(
                "repetitive action does not add diagnostic information"
            )
        return
    previous_evidence = set(last_match.details.get("evidence_ids") or [])
    direct_evidence = _direct_evidence(state, last_match.details.get("action_id"))
    new_evidence = set(state.evidence) - previous_evidence - direct_evidence
    if not new_evidence:
        raise DecisionValidationError(
            "repetitive action does not add diagnostic information"
        )


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
