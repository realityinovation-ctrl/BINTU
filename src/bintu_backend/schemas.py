"""HTTP request and response schemas."""

from __future__ import annotations

from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, StringConstraints


class APIModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MessageRequest(APIModel):
    message: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1)
    ]


class CreateInvestigationRequest(APIModel):
    problem: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1)
    ]


class InvestigationResponse(APIModel):
    investigation_id: str
    status: str
    state: dict[str, Any]


class HealthResponse(APIModel):
    status: str
