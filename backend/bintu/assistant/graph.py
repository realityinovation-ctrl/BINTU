"""LangGraph state machine for contextual memory (with pure-Python fallback)."""

from __future__ import annotations

from typing import Any, TypedDict

from bintu.assistant.config import summary_event_threshold
from bintu.assistant.extract import extract_entities
from bintu.assistant.memory_store import MemoryBackend, get_memory_backend
from bintu.assistant.summarize import maybe_summarize
from bintu.core.models import AssistantContext, ExtractedEntity, InvestigationState


class GraphState(TypedDict, total=False):
    investigation_id: str
    utterance: str
    known_entities: dict[str, str]
    extracted: dict[str, ExtractedEntity]
    memories: list[str]
    working_summary: str
    recent_utterances: list[str]
    turn_count: int
    timeline_len: int
    memory_backend: str
    investigation: InvestigationState
    light: bool


def run_assistant_graph(
    state: InvestigationState,
    utterance: str,
    *,
    memory: MemoryBackend | None = None,
    light: bool = False,
) -> AssistantContext:
    """Run extract → memory → summarize → write-back as a state graph.

    ``light=True`` (espace d'attente Live): heuristics + mémoire locale only —
    no extraction/summary LLM calls, to save tokens and keep fluidity.
    """

    backend = memory or get_memory_backend()
    seed: GraphState = {
        "investigation_id": state.investigation_id,
        "utterance": utterance,
        "known_entities": state.assistant_context.entity_map(),
        "extracted": {},
        "memories": list(state.assistant_context.long_term_notes),
        "working_summary": state.assistant_context.working_summary,
        "recent_utterances": list(state.assistant_context.recent_utterances),
        "turn_count": state.assistant_context.turn_count,
        "timeline_len": len(state.timeline),
        "memory_backend": backend.name,
        "investigation": state,
        "light": light,
    }

    if light:
        final = _run_linear(seed, backend, light=True)
    else:
        compiled = _compile_graph(backend)
        if compiled is not None:
            final = compiled.invoke(seed)
        else:
            final = _run_linear(seed, backend, light=False)

    return _to_assistant_context(final, backend.name)


def _compile_graph(backend: MemoryBackend) -> Any | None:
    try:
        from langgraph.graph import END, StateGraph
    except ImportError:
        return None

    graph: Any = StateGraph(GraphState)
    graph.add_node("extract_entities", lambda s: _node_extract(s, use_llm=True))
    graph.add_node("update_memory", lambda s: _node_update_memory(s, backend))
    graph.add_node("retrieve_memory", lambda s: _node_retrieve(s, backend))
    graph.add_node("maybe_summarize", lambda s: _node_summarize(s))
    graph.set_entry_point("extract_entities")
    graph.add_edge("extract_entities", "update_memory")
    graph.add_edge("update_memory", "retrieve_memory")
    graph.add_edge("retrieve_memory", "maybe_summarize")
    graph.add_edge("maybe_summarize", END)
    return graph.compile()


def _run_linear(
    seed: GraphState, backend: MemoryBackend, *, light: bool
) -> GraphState:
    current = dict(seed)
    current.update(_node_extract(current, use_llm=not light))
    current.update(_node_update_memory(current, backend))
    current.update(_node_retrieve(current, backend))
    if not light:
        current.update(_node_summarize(current))
    return current  # type: ignore[return-value]


def _node_extract(state: GraphState, *, use_llm: bool = True) -> dict[str, Any]:
    utterance = (state.get("utterance") or "").strip()
    if not utterance:
        return {"extracted": {}}
    extracted = extract_entities(
        utterance,
        known=state.get("known_entities") or {},
        use_llm=use_llm,
    )
    return {"extracted": extracted}


def _node_update_memory(state: GraphState, backend: MemoryBackend) -> dict[str, Any]:
    user_id = state.get("investigation_id") or "anonymous"
    utterance = (state.get("utterance") or "").strip()
    extracted = state.get("extracted") or {}
    known = dict(state.get("known_entities") or {})

    for key, entity in extracted.items():
        known[key] = entity.value
        backend.add(
            f"{key}: {entity.value}",
            user_id=user_id,
            metadata={"key": key, "source": entity.source},
        )

    if utterance:
        # Store the raw turn so later retrieval can recall phrasing, not only keys.
        facts = ", ".join(f"{k}={v}" for k, v in sorted(known.items()))
        note = utterance if not facts else f"{utterance} | contexte: {facts}"
        backend.add(note, user_id=user_id, metadata={"kind": "utterance"})

    recent = list(state.get("recent_utterances") or [])
    if utterance:
        recent = (recent + [utterance])[-8:]

    return {
        "known_entities": known,
        "recent_utterances": recent,
        "turn_count": int(state.get("turn_count") or 0) + (1 if utterance else 0),
        "memory_backend": backend.name,
    }


def _node_retrieve(state: GraphState, backend: MemoryBackend) -> dict[str, Any]:
    user_id = state.get("investigation_id") or "anonymous"
    query = (state.get("utterance") or "").strip()
    if not query:
        known = state.get("known_entities") or {}
        query = " ".join(f"{k} {v}" for k, v in known.items()) or "diagnostic"
    hits = backend.search(query, user_id=user_id, limit=6)
    notes = []
    seen: set[str] = set()
    for hit in hits:
        text = hit.text.strip()
        if text and text not in seen:
            seen.add(text)
            notes.append(text)
    return {"memories": notes[:8]}


def _node_summarize(state: GraphState) -> dict[str, Any]:
    investigation = state.get("investigation")
    if investigation is None:
        return {"working_summary": state.get("working_summary") or ""}
    summary = maybe_summarize(
        investigation,
        previous_summary=state.get("working_summary") or "",
        threshold=summary_event_threshold(),
    )
    return {"working_summary": summary}


def _to_assistant_context(final: GraphState, backend_name: str) -> AssistantContext:
    known = final.get("known_entities") or {}
    extracted = final.get("extracted") or {}
    entities: dict[str, ExtractedEntity] = {}
    for key, value in known.items():
        prior = extracted.get(key)
        entities[key] = prior or ExtractedEntity(
            key=key,
            value=value,
            confidence=0.8,
            source="memory",
        )
    return AssistantContext(
        entities=entities,
        working_summary=(final.get("working_summary") or "").strip(),
        long_term_notes=list(final.get("memories") or [])[:8],
        recent_utterances=list(final.get("recent_utterances") or [])[-8:],
        turn_count=int(final.get("turn_count") or 0),
        memory_backend=str(final.get("memory_backend") or backend_name),
    )
