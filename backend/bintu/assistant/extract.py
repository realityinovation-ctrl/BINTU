"""Entity extraction from technician utterances (AutoGen-style memory analysis)."""

from __future__ import annotations

import json
import re
from typing import Any

from bintu.core.models import ExtractedEntity

ENTITY_KEYS = (
    "site_location",
    "city",
    "country",
    "sector",
    "equipment_type",
    "equipment_model",
    "manufacturer",
    "symptom",
    "environment",
    "customer",
    "technician_role",
    "voltage_system",
    "project",
)

EXTRACT_SYSTEM = """\
Tu es le module d'analyse contextuelle de BINTU (séparé de la réponse diagnostic).
Extrais uniquement les faits durables utiles au diagnostic technique.
Réponds avec un JSON object plat: chaque clé est une entité, chaque valeur une chaîne courte.
Clés autorisées: site_location, city, country, sector, equipment_type, equipment_model,
manufacturer, symptom, environment, customer, technician_role, voltage_system, project.
N'invente rien. Si aucune entité nouvelle: {}.
"""


def extract_entities(
    utterance: str,
    *,
    known: dict[str, str] | None = None,
    timeout: float = 25.0,
    use_llm: bool = True,
) -> dict[str, ExtractedEntity]:
    text = " ".join(utterance.split())
    if not text:
        return {}

    heuristic = _heuristic_entities(text)
    if not use_llm:
        return heuristic
    try:
        from bintu.core.llm import chat_text

        payload = {
            "utterance": text,
            "already_known": known or {},
            "instruction": "Return only NEW or UPDATED entities as a flat JSON object.",
        }
        raw = chat_text(
            [
                {"role": "system", "content": EXTRACT_SYSTEM},
                {
                    "role": "user",
                    "content": json.dumps(payload, ensure_ascii=False),
                },
            ],
            timeout=timeout,
        )
        parsed = _parse_json_object(raw)
        for key, value in parsed.items():
            if key not in ENTITY_KEYS:
                continue
            cleaned = " ".join(str(value).split())
            if cleaned:
                heuristic[key] = ExtractedEntity(
                    key=key,
                    value=cleaned[:180],
                    confidence=0.85,
                    source="llm",
                )
    except Exception:
        # Heuristics alone are enough to keep the pipeline alive.
        pass
    return heuristic


def _heuristic_entities(text: str) -> dict[str, ExtractedEntity]:
    found: dict[str, ExtractedEntity] = {}
    lower = text.lower()

    city = _match_group(
        r"\b(?:à|a|sur|site\s+de|bas[ée]e?\s+[àa])\s+([A-ZÀ-Ý][\wÀ-ÿ'-]{2,})",
        text,
    )
    if city:
        found["city"] = ExtractedEntity(key="city", value=city, confidence=0.6, source="heuristic")
        found["site_location"] = ExtractedEntity(
            key="site_location", value=city, confidence=0.55, source="heuristic"
        )

    for label, pattern in (
        ("fintech", r"\bfintech\b"),
        ("photovoltaique", r"\b(photovolta[iï]que|pv|panneaux?\s+solaires?)\b"),
        ("onduleur", r"\b(onduleur|inverter)\b"),
        ("groupe electrogene", r"\b(groupe\s+[ée]lectrog[eè]ne|generatrice)\b"),
    ):
        if re.search(pattern, lower):
            key = "sector" if label == "fintech" else "equipment_type"
            found[key] = ExtractedEntity(
                key=key,
                value=label,
                confidence=0.7,
                source="heuristic",
            )

    project = _match_group(
        r"\b(?:projet|installation)\s*(?:est|:)?\s*(?:une?|un)?\s*([^\n.,;]{3,60})",
        text,
        flags=re.IGNORECASE,
    )
    if project:
        found["project"] = ExtractedEntity(
            key="project",
            value=project.strip()[:120],
            confidence=0.55,
            source="heuristic",
        )
    return found


def _match_group(pattern: str, text: str, flags: int = 0) -> str | None:
    match = re.search(pattern, text, flags)
    if not match:
        return None
    return match.group(1).strip()


def _parse_json_object(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            return {}
        try:
            payload = json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return {}
    if not isinstance(payload, dict):
        return {}
    return payload
