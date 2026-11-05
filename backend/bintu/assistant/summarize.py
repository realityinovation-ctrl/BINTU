"""Intelligent history compaction when the investigation timeline grows."""

from __future__ import annotations

import json

from bintu.core.models import InvestigationState


SUMMARY_SYSTEM = """\
Tu compactes l'historique d'une investigation technique BINTU.
Produis un résumé factuel en français (4 à 8 phrases max).
Conserve: équipement, symptômes, mesures, réponses technicien, hypothèses encore ouvertes.
N'invente rien. Pas de JSON: texte seul.
"""


def build_timeline_digest(state: InvestigationState, *, max_events: int = 16) -> str:
    events = state.timeline[-max_events:]
    lines = [f"{event.sequence}. [{event.event_type.value}] {event.summary}" for event in events]
    if state.problem is not None:
        lines.insert(0, f"Problème: {state.problem.description}")
    return "\n".join(lines)


def maybe_summarize(
    state: InvestigationState,
    *,
    previous_summary: str,
    threshold: int,
    timeout: float = 30.0,
) -> str:
    if len(state.timeline) < threshold and previous_summary.strip():
        return previous_summary
    if len(state.timeline) < threshold:
        return previous_summary or _fallback_summary(state)

    digest = build_timeline_digest(state)
    try:
        from bintu.core.llm import chat_text

        return chat_text(
            [
                {"role": "system", "content": SUMMARY_SYSTEM},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "previous_summary": previous_summary,
                            "timeline": digest,
                            "entities": state.assistant_context.entity_map(),
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
            timeout=timeout,
        ).strip() or previous_summary or _fallback_summary(state)
    except Exception:
        return previous_summary or _fallback_summary(state)


def _fallback_summary(state: InvestigationState) -> str:
    parts: list[str] = []
    if state.problem is not None:
        parts.append(state.problem.description)
    entities = state.assistant_context.entity_map()
    if entities:
        parts.append(
            "Contexte: "
            + ", ".join(f"{key}={value}" for key, value in sorted(entities.items())[:8])
        )
    open_h = [
        hyp.hypothesis_id.value
        for hyp in state.hypotheses.values()
        if hyp.status.value not in {"eliminated"}
    ]
    if open_h:
        parts.append("Hypothèses ouvertes: " + ", ".join(open_h))
    return " | ".join(parts)[:800]
