"""Projection of an investigation report from persisted state only."""

from __future__ import annotations

from typing import Any

from bintu_agent_core.models import EvidenceSourceType, InvestigationState


def investigation_report(state: InvestigationState) -> dict[str, Any]:
    """Return only facts already stored in the investigation state."""

    conclusion = state.conclusion
    cited_evidence = []
    if conclusion is not None:
        for evidence_id in conclusion.evidence_ids:
            evidence = state.evidence[evidence_id]
            observation = state.observations[evidence.observation_id]
            cited_evidence.append(
                {
                    "evidence_id": evidence.id,
                    "source_type": evidence.source_type.value,
                    "observation_id": observation.id,
                    "statement": observation.statement,
                    "value": observation.value,
                    "unit": observation.unit,
                }
            )
    return {
        "problem": (
            state.problem.description if state.problem is not None else None
        ),
        "status": state.status.value,
        "collected_information": [
            observation.model_dump(mode="json")
            for observation in state.observations.values()
            if observation.source_type is EvidenceSourceType.TECHNICIAN_ANSWER
        ],
        "observations": [
            observation.model_dump(mode="json")
            for observation in state.observations.values()
        ],
        "evidence": [
            evidence.model_dump(mode="json")
            for evidence in state.evidence.values()
        ],
        "measurements": [
            measurement.model_dump(mode="json")
            for measurement in state.measurements.values()
        ],
        "hypotheses": [
            hypothesis.model_dump(mode="json")
            for hypothesis in state.hypotheses.values()
        ],
        "diagnosis": conclusion.diagnosis if conclusion is not None else None,
        "confidence": conclusion.confidence if conclusion is not None else None,
        "cited_evidence": cited_evidence,
        "remaining_uncertainties": (
            conclusion.remaining_uncertainties if conclusion is not None else []
        ),
        "timeline": [
            {
                "sequence": event.sequence,
                "event_type": event.event_type.value,
                "summary": event.summary,
            }
            for event in state.timeline
        ],
    }
