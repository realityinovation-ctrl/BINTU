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

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from bintu_agent_core.engine import InvestigationEngine
from bintu_agent_core.errors import (
    AIProviderError,
    DecisionValidationError,
    InvestigationNotFoundError,
    InvalidStateTransitionError,
    PersistenceError,
    ProviderResponseError,
    ProviderTimeoutError,
    UnsupportedToolError,
)
from bintu_agent_core.meta_provider import MetaAIProvider
from bintu_agent_core.measurement_catalog import MEASUREMENT_CATALOG
from bintu_agent_core.models import (
    AnalyzeImageArguments,
    AskTechnicianArguments,
    InvestigationState,
    Problem,
    RequestMeasurementArguments,
)
from bintu_agent_core.provider import AIProvider
from bintu_agent_core.sqlite_store import SQLiteInvestigationStore
from bintu_backend.authentication import (
    ClerkRequestAuthenticator,
    RequestAuthenticator,
)
from bintu_backend.authorization import (
    DIAGNOSTIC_CREATE,
    DIAGNOSTIC_OPERATE,
    DIAGNOSTIC_READ,
    ActiveOrganizationRequired,
    AuthenticatedContext,
    AuthenticationError,
    PermissionDenied,
    authorize,
)
from bintu_backend.migration import claim_demo_organization
from bintu_backend.settings import cors_origins
from bintu_backend.schemas import (
    CreateInvestigationRequest,
    HealthResponse,
    InvestigationResponse,
    InvestigationSummaryResponse,
    MeasurementRequest,
    MessageRequest,
    TranscriptionResponse,
)
from bintu_backend.image import ImageAnalyzer, MetaImageAnalyzer
from bintu_backend.voice import MuseVoiceTranscriber, VoiceTranscriber


ProviderFactory = Callable[[], AIProvider]
TranscriberFactory = Callable[[], VoiceTranscriber]
ImageAnalyzerFactory = Callable[[], ImageAnalyzer]

MAX_AUDIO_BYTES = 32 * 1024 * 1024
MAX_AUDIO_DURATION_SECONDS = 10 * 60
ACCEPTED_AUDIO_TYPES = {"audio/wav", "audio/x-wav", "audio/wave"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024
ACCEPTED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}

def create_app(
    *,
    database_path: str | Path | None = None,
    provider_factory: ProviderFactory | None = None,
    transcriber_factory: TranscriberFactory | None = None,
    image_analyzer_factory: ImageAnalyzerFactory | None = None,
    authenticator: RequestAuthenticator | None = None,
) -> FastAPI:
    store = SQLiteInvestigationStore(
        database_path or os.environ.get("BINTU_DB_PATH", "data/bintu.sqlite3")
    )
    claim_demo_organization(store)
    resolved_authenticator = (
        authenticator or ClerkRequestAuthenticator.from_environment()
    )
    make_provider = provider_factory or MetaAIProvider
    make_transcriber = transcriber_factory or MuseVoiceTranscriber
    make_image_analyzer = image_analyzer_factory or MetaImageAnalyzer
    app = FastAPI(title="BINTU API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins(),
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )

    def require(permission: str):
        def dependency(request: Request) -> AuthenticatedContext:
            try:
                context = resolved_authenticator.authenticate(request)
            except AuthenticationError:
                raise HTTPException(
                    status_code=401, detail="Authentication required"
                ) from None
            try:
                authorize(context, permission)
            except ActiveOrganizationRequired:
                raise HTTPException(
                    status_code=403, detail="Active organization required"
                ) from None
            except PermissionDenied:
                raise HTTPException(
                    status_code=403, detail="Permission denied"
                ) from None
            return context

        return dependency

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

    @app.exception_handler(ProviderResponseError)
    async def provider_response_rejected(
        request: Request, exc: ProviderResponseError
    ) -> JSONResponse:
        del request, exc
        return JSONResponse(
            status_code=422,
            content={"detail": "Provider decision rejected by Agent Core"},
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

    @app.exception_handler(UnsupportedToolError)
    async def unsupported_tool(
        request: Request, exc: UnsupportedToolError
    ) -> JSONResponse:
        del request, exc
        return JSONResponse(
            status_code=422,
            content={"detail": "Provider decision rejected by Agent Core"},
        )

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        del request
        if isinstance(exc, (HTTPException, StarletteHTTPException, RequestValidationError)):
            raise exc
        return JSONResponse(
            status_code=500,
            content={"detail": "Unexpected server error"},
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

    @app.exception_handler(RequestValidationError)
    async def invalid_request(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        del request
        errors = exc.errors()
        value_error = any(
            error.get("loc", ())[-1:] == ("value",)
            for error in errors
        )
        return JSONResponse(
            status_code=422,
            content={
                "detail": (
                    "A finite numeric measurement is required"
                    if value_error
                    else "Invalid request"
                )
            },
        )

    @app.get("/api/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(status="ok")

    @app.get(
        "/api/investigations",
        response_model=list[InvestigationSummaryResponse],
    )
    def list_saved_investigations(
        context: AuthenticatedContext = Depends(require(DIAGNOSTIC_READ)),
    ) -> list[InvestigationSummaryResponse]:
        organization_id = _organization_id(context)
        summaries = []
        for item in store.list_in_organization(organization_id, limit=20):
            try:
                state = store.get_in_organization(item.id, organization_id)
            except InvestigationNotFoundError:
                continue
            summaries.append(
                InvestigationSummaryResponse(
                    investigation_id=item.id,
                    status=item.status,
                    updated_at=item.updated_at,
                    problem=(
                        state.problem.description
                        if state.problem is not None
                        else None
                    ),
                )
            )
        return summaries

    @app.post(
        "/api/investigations",
        response_model=InvestigationResponse,
        status_code=201,
    )
    def create_investigation(
        request: CreateInvestigationRequest,
        context: AuthenticatedContext = Depends(require(DIAGNOSTIC_CREATE)),
    ) -> InvestigationResponse:
        organization_id = _organization_id(context)
        state = store.create_in_organization(organization_id, context.user_id)
        state.problem = Problem(description=request.problem)
        try:
            _advance_once(state, make_provider)
            store.save_in_organization(state, organization_id)
        except Exception:
            store.delete_in_organization(state.investigation_id, organization_id)
            raise
        return _present(state)

    @app.get(
        "/api/investigations/{investigation_id}",
        response_model=InvestigationResponse,
    )
    def get_investigation(
        investigation_id: str,
        context: AuthenticatedContext = Depends(require(DIAGNOSTIC_READ)),
    ) -> InvestigationResponse:
        return _present(
            store.get_in_organization(
                investigation_id, _organization_id(context)
            )
        )

    @app.post(
        "/api/investigations/{investigation_id}/message",
        response_model=InvestigationResponse,
    )
    def send_message(
        investigation_id: str,
        request: MessageRequest,
        context: AuthenticatedContext = Depends(require(DIAGNOSTIC_OPERATE)),
    ) -> InvestigationResponse:
        organization_id = _organization_id(context)
        state = store.get_in_organization(investigation_id, organization_id)
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
        store.save_in_organization(state, organization_id)
        return _present(state)

    @app.post(
        "/api/investigations/{investigation_id}/measurement",
        response_model=InvestigationResponse,
    )
    def submit_measurement(
        investigation_id: str,
        request: MeasurementRequest,
        context: AuthenticatedContext = Depends(require(DIAGNOSTIC_OPERATE)),
    ) -> InvestigationResponse:
        organization_id = _organization_id(context)
        state = store.get_in_organization(investigation_id, organization_id)
        pending = state.pending_action
        if pending is None or not isinstance(
            pending.decision.arguments, RequestMeasurementArguments
        ):
            raise InvalidStateTransitionError(
                "investigation is not waiting for a measurement"
            )

        spec = MEASUREMENT_CATALOG.get(request.measurement_type)
        if spec is None:
            raise HTTPException(
                status_code=422,
                detail="Unknown measurement type",
            )
        if request.unit != spec.unit:
            raise HTTPException(
                status_code=422,
                detail="Unit does not match measurement type",
            )

        expected = pending.decision.arguments
        if (
            request.measurement_type != expected.measurement_type
            or request.unit != expected.unit
            or request.location.casefold() != expected.location.strip().casefold()
        ):
            raise HTTPException(
                status_code=422,
                detail="Measurement does not match the requested action",
            )

        provider = make_provider()
        try:
            engine = InvestigationEngine(state, provider)
            engine.submit_measurement(
                f"measurement-{uuid4()}", float(request.value)
            )
            engine.advance()
        finally:
            _close_provider(provider)
        store.save_in_organization(state, organization_id)
        return _present(state)

    @app.post(
        "/api/investigations/{investigation_id}/transcribe",
        response_model=TranscriptionResponse,
    )
    def transcribe_audio(
        investigation_id: str,
        audio: UploadFile = File(...),
        context: AuthenticatedContext = Depends(require(DIAGNOSTIC_OPERATE)),
    ) -> TranscriptionResponse:
        # FOLLOW-UP / P1: this route still does not require a pending question.
        store.get_in_organization(
            investigation_id, _organization_id(context)
        )
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

    @app.post(
        "/api/investigations/{investigation_id}/image",
        response_model=InvestigationResponse,
    )
    def analyze_image(
        investigation_id: str,
        image: UploadFile = File(...),
        context: AuthenticatedContext = Depends(require(DIAGNOSTIC_OPERATE)),
    ) -> InvestigationResponse:
        organization_id = _organization_id(context)
        state = store.get_in_organization(investigation_id, organization_id)
        pending = state.pending_action
        if pending is None or not isinstance(
            pending.decision.arguments, AnalyzeImageArguments
        ):
            image.file.close()
            raise InvalidStateTransitionError(
                "investigation is not waiting for an image"
            )

        content_type = (image.content_type or "").lower()
        if content_type not in ACCEPTED_IMAGE_TYPES:
            image.file.close()
            raise HTTPException(
                status_code=415,
                detail="Only JPEG, PNG and WebP images are accepted",
            )
        try:
            content = image.file.read(MAX_IMAGE_BYTES + 1)
        finally:
            image.file.close()
        if len(content) > MAX_IMAGE_BYTES:
            raise HTTPException(
                status_code=413,
                detail="Image file exceeds the 10 MB limit",
            )
        _validate_image(content, content_type)

        analyzer = make_image_analyzer()
        try:
            analysis = analyzer.analyze(
                content,
                content_type,
                pending.decision.arguments.focus,
            )
        finally:
            _close_image_analyzer(analyzer)

        provider = make_provider()
        evidence_id = f"image-analysis-{uuid4()}"
        try:
            engine = InvestigationEngine(state, provider)
            engine.submit_image_analysis(
                evidence_id,
                analysis.description,
                analysis.certainty,
            )
            engine.advance()
        finally:
            _close_provider(provider)
        store.save_in_organization(state, organization_id)
        return _present(state)

    return app


def _organization_id(context: AuthenticatedContext) -> str:
    if context.organization_id is None:
        raise HTTPException(
            status_code=403, detail="Active organization required"
        )
    return context.organization_id


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


def _close_image_analyzer(analyzer: ImageAnalyzer) -> None:
    close = getattr(analyzer, "close", None)
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


def _validate_image(content: bytes, content_type: str) -> None:
    signatures = {
        "image/jpeg": (
            content.startswith(b"\xff\xd8\xff") and content.endswith(b"\xff\xd9")
        ),
        "image/png": content.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": (
            len(content) >= 12
            and content.startswith(b"RIFF")
            and content[8:12] == b"WEBP"
        ),
    }
    if not content or not signatures[content_type]:
        raise HTTPException(
            status_code=422,
            detail="Image content does not match its declared format",
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
            "system": state.system.model_dump(mode="json"),
            "measurement_catalog": [
                {
                    "measurement_type": spec.measurement_type,
                    "label": spec.label,
                    "unit": spec.unit,
                }
                for spec in MEASUREMENT_CATALOG.values()
            ],
            "observations": [
                observation.model_dump(mode="json")
                for observation in state.observations.values()
            ],
            "measurements": [
                {
                    **measurement.model_dump(mode="json"),
                    "source_type": "measurement",
                }
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
