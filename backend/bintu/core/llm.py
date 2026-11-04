"""Route diagnostic calls to ChatGPT, Gemini or Meta according to .env."""

from __future__ import annotations

import os
from typing import Any, Literal

import httpx

from bintu.core.errors import (
    ProviderConfigurationError,
    ProviderHTTPError,
    ProviderResponseError,
    ProviderTimeoutError,
)
from bintu.core.meta_provider import META_ENDPOINT, resolve_meta_model

OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions"
GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"

ProviderKind = Literal["openai", "gemini", "meta"]

_ALIASES = {
    "chatgpt": "openai",
    "openai": "openai",
    "gpt": "openai",
    "gemini": "gemini",
    "google": "gemini",
    "meta": "meta",
    "muse": "meta",
}


def _env(name: str) -> str:
    return os.environ.get(name, "").strip()


def has_openai() -> bool:
    return bool(_env("OPENAI_API_KEY"))


def has_gemini() -> bool:
    return bool(_env("GEMINI_API_KEY") or _env("GOOGLE_API_KEY"))


def has_meta() -> bool:
    return bool(_env("MODEL_API_KEY"))


def available_providers() -> list[ProviderKind]:
    found: list[ProviderKind] = []
    if has_openai():
        found.append("openai")
    if has_gemini():
        found.append("gemini")
    if has_meta():
        found.append("meta")
    return found


def _required_key(kind: ProviderKind) -> str:
    if kind == "openai":
        return "OPENAI_API_KEY"
    if kind == "gemini":
        return "GEMINI_API_KEY"
    return "MODEL_API_KEY"


def _has_key(kind: ProviderKind) -> bool:
    if kind == "openai":
        return has_openai()
    if kind == "gemini":
        return has_gemini()
    return has_meta()


def provider_name() -> ProviderKind:
    """Return the active diagnostic provider.

    Priority:
    1. ``BINTU_AI_PROVIDER`` = chatgpt | openai | gemini | meta
    2. First key present: Meta (default stack), then Gemini, then OpenAI
    """

    explicit = _env("BINTU_AI_PROVIDER").lower()
    if explicit:
        kind = _ALIASES.get(explicit)
        if kind is None:
            raise ProviderConfigurationError(
                "BINTU_AI_PROVIDER must be chatgpt, gemini or meta"
            )
        if not _has_key(kind):
            raise ProviderConfigurationError(
                f"{_required_key(kind)} is required when BINTU_AI_PROVIDER={explicit}"
            )
        return kind
    if has_meta():
        return "meta"
    if has_gemini():
        return "gemini"
    if has_openai():
        return "openai"
    raise ProviderConfigurationError(
        "Ajoutez OPENAI_API_KEY (ChatGPT), GEMINI_API_KEY (Gemini) "
        "ou MODEL_API_KEY (Meta), puis réglez BINTU_AI_PROVIDER si besoin."
    )


def provider_label(kind: ProviderKind | None = None) -> str:
    active = kind or provider_name()
    return {
        "openai": "ChatGPT",
        "gemini": "Gemini",
        "meta": "Meta",
    }[active]


def provider_status() -> dict[str, Any]:
    """Public status without exposing secrets."""

    try:
        active = provider_name()
        active_error = None
    except ProviderConfigurationError as exc:
        active = None
        active_error = str(exc)
    return {
        "active": active,
        "label": provider_label(active) if active else None,
        "error": active_error,
        "available": available_providers(),
        "configured": {
            "openai": has_openai(),
            "gemini": has_gemini(),
            "meta": has_meta(),
        },
        "models": {
            "openai": _env("OPENAI_MODEL") or "gpt-4o-mini",
            "gemini": _env("GEMINI_MODEL") or "gemini-3.5-flash-lite",
            "gemini_live": _env("GEMINI_LIVE_MODEL")
            or "gemini-2.5-flash-native-audio-preview-12-2025",
            "meta": resolve_meta_model(),
        },
        "live": {
            "provider": "gemini",
            "ready": has_gemini(),
            "note": "Le mode Live caméra/micro utilise toujours Gemini Live.",
        },
        "assistant_memory": _assistant_memory_status(),
        "switch": (
            "Réglez BINTU_AI_PROVIDER=chatgpt|gemini|meta dans backend/.env "
            "puis relancez python server.py"
        ),
    }


def _assistant_memory_status() -> dict[str, object]:
    try:
        from bintu.assistant.enrich import memory_status

        return memory_status()
    except Exception as exc:
        return {"enabled": False, "error": str(exc)}


def _key(name: str) -> str:
    if name == "GEMINI_API_KEY":
        value = _env("GEMINI_API_KEY") or _env("GOOGLE_API_KEY")
    else:
        value = _env(name)
    if not value:
        raise ProviderConfigurationError(f"{name} environment variable is required")
    return value


def chat_text(messages: list[dict[str, Any]], *, timeout: float) -> str:
    kind = provider_name()
    try:
        if kind == "openai":
            return _openai_text(messages, timeout)
        if kind == "gemini":
            return _gemini_text(messages, timeout)
        return _meta_text(messages, timeout)
    except httpx.TimeoutException as exc:
        raise ProviderTimeoutError("The model request timed out") from exc
    except httpx.RequestError as exc:
        raise ProviderHTTPError("The model request failed") from exc


def analyze_image(
    image_b64: str,
    content_type: str,
    focus: str,
    *,
    system: str,
    timeout: float,
) -> str:
    kind = provider_name()
    try:
        if kind == "openai":
            return _openai_text(
                [
                    {"role": "system", "content": system},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": focus},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{content_type};base64,{image_b64}"
                                },
                            },
                        ],
                    },
                ],
                timeout,
            )
        if kind == "gemini":
            return _gemini_image(image_b64, content_type, focus, system, timeout)
        return _meta_text(
            [
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": focus},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{content_type};base64,{image_b64}"
                            },
                        },
                    ],
                },
            ],
            timeout,
        )
    except httpx.TimeoutException as exc:
        raise ProviderTimeoutError("The image model timed out") from exc
    except httpx.RequestError as exc:
        raise ProviderHTTPError("The image model request failed") from exc


def _openai_text(messages: list[dict[str, Any]], timeout: float) -> str:
    model = _env("OPENAI_MODEL") or "gpt-4o-mini"
    response = httpx.post(
        OPENAI_ENDPOINT,
        headers={
            "Authorization": f"Bearer {_key('OPENAI_API_KEY')}",
            "Content-Type": "application/json",
        },
        json={"model": model, "temperature": 0, "messages": messages},
        timeout=timeout,
    )
    return _openai_body(response)


def _gemini_text(messages: list[dict[str, Any]], timeout: float) -> str:
    system, user = _split(messages)
    model = _env("GEMINI_MODEL") or "gemini-3.5-flash-lite"
    response = httpx.post(
        f"{GEMINI_ENDPOINT}/{model}:generateContent",
        headers={
            "x-goog-api-key": _key("GEMINI_API_KEY"),
            "Content-Type": "application/json",
        },
        json={
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {
                "temperature": 0,
                "responseMimeType": "application/json",
            },
        },
        timeout=timeout,
    )
    return _gemini_body(response)


def _gemini_image(
    image_b64: str,
    content_type: str,
    focus: str,
    system: str,
    timeout: float,
) -> str:
    model = _env("GEMINI_MODEL") or "gemini-3.5-flash-lite"
    response = httpx.post(
        f"{GEMINI_ENDPOINT}/{model}:generateContent",
        headers={
            "x-goog-api-key": _key("GEMINI_API_KEY"),
            "Content-Type": "application/json",
        },
        json={
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": focus},
                        {
                            "inlineData": {
                                "mimeType": content_type,
                                "data": image_b64,
                            }
                        },
                    ],
                }
            ],
            "generationConfig": {"temperature": 0},
        },
        timeout=timeout,
    )
    return _gemini_body(response)


def _meta_text(messages: list[dict[str, Any]], timeout: float) -> str:
    response = httpx.post(
        META_ENDPOINT,
        headers={
            "Authorization": f"Bearer {_key('MODEL_API_KEY')}",
            "Content-Type": "application/json",
        },
        json={
            "model": resolve_meta_model(),
            "temperature": 0,
            "messages": messages,
        },
        timeout=timeout,
    )
    return _openai_body(response)


def _split(messages: list[dict[str, Any]]) -> tuple[str, str]:
    system = "\n".join(
        item["content"]
        for item in messages
        if item.get("role") == "system" and isinstance(item.get("content"), str)
    )
    user_parts: list[str] = []
    for item in messages:
        if item.get("role") == "system":
            continue
        content = item.get("content")
        if isinstance(content, str):
            user_parts.append(content)
        elif isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and isinstance(part.get("text"), str):
                    user_parts.append(part["text"])
    return system or "You are BINTU.", "\n".join(user_parts)


def _openai_body(response: httpx.Response) -> str:
    if response.is_error:
        raise ProviderHTTPError(f"The model returned HTTP status {response.status_code}")
    try:
        content = response.json()["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise ProviderResponseError("The model response has no text") from exc
    if not isinstance(content, str) or not content.strip():
        raise ProviderResponseError("The model response is empty")
    return content


def _gemini_body(response: httpx.Response) -> str:
    if response.is_error:
        if response.status_code == 503:
            raise ProviderHTTPError(
                "Gemini is overloaded for this model; try gemini-3.5-flash-lite"
            )
        raise ProviderHTTPError(f"Gemini returned HTTP status {response.status_code}")
    try:
        parts = response.json()["candidates"][0]["content"]["parts"]
        content = "".join(
            part.get("text", "")
            for part in parts
            if isinstance(part, dict) and not part.get("thought")
        )
        if not content.strip():
            content = "".join(
                part.get("text", "") for part in parts if isinstance(part, dict)
            )
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise ProviderResponseError("Gemini response has no text") from exc
    if not content.strip():
        raise ProviderResponseError("Gemini response is empty")
    return content
