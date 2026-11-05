"""HTTP request and response schemas."""

from __future__ import annotations

from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, FiniteFloat, StringConstraints


class APIModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MessageRequest(APIModel):
    message: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1)
    ]
    # False = stay in waiting_for_technician (Live / fluid chat, no decide_next).
    # True = commit answer and advance the diagnostic graph.
    commit: bool = False


class CreateInvestigationRequest(APIModel):
    problem: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1)
    ]


class MeasurementRequest(APIModel):
    measurement_type: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1)
    ]
    value: FiniteFloat
    unit: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1)
    ]
    location: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
    ]


class InvestigationResponse(APIModel):
    investigation_id: str
    status: str
    state: dict[str, Any]


class InvestigationSummaryResponse(APIModel):
    investigation_id: str
    status: str
    updated_at: str
    problem: str | None


class HealthResponse(APIModel):
    status: str


class TranscriptionResponse(APIModel):
    transcription: str


class VisionBoxesRequest(APIModel):
    image_base64: Annotated[str, StringConstraints(min_length=32)]
    content_type: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=3)
    ] = "image/jpeg"
    hint: Annotated[str, StringConstraints(strip_whitespace=True, max_length=400)] = ""


class VisionBoxesResponse(APIModel):
    overlays: list[dict[str, Any]]


class GoogleAuthRequest(APIModel):
    id_token: Annotated[str, StringConstraints(strip_whitespace=True, min_length=40)]


class QuotaResponse(APIModel):
    period_date: str
    messages_used: int
    messages_limit: int
    messages_remaining: int
    live_minutes_used: float
    live_minutes_limit: float
    live_minutes_remaining: float
    investigations_used: int
    investigations_limit: int
    investigations_remaining: int


class UserResponse(APIModel):
    id: str
    email: str
    name: str | None
    picture_url: str | None
    plan: str
    organization_id: str


class AuthSessionResponse(APIModel):
    access_token: str
    expires_at: str
    token_type: str = "Bearer"
    user: UserResponse
    quota: QuotaResponse


class AuthMeResponse(APIModel):
    user: UserResponse
    quota: QuotaResponse
    auth_required: bool
    google_client_id: str | None = None
