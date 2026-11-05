"""Search public pages for one equipment model, then keep only supported facts.

The model may structure the pages. It must not add a component or a fault
that those pages do not support.
"""

from __future__ import annotations

import json
import re
from html import unescape
from urllib.parse import parse_qs, unquote, urlparse

import httpx

from bintu.core.models import EquipmentDossier

_SEARCH_URL = "https://html.duckduckgo.com/html/"
_TAG = re.compile(r"<[^>]+>")
_RESULT = re.compile(
    r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>.*?class="result__snippet"[^>]*>(.*?)</(?:a|td|div)',
    re.IGNORECASE | re.DOTALL,
)
_PV = re.compile(
    r"panneau|solaire|photovolta|onduleur|\bmc4\b|chaîne pv|chaine pv",
    re.IGNORECASE,
)

_STRUCTURE_PROMPT = """\
You read public search snippets about one piece of equipment.
Return one JSON object:
{"identified_model": "exact model name or null", "composition": ["component"], "frequent_faults": ["fault"]}
Use only facts supported by the snippets. If the specific model is not named, identified_model is null.
If a component or a frequent fault is not supported, leave that list empty.
Write in French. Do not add Markdown or any other text.
"""


def looks_photovoltaic(text: str) -> bool:
    return _PV.search(text) is not None


def research_equipment(problem: str) -> EquipmentDossier:
    query = _query(problem)
    try:
        snippets, sources = _search(query)
    except (httpx.HTTPError, TimeoutError, OSError):
        return EquipmentDossier(query=query, lookup_status="unavailable")
    if not snippets:
        return EquipmentDossier(query=query, lookup_status="unavailable")
    dossier = EquipmentDossier(
        query=query,
        sources=sources,
        snippets=snippets,
        lookup_status="sources_only",
    )
    structured = _structure(problem, snippets)
    if structured is None:
        return dossier
    dossier.identified_model = structured["identified_model"]
    dossier.composition = structured["composition"]
    dossier.frequent_faults = structured["frequent_faults"]
    dossier.lookup_status = "structured"
    return dossier


def _query(problem: str) -> str:
    text = " ".join(problem.split())
    return f"{text[:180]} composition pannes fréquentes"


def _search(query: str) -> tuple[list[str], list[str]]:
    response = httpx.get(
        _SEARCH_URL,
        params={"q": query},
        headers={"User-Agent": "BINTU-diagnostic/0.3"},
        timeout=8.0,
        follow_redirects=True,
    )
    response.raise_for_status()
    snippets: list[str] = []
    sources: list[str] = []
    for href, title, snippet in _RESULT.findall(response.text)[:4]:
        url = _clean_url(href)
        text = _text(f"{title}. {snippet}")
        if not url or not text:
            continue
        sources.append(url)
        snippets.append(text[:400])
    return snippets, sources


def _clean_url(href: str) -> str:
    href = unescape(href)
    parsed = urlparse(href)
    target = parse_qs(parsed.query).get("uddg", [href])[0]
    url = unquote(target)
    if url.startswith("//"):
        url = "https:" + url
    if not url.startswith("https://"):
        return ""
    return url.split("?")[0]


def _text(value: str) -> str:
    return " ".join(_TAG.sub(" ", unescape(value)).split())


def _structure(problem: str, snippets: list[str]) -> dict[str, object] | None:
    try:
        from bintu.core.llm import available_providers, chat_text

        if not available_providers():
            return None
        content = chat_text(
            [
                {"role": "system", "content": _STRUCTURE_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {"problem": problem[:500], "snippets": snippets},
                        ensure_ascii=False,
                    ),
                },
            ],
            timeout=25.0,
        )
    except Exception:
        return None
    if not isinstance(content, str):
        return None
    start = content.find("{")
    if start < 0:
        return None
    try:
        parsed = json.JSONDecoder().raw_decode(content[start:])[0]
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict):
        return None
    model = parsed.get("identified_model")
    composition = _strings(parsed.get("composition"))
    faults = _strings(parsed.get("frequent_faults"))
    identified = model.strip() if isinstance(model, str) and model.strip() else None
    if identified is None and not composition and not faults:
        return None
    return {
        "identified_model": identified,
        "composition": composition[:8],
        "frequent_faults": faults[:8],
    }


def _strings(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    cleaned: list[str] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            cleaned.append(item.strip()[:180])
    return cleaned
