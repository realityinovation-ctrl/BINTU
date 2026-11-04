"""Public hook: enrich InvestigationState before each AI decision."""

from __future__ import annotations

from bintu.assistant.config import assistant_enabled, mem0_enabled
from bintu.assistant.graph import run_assistant_graph
from bintu.assistant.memory_store import LocalJsonMemory, get_memory_backend
from bintu.core.models import EvidenceSourceType, InvestigationState


def enrich_before_decision(
    state: InvestigationState,
    *,
    utterance: str | None = None,
    light: bool = False,
) -> InvestigationState:
    """Accumulate entities + long-term notes onto ``state.assistant_context``.

    Safe to call on every advance: disabled via env, or failures never abort
    the diagnostic loop. ``light=True`` keeps the wait-space fluid (no LLM).
    """

    if not assistant_enabled():
        return state
    try:
        text = (utterance if utterance is not None else _latest_utterance(state)).strip()
        # Seed first turn from the problem statement when no technician reply yet.
        if not text and state.problem is not None and state.assistant_context.turn_count == 0:
            text = state.problem.description
        if not text and state.assistant_context.entities:
            # Still refresh retrieval/summary even without a new utterance.
            text = ""
        context = run_assistant_graph(state, text, light=light)
        state.assistant_context = context
        _mirror_entities_into_system(state)
    except Exception:
        # Contextual memory must never break a field diagnostic.
        return state
    return state


def absorb_in_waiting(
    state: InvestigationState,
    utterance: str,
) -> InvestigationState:
    """Stay in waiting_for_technician: memory only, zero decision tokens."""

    return enrich_before_decision(state, utterance=utterance, light=True)


def memory_status() -> dict[str, object]:
    backend_name = "off"
    if assistant_enabled():
        try:
            backend_name = get_memory_backend().name
        except Exception:
            backend_name = LocalJsonMemory.name
    return {
        "enabled": assistant_enabled(),
        "backend": backend_name,
        "mem0_requested": mem0_enabled(),
        "langgraph": _langgraph_available(),
        "architecture": [
            "extract_entities",
            "update_memory",
            "retrieve_memory",
            "maybe_summarize",
        ],
    }


def _latest_utterance(state: InvestigationState) -> str:
    for observation in reversed(list(state.observations.values())):
        if observation.source_type is EvidenceSourceType.TECHNICIAN_ANSWER:
            return observation.statement
    if state.timeline:
        last = state.timeline[-1]
        if last.event_type.value in {"action_resumed", "observation_added"}:
            return last.summary
    return ""


def _mirror_entities_into_system(state: InvestigationState) -> None:
    """Promote durable entities into DiagnosticSystem when still empty."""

    entities = state.assistant_context.entity_map()
    if not state.system.model and entities.get("equipment_model"):
        state.system.model = entities["equipment_model"]
    if not state.system.manufacturer and entities.get("manufacturer"):
        state.system.manufacturer = entities["manufacturer"]
    equipment_type = entities.get("equipment_type")
    if equipment_type and state.system.type in {
        "photovoltaic_installation",
        "equipment",
        "",
    }:
        state.system.type = equipment_type
    sector = entities.get("sector")
    if sector:
        state.system.characteristics["sector"] = sector
    city = entities.get("city") or entities.get("site_location")
    if city:
        state.system.characteristics["site_location"] = city
    project = entities.get("project")
    if project:
        state.system.characteristics["project"] = project


def _langgraph_available() -> bool:
    try:
        import langgraph  # noqa: F401

        return True
    except ImportError:
        return False
