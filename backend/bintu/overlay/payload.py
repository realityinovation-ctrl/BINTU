"""Build the AR overlay contract from an investigation. Coordinates are normalized anchors."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from bintu.core.measurement_catalog import MEASUREMENT_CATALOG
from bintu.core.models import (
    AnalyzeImageArguments,
    AskTechnicianArguments,
    HypothesisStatus,
    InvestigationState,
    RequestMeasurementArguments,
)

HYPOTHESIS_LABELS = {
    "H0": "Conditions normales",
    "H1": "Panneaux ou environnement",
    "H2": "Chaîne électrique",
    "H3": "Stockage ou conversion",
}

_STATUS_RANK = {
    HypothesisStatus.SUPPORTED: 4,
    HypothesisStatus.PLAUSIBLE: 3,
    HypothesisStatus.WEAKENED: 2,
    HypothesisStatus.UNEXPLORED: 1,
    HypothesisStatus.ELIMINATED: 0,
}

_STATUS_CONFIDENCE = {
    HypothesisStatus.SUPPORTED: 0.72,
    HypothesisStatus.PLAUSIBLE: 0.48,
    HypothesisStatus.WEAKENED: 0.28,
    HypothesisStatus.UNEXPLORED: 0.12,
    HypothesisStatus.ELIMINATED: 0.05,
}

_MEASUREMENT_ANCHORS = {
    "dc_voltage": (0.28, 0.24, 0.24, 0.18, "Bornes DC"),
    "dc_current": (0.28, 0.46, 0.24, 0.16, "Courant de chaîne"),
    "ac_voltage": (0.58, 0.30, 0.22, 0.18, "Sortie AC"),
    "ac_current": (0.58, 0.52, 0.22, 0.16, "Courant AC"),
    "ac_power": (0.58, 0.40, 0.22, 0.16, "Puissance AC"),
}

_FORMULAS = {
    "dc_voltage": "V_{DC}",
    "dc_current": "I_{DC}",
    "ac_voltage": "V_{AC}",
    "ac_current": "I_{AC}",
    "ac_power": "P_{AC}",
}


class OverlayPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step_id: str
    confidence_score: float = Field(ge=0, le=1)
    hypothesis: str
    overlay_instructions: dict[str, Any]
    action_required: dict[str, Any]


def build_overlay(state: InvestigationState) -> OverlayPayload:
    """Return the JSON the mobile canvas draws. Anchors are guidance, not detected pixels."""

    pending = state.pending_action
    elements: list[dict[str, Any]] = []
    action: dict[str, Any] = {"type": "NONE", "prompt": "Observation en cours", "unit": None}

    if pending is not None and isinstance(pending.decision.arguments, RequestMeasurementArguments):
        arguments = pending.decision.arguments
        anchor = _MEASUREMENT_ANCHORS.get(
            arguments.measurement_type,
            (0.36, 0.34, 0.22, 0.16, arguments.location),
        )
        x, y, width, height, zone = anchor
        # Rouge = cadrer le problème. Orange = vérifier. Bleu/blanc = texte d'aide.
        elements.append(_box(f"box_{arguments.measurement_type}", zone, x, y, width, height, "#FF3B30"))
        elements.append(
            _arrow(
                x + width / 2,
                min(0.92, y + height + 0.16),
                x + width / 2,
                y + height,
                f"Vérifier : {arguments.location}",
            )
        )
        spec = MEASUREMENT_CATALOG.get(arguments.measurement_type)
        label = spec.label if spec is not None else arguments.measurement_type
        elements.append(
            _formula(
                0.28,
                0.68,
                label,
                _FORMULAS.get(arguments.measurement_type, arguments.unit),
                f"Saisir la valeur en {arguments.unit}",
            )
        )
        if arguments.unit in {"V", "A"}:
            elements.append(
                _bubble(0.08, 0.08, "Sécurité", "Ne pas ouvrir un conducteur sous tension.")
            )
        action = {
            "type": "MEASUREMENT_REQUEST",
            "prompt": f"Mesurer {label.lower()} — {arguments.location}",
            "unit": arguments.unit,
        }
    elif pending is not None and isinstance(pending.decision.arguments, AnalyzeImageArguments):
        focus = pending.decision.arguments.focus
        short = focus if len(focus) <= 42 else f"{focus[:39]}..."
        elements.append(_box("box_focus", short, 0.24, 0.18, 0.42, 0.30, "#FF3B30"))
        elements.append(_arrow(0.52, 0.58, 0.45, 0.48, "Contrôler / vérifier"))
        elements.append(
            _formula(0.28, 0.64, "Repère", "observation", short)
        )
        elements.append(_bubble(0.06, 0.06, "Aide", focus))
        action = {
            "type": "IMAGE_REQUEST",
            "prompt": f"Montrer : {focus}",
            "unit": None,
        }
    elif pending is not None and isinstance(pending.decision.arguments, AskTechnicianArguments):
        question = pending.decision.arguments.question
        elements.append(_bubble(0.12, 0.16, "Question", question))
        elements.append(_arrow(0.22, 0.40, 0.40, 0.48, "Répondre sur place"))
        action = {"type": "TECHNICIAN_ANSWER", "prompt": question, "unit": None}
    elif state.conclusion is not None:
        elements.append(
            _formula(
                0.18,
                0.62,
                "Diagnostic retenu",
                "conclusion",
                state.conclusion.diagnosis,
            )
        )
        action = {
            "type": "NONE",
            "prompt": "Diagnostic enregistré",
            "unit": None,
        }

    step_id = pending.action_id if pending is not None else f"step_{state.step_count:03d}"
    return OverlayPayload(
        step_id=step_id,
        confidence_score=_confidence(state),
        hypothesis=_hypothesis(state),
        overlay_instructions={
            "frame_dimensions": {"width": 1920, "height": 1080},
            "coordinate_space": "normalized",
            "elements": elements,
        },
        action_required=action,
    )


def _hypothesis(state: InvestigationState) -> str:
    if state.conclusion is not None and state.conclusion.diagnosis:
        return state.conclusion.diagnosis
    leading = max(
        state.hypotheses.values(),
        key=lambda item: _STATUS_RANK[item.status],
    )
    label = HYPOTHESIS_LABELS[leading.hypothesis_id.value]
    if leading.status is HypothesisStatus.UNEXPLORED and state.problem is not None:
        return state.problem.description
    return f"{label} — {leading.status.value}"


def _confidence(state: InvestigationState) -> float:
    if state.conclusion is not None:
        return round(state.conclusion.confidence, 4)
    leading = max(
        state.hypotheses.values(),
        key=lambda item: _STATUS_RANK[item.status],
    )
    return _STATUS_CONFIDENCE[leading.status]


def _box(
    element_id: str,
    label: str,
    x: float,
    y: float,
    width: float,
    height: float,
    color: str,
) -> dict[str, Any]:
    return {
        "type": "BOUNDING_BOX",
        "id": element_id,
        "label": label,
        "coordinates": {
            "x": round(x, 4),
            "y": round(y, 4),
            "width": round(width, 4),
            "height": round(height, 4),
        },
        "style": {"color": color, "strokeWidth": 3},
    }


def _arrow(x1: float, y1: float, x2: float, y2: float, label: str) -> dict[str, Any]:
    return {
        "type": "ARROW",
        "from": {"x": round(x1, 4), "y": round(y1, 4)},
        "to": {"x": round(x2, 4), "y": round(y2, 4)},
        "label": label,
        "style": {"color": "#FF9500", "strokeWidth": 2, "dashPattern": [4, 4]},
    }


def _formula(x: float, y: float, title: str, formula: str, expected: str) -> dict[str, Any]:
    return {
        "type": "FORMULA_BOX",
        "position": {"x": round(x, 4), "y": round(y, 4)},
        "title": title,
        "formula_latex": formula,
        "value_expected": expected,
        "style": {"color": "#1769FF", "tone": "info"},
    }


def _bubble(x: float, y: float, title: str, text: str) -> dict[str, Any]:
    return {
        "type": "INFO_BUBBLE",
        "position": {"x": round(x, 4), "y": round(y, 4)},
        "title": title,
        "text": text,
        "style": {"color": "#FFFFFF", "tone": "note"},
    }
