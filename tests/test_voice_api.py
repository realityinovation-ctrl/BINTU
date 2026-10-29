import importlib
import io
import json
import wave
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from bintu_agent_core.errors import ProviderHTTPError, ProviderTimeoutError
from bintu_agent_core.models import (
    AgentDecision,
    AskTechnicianArguments,
    HypothesisId,
    InvestigationState,
    ToolName,
)
from bintu_backend.app import create_app
from bintu_backend.voice import MuseVoiceTranscriber


class AskingProvider:
    def decide_next(self, state: InvestigationState) -> AgentDecision:
        del state
        return AgentDecision(
            tool_name=ToolName.ASK_TECHNICIAN,
            arguments=AskTechnicianArguments(
                question="Quel état est affiché ?",
                distinguishes=[HypothesisId.H0, HypothesisId.H2],
            ),
            reason="Obtenir une observation.",
        )


class StubTranscriber:
    def __init__(
        self,
        transcript: str = "Aucun défaut n'est affiché.",
        error: Exception | None = None,
    ) -> None:
        self.transcript = transcript
        self.error = error
        self.calls = 0

    def transcribe(self, audio: bytes, filename: str) -> str:
        assert audio.startswith(b"RIFF")
        assert filename.endswith(".wav")
        self.calls += 1
        if self.error:
            raise self.error
        return self.transcript


def wav_bytes(
    *, sample_rate: int = 16000, seconds: float = 0.1
) -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as recording:
        recording.setnchannels(1)
        recording.setsampwidth(2)
        recording.setframerate(sample_rate)
        recording.writeframes(b"\x00\x00" * int(sample_rate * seconds))
    return output.getvalue()


def voice_client(
    tmp_path: Path, transcriber: StubTranscriber
) -> tuple[TestClient, str]:
    app = create_app(
        database_path=tmp_path / "voice.sqlite3",
        provider_factory=AskingProvider,
        transcriber_factory=lambda: transcriber,
    )
    client = TestClient(app)
    created = client.post(
        "/api/investigations",
        json={"problem": "Production solaire faible."},
    ).json()
    return client, created["investigation_id"]


def post_audio(client: TestClient, investigation_id: str, content: bytes):
    return client.post(
        f"/api/investigations/{investigation_id}/transcribe",
        files={"audio": ("recording.wav", content, "audio/wav")},
    )


def test_valid_audio_is_transcribed_without_mutating_investigation(
    tmp_path: Path,
) -> None:
    transcriber = StubTranscriber()
    client, investigation_id = voice_client(tmp_path, transcriber)
    before = client.get(f"/api/investigations/{investigation_id}").json()

    response = post_audio(client, investigation_id, wav_bytes())
    after = client.get(f"/api/investigations/{investigation_id}").json()

    assert response.status_code == 200
    assert response.json() == {
        "transcription": "Aucun défaut n'est affiché."
    }
    assert transcriber.calls == 1
    assert after == before


def test_audio_too_large_is_rejected(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    app_module = importlib.import_module("bintu_backend.app")
    monkeypatch.setattr(app_module, "MAX_AUDIO_BYTES", 32)
    transcriber = StubTranscriber()
    client, investigation_id = voice_client(tmp_path, transcriber)

    response = post_audio(client, investigation_id, b"x" * 33)

    assert response.status_code == 413
    assert transcriber.calls == 0


def test_invalid_audio_format_is_rejected(tmp_path: Path) -> None:
    transcriber = StubTranscriber()
    client, investigation_id = voice_client(tmp_path, transcriber)

    response = client.post(
        f"/api/investigations/{investigation_id}/transcribe",
        files={"audio": ("recording.webm", b"not-wav", "audio/webm")},
    )

    assert response.status_code == 415
    assert transcriber.calls == 0


def test_invalid_wav_parameters_are_rejected(tmp_path: Path) -> None:
    transcriber = StubTranscriber()
    client, investigation_id = voice_client(tmp_path, transcriber)

    response = post_audio(
        client, investigation_id, wav_bytes(sample_rate=8000)
    )

    assert response.status_code == 422
    assert transcriber.calls == 0


def test_meta_voice_error_is_clean_502(tmp_path: Path) -> None:
    transcriber = StubTranscriber(error=ProviderHTTPError("Meta body"))
    client, investigation_id = voice_client(tmp_path, transcriber)

    response = post_audio(client, investigation_id, wav_bytes())

    assert response.status_code == 502
    assert response.json() == {"detail": "AI provider unavailable"}


def test_meta_voice_timeout_is_clean_504(tmp_path: Path) -> None:
    transcriber = StubTranscriber(
        error=ProviderTimeoutError("simulated timeout")
    )
    client, investigation_id = voice_client(tmp_path, transcriber)

    response = post_audio(client, investigation_id, wav_bytes())

    assert response.status_code == 504
    assert response.json() == {"detail": "AI provider timed out"}


def test_missing_investigation_is_404(tmp_path: Path) -> None:
    transcriber = StubTranscriber()
    app = create_app(
        database_path=tmp_path / "voice.sqlite3",
        provider_factory=AskingProvider,
        transcriber_factory=lambda: transcriber,
    )

    response = post_audio(TestClient(app), "missing", wav_bytes())

    assert response.status_code == 404
    assert transcriber.calls == 0


def test_voice_error_never_exposes_api_key(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    secret = "voice-secret-that-must-not-leak"
    monkeypatch.setenv("MODEL_API_KEY", secret)
    transcriber = StubTranscriber(error=ProviderHTTPError(secret))
    client, investigation_id = voice_client(tmp_path, transcriber)

    response = post_audio(client, investigation_id, wav_bytes())

    assert response.status_code == 502
    assert secret not in response.text


def test_muse_voice_adapter_uses_documented_multipart_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MODEL_API_KEY", "not-a-real-key")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer not-a-real-key"
        assert request.headers["Accept"] == "application/json"
        body = request.content
        assert b'name=\"request\"' in body
        assert b'name=\"audio\"' in body
        assert b"muse-voice-transcribe-1.0" in body
        assert b"PUSH_TO_TALK" in body
        return httpx.Response(
            200,
            json={
                "sessionId": "session-1",
                "transcript": "Texte transcrit.",
                "audioDurationMs": 100,
                "turns": [],
            },
            request=request,
        )

    transcriber = MuseVoiceTranscriber(
        client=httpx.Client(transport=httpx.MockTransport(handler))
    )

    assert transcriber.transcribe(wav_bytes(), "recording.wav") == (
        "Texte transcrit."
    )


def test_muse_voice_adapter_wraps_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MODEL_API_KEY", "not-a-real-key")

    def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("simulated", request=request)

    transcriber = MuseVoiceTranscriber(
        client=httpx.Client(transport=httpx.MockTransport(timeout))
    )

    with pytest.raises(ProviderTimeoutError):
        transcriber.transcribe(wav_bytes(), "recording.wav")
