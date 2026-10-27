"""Backend-enforced decision and electrical-safety guardrails."""

from __future__ import annotations

import json
import unicodedata

from bintu_agent_core.errors import (
    DecisionValidationError,
    SafetyViolationError,
)
from bintu_agent_core.models import (
    AgentDecision,
    CompareMeasurementsArguments,
    EvidenceRelation,
    FinishInvestigationArguments,
    GenerateReportArguments,
    HypothesisStatus,
    InvestigationState,
)


ALLOWED_HYPOTHESIS_TRANSITIONS: dict[
    HypothesisStatus, set[HypothesisStatus]
] = {
    HypothesisStatus.UNEXPLORED: {
        HypothesisStatus.PLAUSIBLE,
        HypothesisStatus.SUPPORTED,
        HypothesisStatus.WEAKENED,
        HypothesisStatus.ELIMINATED,
    },
    HypothesisStatus.PLAUSIBLE: {
        HypothesisStatus.SUPPORTED,
        HypothesisStatus.WEAKENED,
        HypothesisStatus.ELIMINATED,
    },
    HypothesisStatus.SUPPORTED: {
        HypothesisStatus.WEAKENED,
        HypothesisStatus.ELIMINATED,
    },
    HypothesisStatus.WEAKENED: {
        HypothesisStatus.PLAUSIBLE,
        HypothesisStatus.SUPPORTED,
        HypothesisStatus.ELIMINATED,
    },
    HypothesisStatus.ELIMINATED: set(),
}


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

    known_evidence = set(state.evidence)
    for update in decision.arguments.hypothesis_updates:
        hypothesis = state.hypotheses[update.hypothesis_id]
        if update.new_status is not hypothesis.status:
            allowed = ALLOWED_HYPOTHESIS_TRANSITIONS[hypothesis.status]
            if update.new_status not in allowed:
                raise DecisionValidationError(
                    f"invalid hypothesis transition: "
                    f"{hypothesis.status.value} -> {update.new_status.value}"
                )
        unknown_ids = set(update.evidence_ids) - known_evidence
        if unknown_ids:
            raise DecisionValidationError(
                f"hypothesis update references unknown evidence: {sorted(unknown_ids)}"
            )
        if (
            update.new_status is HypothesisStatus.ELIMINATED
            and (
                update.evidence_relation is not EvidenceRelation.CONTRADICTORY
                or not update.evidence_ids
            )
        ):
            raise DecisionValidationError(
                "eliminating a hypothesis requires contradictory evidence"
            )

    arguments = decision.arguments
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
        unknown_evidence = set(arguments.evidence) - known_evidence
        if unknown_evidence:
            raise DecisionValidationError(
                f"conclusion references unknown evidence: {sorted(unknown_evidence)}"
            )

    if (
        isinstance(arguments, GenerateReportArguments)
        and arguments.investigation_id != state.investigation_id
    ):
        raise DecisionValidationError(
            "report investigation_id does not match the current investigation"
        )

    validate_safety(decision)
