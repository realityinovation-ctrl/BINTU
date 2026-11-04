"""File transcription: ChatGPT Whisper, Meta Muse, or Gemini-side fallback note."""

from __future__ import annotations

import json
import os
from typing import Protocol

import httpx

from bintu.core.errors import (
    ProviderConfigurationError,
    ProviderHTTPError,
    ProviderResponseError,
    ProviderTimeoutError,
)
from bintu.core.llm import has_meta, has_openai, provider_name


VOICE_ENDPOINT = "https://api.meta.ai/v1/asr/transcribe"
VOICE_MODEL = "muse-voice-transcribe-1.0"


class VoiceTranscriber(Protocol):
    def transcribe(self, audio: bytes, filename: str) -> str:
        """Return only the final transcript for one compliant WAV file."""


class MuseVoiceTranscriber:
    def __init__(
        self,
        *,
        client: httpx.Client | None = None,
        timeout_seconds: float = 60.0,
    ) -> None:
        try:
            kind = provider_name()
        except ProviderConfigurationError:
            kind = None

        if kind == "openai" and has_openai():
            self._mode = "openai"
            self._api_key = os.environ["OPENAI_API_KEY"].strip()
        elif kind == "meta" and has_meta():
            self._mode = "meta"
            self._api_key = os.environ["MODEL_API_KEY"].strip()
        elif has_openai():
            self._mode = "openai"
            self._api_key = os.environ["OPENAI_API_KEY"].strip()
        elif has_meta():
            self._mode = "meta"
            self._api_key = os.environ["MODEL_API_KEY"].strip()
        else:
            raise ProviderConfigurationError(
                "Pour la transcription WAV: OPENAI_API_KEY (Whisper) ou "
                "MODEL_API_KEY (Meta). Avec Gemini seul, utilisez /api/live."
            )
        self._client = client or httpx.Client(timeout=timeout_seconds)
        self._owns_client = client is None

    def transcribe(self, audio: bytes, filename: str) -> str:
        if self._mode == "openai":
            return self._whisper(audio, filename)
        settings = {
            "model": VOICE_MODEL,
            "audioEncoding": "WAV",
            "mode": "PUSH_TO_TALK",
            "languageBias": ["French"],
        }
        try:
            response = self._client.post(
                VOICE_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Accept": "application/json",
                },
                files={
                    "request": (
                        None,
                        json.dumps(settings),
                        "application/json",
                    ),
                    "audio": (filename, audio, "audio/wav"),
                },
            )
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError(
                "Muse Voice transcription timed out"
            ) from exc
        except httpx.RequestError as exc:
            raise ProviderHTTPError(
                "Muse Voice transcription request failed"
            ) from exc
        if response.is_error:
            raise ProviderHTTPError(
                f"Muse Voice returned HTTP status {response.status_code}"
            )
        try:
            payload = response.json()
            text = payload.get("text") or payload.get("transcript") or ""
        except (ValueError, TypeError) as exc:
            raise ProviderResponseError(
                "Muse Voice response is not valid JSON"
            ) from exc
        if not isinstance(text, str) or not text.strip():
            raise ProviderResponseError("Muse Voice transcript is empty")
        return text.strip()

    def _whisper(self, audio: bytes, filename: str) -> str:
        try:
            response = self._client.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {self._api_key}"},
                data={"model": "whisper-1", "language": "fr"},
                files={"file": (filename or "recording.wav", audio, "audio/wav")},
            )
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError("Whisper transcription timed out") from exc
        except httpx.RequestError as exc:
            raise ProviderHTTPError("ChatGPT transcription failed") from exc
        if response.is_error:
            raise ProviderHTTPError(
                f"Whisper returned HTTP status {response.status_code}"
            )
        try:
            text = response.json().get("text", "")
        except (ValueError, TypeError) as exc:
            raise ProviderResponseError("Whisper response is not valid JSON") from exc
        if not isinstance(text, str) or not text.strip():
            raise ProviderResponseError("Whisper transcript is empty")
        return text.strip()

    def close(self) -> None:
        if self._owns_client:
            self._client.close()
