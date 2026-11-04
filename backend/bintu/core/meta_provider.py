"""Thin Muse Spark adapter for the provider-neutral Agent Contract."""

from __future__ import annotations

import json
import math
import os
from typing import Any

import httpx
from pydantic import ValidationError

from bintu.core.errors import (
    ProviderConfigurationError,
    ProviderHTTPError,
    ProviderResponseError,
    ProviderTimeoutError,
)
from bintu.core.models import (
    AgentDecision,
    AskTechnicianArguments,
    EvidenceSourceType,
    InvestigationState,
    ToolName,
)


META_ENDPOINT = "https://api.meta.ai/v1/chat/completions"
DEFAULT_META_MODEL = "muse-spark-1.3"
DEFAULT_TIMEOUT_SECONDS = 60.0
MAX_DECISION_TIMEOUT_SECONDS = 120.0
DECISION_TIMEOUT_ENV = "META_DECISION_TIMEOUT_SECONDS"


def resolve_meta_model() -> str:
    """Chat model id for Meta Muse. Override with META_MODEL in .env."""

    return os.environ.get("META_MODEL", "").strip() or DEFAULT_META_MODEL


# Kept for imports that expect a module-level name; prefer resolve_meta_model().
META_MODEL = DEFAULT_META_MODEL

SYSTEM_PROMPT = """\
You are BINTU: a helpful French field assistant that can run a technical diagnostic.
You select exactly one next tool action, but the text the technician sees
(ask_technician.question) must sound like a real reply to what they just said.

Understand first (critical — never skip):
- Read last_user_utterance and the latest technician answers in the state.
- Answer THAT message before pushing the diagnostic agenda.
- Greetings / “comment ça va” / small talk: answer warmly in French, then
  softly offer help. Do NOT jump to “quel équipement / c’est quoi le souci”.
- If the user repeats that you ignored them, apologize briefly and answer
  their question; do not re-ask equipment.
- Only steer to equipment, symptoms, camera or measurement AFTER you have
  acknowledged their words, or when they clearly describe a fault.

Conversation style:
- Fluid oral French, one idea at a time, max ~25 words in ask_technician.question.
- No English. No forms. No nameplate nagging on first turns.
- If the model is unknown, prefer symptoms / camera / a useful measurement.
- Ask the nameplate at most once, only if it truly unlocks the next step.

Contextual memory:
- Reuse assistant_context entities (site, sector, equipment, symptoms).
- Never re-ask a fact already known.

When equipment_dossier is present, treat it as public pages about that equipment.
Do not invent a model, component, or frequent fault.
Return one JSON object matching the AgentDecision schema.
Do not add observations or evidence. Do not modify hypotheses or state.
You may propose hypothesis_updates; the backend validates them.
Do not include chain-of-thought. reason = short French operational note.
"""


def resolve_decision_timeout(explicit: float | None = None) -> float:
    """Return a finite decision timeout, never an unbounded wait."""

    if explicit is None:
        raw = os.environ.get(DECISION_TIMEOUT_ENV, "").strip()
        if not raw:
            return DEFAULT_TIMEOUT_SECONDS
        try:
            explicit = float(raw)
        except ValueError as exc:
            raise ProviderConfigurationError(
                f"{DECISION_TIMEOUT_ENV} must be a positive number of seconds"
            ) from exc
    if (
        isinstance(explicit, bool)
        or not isinstance(explicit, (int, float))
        or not math.isfinite(explicit)
        or explicit <= 0
        or explicit > MAX_DECISION_TIMEOUT_SECONDS
    ):
        raise ProviderConfigurationError(
            f"{DECISION_TIMEOUT_ENV} must be greater than 0 and at most "
            f"{MAX_DECISION_TIMEOUT_SECONDS:g}"
        )
    return float(explicit)


class MetaAIProvider:
    """Translate one Muse Spark completion into one AgentDecision."""

    def __init__(
        self,
        *,
        client: httpx.Client | None = None,
        timeout_seconds: float | None = None,
    ) -> None:
        api_key = os.environ.get("MODEL_API_KEY", "")
        self._api_key = api_key
        if client is None:
            timeout_seconds = resolve_decision_timeout(timeout_seconds)
            self._client = httpx.Client(timeout=timeout_seconds)
            self._owns_client = True
        else:
            self._client = client
            self._owns_client = False
        self._timeout_seconds = timeout_seconds

    def decide_next(self, state: InvestigationState) -> AgentDecision:
        memory_brief = state.assistant_context.brief()
        last_user = _last_user_utterance(state)
        request_messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "agent_decision_schema": AgentDecision.model_json_schema(),
                        "last_user_utterance": last_user,
                        "reply_rule": (
                            "ask_technician.question must first answer "
                            "last_user_utterance; do not ignore it."
                        ),
                        "assistant_memory_brief": memory_brief,
                        "investigation_state": state.model_dump(mode="json"),
                    },
                    ensure_ascii=False,
                ),
            },
        ]
        from bintu.core.llm import chat_text

        content = chat_text(request_messages, timeout=self._timeout_seconds or 60.0)
        payload = self._parse_decision_json(content)
        self._validate_top_level_fields(payload)
        try:
            ToolName(payload["tool_name"])
        except ValueError as exc:
            raise ProviderResponseError(
                f"unknown tool_name: {payload['tool_name']!r}"
            ) from exc
        try:
            decision = AgentDecision.model_validate(payload)
        except ValidationError as exc:
            details = exc.errors(include_url=False, include_input=False)
            raise ProviderResponseError(
                f"invalid AgentDecision: {details}"
            ) from exc
        return _soft_ground_decision(decision, last_user)

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> MetaAIProvider:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    @staticmethod
    def _extract_content(response: httpx.Response) -> str:
        try:
            body = response.json()
            content = body["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise ProviderResponseError(
                "Meta response does not contain choices[0].message.content"
            ) from exc
        if not isinstance(content, str) or not content.strip():
            raise ProviderResponseError("Meta response content must be a non-empty string")
        return content

    @staticmethod
    def _parse_decision_json(content: str) -> dict[str, Any]:
        stripped = content.strip()
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            parsed = MetaAIProvider._extract_single_embedded_object(stripped)
        if not isinstance(parsed, dict):
            raise ProviderResponseError("decision JSON must be an object")
        return parsed

    @staticmethod
    def _extract_single_embedded_object(content: str) -> dict[str, Any]:
        start = content.find("{")
        if start < 0:
            raise ProviderResponseError("Meta response content is not valid JSON")
        decoder = json.JSONDecoder()
        try:
            parsed, consumed = decoder.raw_decode(content[start:])
        except json.JSONDecodeError as exc:
            raise ProviderResponseError(
                "Meta response content is not valid JSON"
            ) from exc
        suffix = content[start + consumed :]
        if "{" in suffix or "}" in suffix:
            raise ProviderResponseError(
                "Meta response contains more than one JSON object"
            )
        if not isinstance(parsed, dict):
            raise ProviderResponseError("decision JSON must be an object")
        return parsed

    @staticmethod
    def _validate_top_level_fields(payload: dict[str, Any]) -> None:
        for field in ("tool_name", "arguments", "reason"):
            if field not in payload:
                raise ProviderResponseError(f"missing required field: {field}")


def _last_user_utterance(state: InvestigationState) -> str:
    for observation in reversed(list(state.observations.values())):
        if observation.source_type is EvidenceSourceType.TECHNICIAN_ANSWER:
            return observation.statement
    recent = state.assistant_context.recent_utterances
    if recent:
        return recent[-1]
    if state.problem is not None:
        return state.problem.description
    return ""


def _looks_like_chitchat(text: str) -> bool:
    folded = " ".join(text.lower().split())
    if not folded:
        return False
    cues = (
        "comment vas",
        "comment ça va",
        "comment ca va",
        "ça va",
        "ca va",
        "how are you",
        "bonjour",
        "salut",
        "hello",
        "merci",
        "who are you",
        "qui es-tu",
        "tu es qui",
    )
    if any(cue in folded for cue in cues):
        # Pure social turn, or social + no clear fault vocabulary.
        faultish = (
            "panne",
            "défaut",
            "defaut",
            "erreur",
            "onduleur",
            "panneau",
            "mesure",
            "volt",
            "bruit",
            "chaud",
            "ne marche",
            "plus",
        )
        return not any(token in folded for token in faultish) or folded.count(" ") < 8
    return False


def _looks_like_equipment_push(question: str) -> bool:
    folded = " ".join(question.lower().split())
    pushes = (
        "équipement",
        "equipement",
        "souci",
        "problème",
        "probleme",
        "quel appareil",
        "quelle machine",
        "c'est quoi le",
        "décrivez",
        "decrivez",
    )
    return any(token in folded for token in pushes)


def _soft_ground_decision(decision: AgentDecision, last_user: str) -> AgentDecision:
    """If the model ignores a social turn, rewrite ask_technician to answer it."""

    if decision.tool_name is not ToolName.ASK_TECHNICIAN:
        return decision
    if not isinstance(decision.arguments, AskTechnicianArguments):
        return decision
    if not _looks_like_chitchat(last_user):
        return decision
    if not _looks_like_equipment_push(decision.arguments.question):
        return decision
    reply = (
        "Ça va bien, merci ! Je suis BINTU. "
        "Dites-moi quand vous voulez qu’on regarde un équipement."
    )
    return decision.model_copy(
        update={
            "arguments": decision.arguments.model_copy(update={"question": reply}),
            "reason": "Réponse d’abord à la question de l’utilisateur.",
        }
    )
