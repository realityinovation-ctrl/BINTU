"""Spatial AR annotation — Meta primary (symbols, boxes, tables), Gemini fallback."""

from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

from bintu.core.errors import (
    ProviderConfigurationError,
    ProviderHTTPError,
    ProviderResponseError,
    ProviderTimeoutError,
)
from bintu.core.llm import analyze_image, has_gemini, has_meta, provider_name

GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"

BOX_SYSTEM = """\
Tu es le module de guidage AR de BINTU.
Tu analyses UNE image caméra et tu places des symboles ALIGNÉS précisément
sur ce que tu vois (yeux, tête, voyant, connecteur, tableau de valeurs…).

Réponds UNIQUEMENT avec un JSON valide (pas de markdown) :
{
  "overlays": [
    {
      "type": "box",
      "label": "Yeux",
      "phrase": "Regardez ici",
      "rect": {"x": 0.32, "y": 0.28, "w": 0.36, "h": 0.12},
      "color": "blue"
    },
    {
      "type": "arrow",
      "label": "Vérifier ce point",
      "from": {"x": 0.5, "y": 0.15},
      "to": {"x": 0.5, "y": 0.34},
      "color": "orange"
    },
    {
      "type": "circle",
      "label": "Zone",
      "phrase": "Attention",
      "center": {"x": 0.5, "y": 0.4},
      "radius": 0.08,
      "color": "red"
    },
    {
      "type": "table",
      "label": "Mesures",
      "position": {"x": 0.05, "y": 0.62},
      "headers": ["Point", "Valeur", "Unité"],
      "rows": [["Voc", "380", "V"], ["Isc", "8.2", "A"]],
      "color": "white"
    }
  ]
}

Règles de calage (critiques) :
- rect/from/to/center/position utilisent des fractions 0→1 de l'IMAGE ENVOYÉE
  (x=0 gauche, y=0 haut, w/h largeur/hauteur).
- Pour les YEUX : un seul box serré autour des deux yeux (pas tout le visage).
- Pour la TÊTE : box visage complet.
- Flèche : "from" au-dessus de la cible, "to" sur le centre de la cible, "label" = phrase courte.
- Tableaux : type "table" quand l'utilisateur demande un tableau / valeurs / comparaison.
- Max 5 overlays. Si rien: {"overlays":[]}.
- color: red | orange | blue | white.
"""


def annotate_frame(
    image_b64: str,
    content_type: str,
    hint: str,
    *,
    timeout: float = 35.0,
) -> dict[str, Any]:
    focus = (
        f"Demande: {hint.strip() or 'Cadre précisément les éléments importants.'}\n"
        "Place des symboles bien calés (yeux/tête/objets) et un tableau si utile."
    )
    # Meta is preferred for symbol / table guidance (user stack default).
    errors: list[str] = []
    if has_meta() or provider_name() == "meta":
        try:
            return _via_active_vision(image_b64, content_type, focus, timeout)
        except Exception as exc:  # noqa: BLE001 — fall through to Gemini
            errors.append(f"meta:{exc}")
    if has_gemini():
        try:
            return _via_gemini(image_b64, content_type, focus, timeout)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"gemini:{exc}")
            raise
    if errors:
        raise ProviderHTTPError("; ".join(errors))
    raise ProviderConfigurationError(
        "MODEL_API_KEY (Meta) ou GEMINI_API_KEY requis pour le guidage AR"
    )


def _via_active_vision(
    image_b64: str, content_type: str, focus: str, timeout: float
) -> dict[str, Any]:
    text = analyze_image(
        image_b64,
        content_type or "image/jpeg",
        focus,
        system=BOX_SYSTEM,
        timeout=timeout,
    )
    return _normalize_payload(_parse_json(text))


def _via_gemini(
    image_b64: str, content_type: str, focus: str, timeout: float
) -> dict[str, Any]:
    key = (
        os.environ.get("GEMINI_API_KEY", "").strip()
        or os.environ.get("GOOGLE_API_KEY", "").strip()
    )
    if not key:
        raise ProviderConfigurationError("GEMINI_API_KEY missing")
    model = (
        os.environ.get("GEMINI_VISION_MODEL", "").strip()
        or os.environ.get("GEMINI_MODEL", "").strip()
        or "gemini-3.5-flash-lite"
    )
    try:
        response = httpx.post(
            f"{GEMINI_ENDPOINT}/{model}:generateContent",
            headers={
                "x-goog-api-key": key,
                "Content-Type": "application/json",
            },
            json={
                "systemInstruction": {"parts": [{"text": BOX_SYSTEM}]},
                "contents": [
                    {
                        "role": "user",
                        "parts": [
                            {"text": focus},
                            {
                                "inlineData": {
                                    "mimeType": content_type or "image/jpeg",
                                    "data": image_b64,
                                }
                            },
                        ],
                    }
                ],
                "generationConfig": {
                    "temperature": 0.1,
                    "responseMimeType": "application/json",
                },
            },
            timeout=timeout,
        )
    except httpx.TimeoutException as exc:
        raise ProviderTimeoutError("Vision box request timed out") from exc
    except httpx.RequestError as exc:
        raise ProviderHTTPError("Vision box request failed") from exc
    if response.is_error:
        raise ProviderHTTPError(
            f"Gemini vision returned HTTP status {response.status_code}"
        )
    try:
        parts = response.json()["candidates"][0]["content"]["parts"]
        text = "".join(
            part.get("text", "")
            for part in parts
            if isinstance(part, dict) and not part.get("thought")
        )
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise ProviderResponseError("Gemini vision has no text") from exc
    return _normalize_payload(_parse_json(text))


def _normalize_payload(payload: dict[str, Any]) -> dict[str, Any]:
    overlays = payload.get("overlays")
    if not isinstance(overlays, list):
        overlays = []
    cleaned: list[dict[str, Any]] = []
    for item in overlays[:5]:
        if not isinstance(item, dict):
            continue
        cleaned.append(_normalize_item(item))
    return {"overlays": cleaned, "raw": payload}


def _normalize_item(item: dict[str, Any]) -> dict[str, Any]:
    kind = str(item.get("type") or "box").lower()
    default_color = "white" if kind == "table" else "blue"
    out: dict[str, Any] = {
        "type": kind,
        "label": str(item.get("label") or item.get("cible") or "Cible"),
        "phrase": str(item.get("phrase") or item.get("label") or ""),
        "color": str(item.get("color") or default_color),
    }

    rect = item.get("rect")
    if isinstance(rect, dict):
        out["rect"] = _norm_rect(rect)
    elif isinstance(item.get("box_2d"), list) or isinstance(item.get("box"), list):
        out["rect"] = _rect_from_box2d(item.get("box_2d") or item.get("box") or [])

    if isinstance(item.get("from"), dict) and isinstance(item.get("to"), dict):
        out["from"] = _norm_point(item["from"])
        out["to"] = _norm_point(item["to"])
    elif isinstance(item.get("from_2d"), list) and isinstance(item.get("to_2d"), list):
        out["from"] = _point_from_2d(item["from_2d"])
        out["to"] = _point_from_2d(item["to_2d"])

    if isinstance(item.get("center"), dict):
        out["center"] = _norm_point(item["center"])
        out["radius"] = _clamp01(float(item.get("radius") or 0.08))
    elif isinstance(item.get("center_2d"), list):
        out["center"] = _point_from_2d(item["center_2d"])
        radius = item.get("radius")
        out["radius"] = _clamp01(
            float(radius) / 1000.0 if isinstance(radius, (int, float)) and radius > 1 else float(radius or 0.08)
        )

    if kind == "table":
        pos = item.get("position") if isinstance(item.get("position"), dict) else {"x": 0.04, "y": 0.58}
        out["position"] = _norm_point(pos)
        headers = item.get("headers")
        rows = item.get("rows")
        out["headers"] = [str(h) for h in headers] if isinstance(headers, list) else []
        out["rows"] = [
            [str(cell) for cell in row]
            for row in rows
            if isinstance(row, list)
        ][:6] if isinstance(rows, list) else []

    return out


def _norm_rect(rect: dict[str, Any]) -> dict[str, float]:
    x = _clamp01(float(rect.get("x", 0)))
    y = _clamp01(float(rect.get("y", 0)))
    w = _clamp01(float(rect.get("w", rect.get("width", 0.1))))
    h = _clamp01(float(rect.get("h", rect.get("height", 0.1))))
    return {"x": x, "y": y, "w": max(0.04, w), "h": max(0.04, h)}


def _norm_point(pt: dict[str, Any]) -> dict[str, float]:
    return {
        "x": _clamp01(float(pt.get("x", 0.5))),
        "y": _clamp01(float(pt.get("y", 0.5))),
    }


def _rect_from_box2d(box: list[Any]) -> dict[str, float]:
    """Accept Gemini [ymin,xmin,ymax,xmax] or [xmin,ymin,xmax,ymax] 0-1000/0-1."""

    nums = [float(n) for n in box[:4]]
    if len(nums) < 4:
        return {"x": 0.2, "y": 0.2, "w": 0.3, "h": 0.2}
    a, b, c, d = nums
    # Heuristic: if values > 1, treat as 0-1000 scale.
    scale = 1000.0 if max(nums) > 1.5 else 1.0
    # Gemini standard is y-first when trained for box_2d.
    ymin, xmin, ymax, xmax = a / scale, b / scale, c / scale, d / scale
    # If the "y" span looks wider than x span oddly swapped, still clamp.
    x1, x2 = sorted((xmin, xmax))
    y1, y2 = sorted((ymin, ymax))
    return {
        "x": _clamp01(x1),
        "y": _clamp01(y1),
        "w": max(0.04, _clamp01(x2 - x1)),
        "h": max(0.04, _clamp01(y2 - y1)),
    }


def _point_from_2d(pt: list[Any]) -> dict[str, float]:
    if len(pt) < 2:
        return {"x": 0.5, "y": 0.5}
    a, b = float(pt[0]), float(pt[1])
    scale = 1000.0 if max(a, b) > 1.5 else 1.0
    # Gemini points often [y, x]
    return {"x": _clamp01(b / scale), "y": _clamp01(a / scale)}


def _clamp01(n: float) -> float:
    if n != n:  # NaN
        return 0.0
    return max(0.0, min(1.0, n))


def _parse_json(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            return {"overlays": []}
        try:
            data = json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return {"overlays": []}
    return data if isinstance(data, dict) else {"overlays": []}
