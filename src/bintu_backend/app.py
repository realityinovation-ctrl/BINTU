"""FastAPI product boundary for the BINTU Agent Core."""

from __future__ import annotations

import os
import wave
from io import BytesIO
from collections.abc import Callable
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from bintu_agent_core.engine import InvestigationEngine
from bintu_agent_core.errors import (
    AIProviderError,
    DecisionValidationError,
    InvestigationNotFoundError,
    InvalidStateTransitionError,
    PersistenceError,
    ProviderTimeoutError,
)
from bintu_agent_core.meta_provider import MetaAIProvider
from bintu_agent_core.models import (
    AskTechnicianArguments,
    InvestigationState,
    Problem,
    RequestMeasurementArguments,
)
from bintu_agent_core.provider import AIProvider
from bintu_agent_core.sqlite_store import SQLiteInvestigationStore
from bintu_backend.schemas import (
    CreateInvestigationRequest,
    HealthResponse,
    InvestigationResponse,
    MessageRequest,
    TranscriptionResponse,
)
from bintu_backend.voice import MuseVoiceTranscriber, VoiceTranscriber


ProviderFactory = Callable[[], AIProvider]
TranscriberFactory = Callable[[], VoiceTranscriber]

MAX_AUDIO_BYTES = 32 * 1024 * 1024
MAX_AUDIO_DURATION_SECONDS = 10 * 60
ACCEPTED_AUDIO_TYPES = {"audio/wav", "audio/x-wav", "audio/wave"}

DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


def create_app(
    *,
    database_path: str | Path | None = None,
    provider_factory: ProviderFactory | None = None,
    transcriber_factory: TranscriberFactory | None = None,
) -> FastAPI:
    store = SQLiteInvestigationStore(
        database_path or os.environ.get("BINTU_DB_PATH", "data/bintu.sqlite3")
    )
    make_provider = provider_factory or MetaAIProvider
    make_transcriber = transcriber_factory or MuseVoiceTranscriber
    app = FastAPI(title="BINTU API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=DEFAULT_CORS_ORIGINS,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(InvestigationNotFoundError)
    async def investigation_not_found(
        request: Request, exc: InvestigationNotFoundError
    ) -> JSONResponse:
        del request, exc
        return JSONResponse(
            status_code=404, content={"detail": "Investigation not found"}
        )

    @app.exception_handler(AIProviderError)
    async def provider_failed(
        request: Request, exc: AIProviderError
    ) -> JSONResponse:
        del request, exc
        return JSONResponse(
            status_code=502, content={"detail": "AI provider unavailable"}
        )

    @app.exception_handler(ProviderTimeoutError)
    async def provider_timed_out(
        request: Request, exc: ProviderTimeoutError
    ) -> JSONResponse:
        del request, exc
        return JSONResponse(
            status_code=504, content={"detail": "AI provider timed out"}
        )

    @app.exception_handler(DecisionValidationError)
    async def decision_rejected(
        request: Request, exc: DecisionValidationError
    ) -> JSONResponse:
        del request, exc
        return JSONResponse(
            status_code=422,
            content={"detail": "Provider decision rejected by Agent Core"},
        )

    @app.exception_handler(InvalidStateTransitionError)
    async def invalid_transition(
        request: Request, exc: InvalidStateTransitionError
    ) -> JSONResponse:
        del request, exc
        return JSONResponse(
            status_code=409,
            content={"detail": "Investigation cannot accept this operation"},
        )

    @app.exception_handler(PersistenceError)
    async def persistence_failed(
        request: Request, exc: PersistenceError
    ) -> JSONResponse:
        del request, exc
        return JSONResponse(
            status_code=500, content={"detail": "Persistence operation failed"}
        )

    @app.get("/api/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(status="ok")

    @app.post(
        "/api/investigations",
        response_model=InvestigationResponse,
        status_code=201,
    )
    def create_investigation(
        request: CreateInvestigationRequest,
    ) -> InvestigationResponse:
        state = store.create_investigation()
        state.problem = Problem(description=request.problem)
        try:
            _advance_once(state, make_provider)
            store.save_investigation(state)
        except Exception:
            store.delete_investigation(state.investigation_id)
            raise
        return _present(state)

    @app.get(
        "/api/investigations/{investigation_id}",
        response_model=InvestigationResponse,
    )
    def get_investigation(investigation_id: str) -> InvestigationResponse:
        return _present(store.get_investigation(investigation_id))

    @app.post(
        "/api/investigations/{investigation_id}/message",
        response_model=InvestigationResponse,
    )
    def send_message(
        investigation_id: str, request: MessageRequest
    ) -> InvestigationResponse:
        state = store.get_investigation(investigation_id)
        pending = state.pending_action
        if pending is None:
            raise InvalidStateTransitionError(
                "investigation is not waiting for technician input"
            )

        provider = make_provider()
        try:
            engine = InvestigationEngine(state, provider)
            if isinstance(
                pending.decision.arguments, AskTechnicianArguments
            ):
                engine.submit_technician_answer(
                    f"technician-answer-{uuid4()}", request.message
                )
            elif isinstance(
                pending.decision.arguments, RequestMeasurementArguments
            ):
                try:
                    value = Decimal(request.message.replace(",", "."))
                except InvalidOperation as exc:
                    raise HTTPException(
                        status_code=422,
                        detail="A numeric measurement is required",
                    ) from exc
                if not value.is_finite():
                    raise HTTPException(
                        status_code=422,
                        detail="A finite numeric measurement is required",
                    )
                engine.submit_measurement(
                    f"measurement-{uuid4()}", float(value)
                )
            else:
                raise InvalidStateTransitionError(
                    "this action cannot be completed with a text message"
                )
            engine.advance()
        finally:
            _close_provider(provider)
        store.save_investigation(state)
        return _present(state)

    @app.post(
        "/api/investigations/{investigation_id}/transcribe",
        response_model=TranscriptionResponse,
    )
    def transcribe_audio(
        investigation_id: str,
        audio: UploadFile = File(...),
    ) -> TranscriptionResponse:
        store.get_investigation(investigation_id)
        content_type = (audio.content_type or "").lower()
        if content_type not in ACCEPTED_AUDIO_TYPES:
            audio.file.close()
            raise HTTPException(
                status_code=415,
                detail="Only mono PCM WAV audio is accepted",
            )
        try:
            content = audio.file.read(MAX_AUDIO_BYTES + 1)
        finally:
            audio.file.close()
        if len(content) > MAX_AUDIO_BYTES:
            raise HTTPException(
                status_code=413,
                detail="Audio file exceeds the 32 MB limit",
            )
        _validate_wav(content)

        transcriber = make_transcriber()
        try:
            transcription = transcriber.transcribe(
                content, audio.filename or "recording.wav"
            )
        finally:
            _close_transcriber(transcriber)
        return TranscriptionResponse(transcription=transcription)

    return app


def _advance_once(
    state: InvestigationState, provider_factory: ProviderFactory
) -> None:
    provider = provider_factory()
    try:
        InvestigationEngine(state, provider).advance()
    finally:
        _close_provider(provider)


def _close_provider(provider: AIProvider) -> None:
    close = getattr(provider, "close", None)
    if callable(close):
        close()


def _close_transcriber(transcriber: VoiceTranscriber) -> None:
    close = getattr(transcriber, "close", None)
    if callable(close):
        close()


def _validate_wav(content: bytes) -> None:
    try:
        with wave.open(BytesIO(content), "rb") as recording:
            channels = recording.getnchannels()
            sample_width = recording.getsampwidth()
            sample_rate = recording.getframerate()
            frame_count = recording.getnframes()
            compression = recording.getcomptype()
    except (EOFError, wave.Error) as exc:
        raise HTTPException(
            status_code=422, detail="Audio is not a valid WAV file"
        ) from exc
    if (
        channels != 1
        or sample_width != 2
        or sample_rate not in {16000, 24000}
        or compression != "NONE"
    ):
        raise HTTPException(
            status_code=422,
            detail="WAV must be mono 16-bit PCM at 16 kHz or 24 kHz",
        )
    if frame_count / sample_rate > MAX_AUDIO_DURATION_SECONDS:
        raise HTTPException(
            status_code=413,
            detail="Audio duration exceeds the 10 minute limit",
        )


def _present(state: InvestigationState) -> InvestigationResponse:
    pending_action: dict[str, Any] | None = None
    if state.pending_action is not None:
        pending_action = {
            "action_id": state.pending_action.action_id,
            **state.pending_action.decision.model_dump(mode="json"),
        }
    return InvestigationResponse(
        investigation_id=state.investigation_id,
        status=state.status.value,
        state={
            "problem": (
                state.problem.model_dump(mode="json")
                if state.problem is not None
                else None
            ),
            "installation": state.installation.model_dump(mode="json"),
            "observations": [
                observation.model_dump(mode="json")
                for observation in state.observations.values()
            ],
            "measurements": [
                measurement.model_dump(mode="json")
                for measurement in state.measurements.values()
            ],
            "hypotheses": [
                hypothesis.model_dump(mode="json")
                for hypothesis in state.hypotheses.values()
            ],
            "evidence": [
                evidence.model_dump(mode="json")
                for evidence in state.evidence.values()
            ],
            "pending_action": pending_action,
            "conclusion": (
                state.conclusion.model_dump(mode="json")
                if state.conclusion is not None
                else None
            ),
            "timeline": [
                event.model_dump(mode="json") for event in state.timeline
            ],
        },
    )
