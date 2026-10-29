"""Muse Voice file-transcription adapter used by the HTTP backend."""

from __future__ import annotations

import json
import os
from typing import Protocol

import httpx

from bintu_agent_core.errors import (
    ProviderConfigurationError,
    ProviderHTTPError,
    ProviderResponseError,
    ProviderTimeoutError,
)


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
        api_key = os.environ.get("MODEL_API_KEY")
        if not api_key or not api_key.strip():
            raise ProviderConfigurationError(
                "MODEL_API_KEY environment variable is required"
            )
        self._api_key = api_key
        self._client = client or httpx.Client(timeout=timeout_seconds)
        self._owns_client = client is None

    def transcribe(self, audio: bytes, filename: str) -> str:
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
            transcript = response.json()["transcript"]
        except (ValueError, KeyError, TypeError) as exc:
            raise ProviderResponseError(
                "Muse Voice response does not contain a transcript"
            ) from exc
        if not isinstance(transcript, str) or not transcript.strip():
            raise ProviderResponseError(
                "Muse Voice returned an empty transcript"
            )
        return transcript.strip()

    def close(self) -> None:
        if self._owns_client:
            self._client.close()
