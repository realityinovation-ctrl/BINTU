"""Freeze the current FastAPI HTTP behaviour.

Each fixture is produced by the real application: TestClient, a fixed
authentication context, a scripted provider and a temporary database.
Re-running this module must leave parity/http byte-for-byte unchanged.
"""

from __future__ import annotations

import io
import json
import os
import shutil
import struct
import sys
import tempfile
import wave
from pathlib import Path
from typing import Any
from uuid import UUID

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient

from bintu_agent_core.errors import (
    DecisionValidationError,
    ProviderConfigurationError,
    ProviderHTTPError,
    ProviderResponseError,
    ProviderTimeoutError,
    ScriptExhaustedError,
)
from bintu_agent_core.models import (
    AgentDecision,
    AnalyzeImageArguments,
    AskTechnicianArguments,
    HypothesisId,
    RequestMeasurementArguments,
    ToolName,
)
from bintu_backend.app import create_app
from bintu_backend.authentication import AuthenticationError
from bintu_backend.authorization import AuthenticatedContext

FIXTURE_ROOT = ROOT / "parity" / "http"
SECRET = "sk-test-secret-key"
MEMBER_PERMISSIONS = [
    "diagnostic:create",
    "diagnostic:operate",
    "diagnostic:read",
]
PROBLEM = "Production solaire anormalement faible."


class Sequence:
    """Shared by the store and the routes. Reset for every fixture."""

    def __init__(self) -> None:
        self._ids = 0
        self._ticks = 0
        self.issued: list[str] = []

    def uuid4(self) -> UUID:
        self._ids += 1
        value = UUID(int=self._ids)
        self.issued.append(str(value))
        return value

    def now(self) -> str:
        self._ticks += 1
        minutes, seconds = divmod(self._ticks, 60)
        return f"2026-01-01T00:{minutes:02d}:{seconds:02d}.000000+00:00"


class MutableAuthenticator:
    def __init__(self) -> None:
        self.context: AuthenticatedContext | None = None

    def authenticate(self, request: object) -> AuthenticatedContext:
        del request
        if self.context is None:
            raise AuthenticationError("unauthenticated")
        return self.context


class ScriptedProvider:
    def __init__(self, steps: list[dict[str, Any]], repeat: bool) -> None:
        self.steps = steps
        self.repeat = repeat
        self.index = 0

    def decide_next(self, state: object) -> AgentDecision:
        del state
        step = self._take()
        if "error" in step:
            raise _provider_error(step["error"], step.get("detail", "scripted"))
        return _decision(step["decision"])

    def _take(self) -> dict[str, Any]:
        if self.index < len(self.steps):
            step = self.steps[self.index]
            self.index += 1
            return step
        if self.repeat and self.steps:
            return self.steps[-1]
        raise ScriptExhaustedError("script exhausted")


class ScriptedTranscriber:
    def __init__(self, script: dict[str, Any] | None) -> None:
        self.script = script

    def transcribe(self, audio: bytes, filename: str) -> str:
        del audio, filename
        if self.script is None:
            raise ScriptExhaustedError("transcriber was not scripted")
        if "error" in self.script:
            raise _provider_error(
                self.script["error"], self.script.get("detail", "scripted")
            )
        return str(self.script["transcription"])


class ScriptedAnalyzer:
    def __init__(self, script: dict[str, Any] | None) -> None:
        self.script = script

    def analyze(
        self, content: bytes, content_type: str, focus: str
    ) -> Any:
        del content, content_type, focus
        if self.script is None:
            raise ScriptExhaustedError("analyzer was not scripted")
        if "error" in self.script:
            raise _provider_error(
                self.script["error"], self.script.get("detail", "scripted")
            )
        return _Analysis(
            str(self.script["description"]), float(self.script["certainty"])
        )


class _Analysis:
    def __init__(self, description: str, certainty: float) -> None:
        self.description = description
        self.certainty = certainty


def _provider_error(kind: str, detail: str) -> Exception:
    errors: dict[str, type[Exception]] = {
        "http": ProviderHTTPError,
        "timeout": ProviderTimeoutError,
        "response": ProviderResponseError,
        "configuration": ProviderConfigurationError,
        "validation": DecisionValidationError,
        "exhausted": ScriptExhaustedError,
        "internal": RuntimeError,
    }
    return errors[kind](detail)


def _decision(payload: dict[str, Any]) -> AgentDecision:
    tool = ToolName(payload["tool_name"])
    arguments = payload["arguments"]
    if tool is ToolName.ASK_TECHNICIAN:
        built: Any = AskTechnicianArguments(
            question=arguments["question"],
            distinguishes=[HypothesisId(item) for item in arguments["distinguishes"]],
        )
    elif tool is ToolName.REQUEST_MEASUREMENT:
        built = RequestMeasurementArguments(
            measurement_type=arguments["measurement_type"],
            location=arguments["location"],
            unit=arguments["unit"],
            distinguishes=[HypothesisId(item) for item in arguments["distinguishes"]],
        )
    elif tool is ToolName.ANALYZE_IMAGE:
        built = AnalyzeImageArguments(
            image_id=arguments["image_id"],
            focus=arguments["focus"],
            distinguishes=[HypothesisId(item) for item in arguments["distinguishes"]],
        )
    else:
        raise ValueError(f"unsupported scripted tool: {tool.value}")
    return AgentDecision(
        tool_name=tool, arguments=built, reason=payload["reason"]
    )


def _context(auth: dict[str, Any]) -> AuthenticatedContext | None:
    if auth["kind"] == "anonymous":
        return None
    return AuthenticatedContext(
        user_id=auth["user_id"],
        organization_id=auth["organization_id"],
        role=auth["role"],
        permissions=frozenset(auth["permissions"]),
    )


def member(
    organization_id: str | None = "org_test_alpha",
    user_id: str = "user_test_technician",
    permissions: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "kind": "context",
        "user_id": user_id,
        "organization_id": organization_id,
        "role": "member",
        "permissions": list(permissions or MEMBER_PERMISSIONS),
    }


ANONYMOUS = {"kind": "anonymous"}
OTHER = member("org_test_beta", "user_test_other")
READ_ONLY = member(permissions=["diagnostic:read"])
NO_ORG = member(organization_id=None)


def ask(question: str = "Quel état est affiché ?", reason: str = "Obtenir une observation.") -> dict[str, Any]:
    return {
        "tool_name": "ask_technician",
        "reason": reason,
        "arguments": {
            "distinguishes": ["H0", "H1"],
            "question": question,
        },
    }


def measure(
    measurement_type: str = "dc_voltage",
    unit: str = "V",
    location: str = "onduleur",
) -> dict[str, Any]:
    return {
        "tool_name": "request_measurement",
        "reason": "Mesurer le point demandé.",
        "arguments": {
            "distinguishes": ["H1", "H2"],
            "location": location,
            "measurement_type": measurement_type,
            "unit": unit,
        },
    }


def image(focus: str = "poussière") -> dict[str, Any]:
    return {
        "tool_name": "analyze_image",
        "reason": "Voir le champ.",
        "arguments": {
            "distinguishes": ["H1"],
            "focus": focus,
            "image_id": "image-1",
        },
    }


def build_wav(
    *, channels: int, sample_width: int, rate: int, seconds: float
) -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as recording:
        recording.setnchannels(channels)
        recording.setsampwidth(sample_width)
        recording.setframerate(rate)
        frame_count = int(rate * seconds)
        recording.writeframes(b"\x00" * sample_width * channels * frame_count)
    return output.getvalue()


def build_float_wav() -> bytes:
    fmt = struct.pack("<HHLLHH", 3, 1, 16000, 64000, 4, 32)
    data = b"\x00\x00\x00\x00"
    body = b"WAVE" + b"fmt " + struct.pack("<I", len(fmt)) + fmt
    body += b"data" + struct.pack("<I", len(data)) + data
    return b"RIFF" + struct.pack("<I", len(body)) + body


def small_files() -> dict[str, bytes]:
    tone = {"channels": 1, "sample_width": 2, "seconds": 0.05}
    return {
        "files/tone-16k.wav": build_wav(rate=16000, **tone),
        "files/tone-24k.wav": build_wav(rate=24000, **tone),
        "files/stereo.wav": build_wav(
            channels=2, sample_width=2, rate=16000, seconds=0.05
        ),
        "files/width-8.wav": build_wav(
            channels=1, sample_width=1, rate=16000, seconds=0.05
        ),
        "files/rate-8k.wav": build_wav(
            channels=1, sample_width=2, rate=8000, seconds=0.05
        ),
        "files/invalid.bin": b"not-a-wav",
        "files/float.wav": build_float_wav(),
        "files/pixel.jpg": b"\xff\xd8\xff\xd9",
        "files/pixel.png": b"\x89PNG\r\n\x1a\n",
        "files/pixel.webp": b"RIFF" + struct.pack("<I", 4) + b"WEBP",
    }


def _materialize(recipe: dict[str, Any], files: dict[str, bytes]) -> bytes:
    if "file" in recipe:
        return files[recipe["file"]]
    if "fill_bytes" in recipe:
        return b"\x00" * int(recipe["fill_bytes"])
    wav = recipe["wav"]
    return build_wav(
        channels=int(wav["channels"]),
        sample_width=int(wav["sample_width"]),
        rate=int(wav["rate"]),
        seconds=float(wav["seconds"]),
    )


def _dump(payload: dict[str, Any]) -> bytes:
    return (
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")


def _step(
    method: str,
    path: str,
    auth: dict[str, Any],
    *,
    body: Any = None,
    body_raw: str | None = None,
    file: dict[str, Any] | None = None,
) -> dict[str, Any]:
    step: dict[str, Any] = {"auth": auth, "method": method, "path": path}
    if body is not None:
        step["body"] = body
    if body_raw is not None:
        step["body_raw"] = body_raw
    if file is not None:
        step["file"] = file
    return step


def _create(*_ignored: object, problem: str = PROBLEM) -> dict[str, Any]:
    del _ignored
    return _step(
        "POST",
        "/api/investigations",
        member(),
        body={"problem": problem},
    )


def cases() -> list[dict[str, Any]]:
    audio = {
        "field": "audio",
        "filename": "recording.wav",
        "content_type": "audio/wav",
        "file": "files/tone-16k.wav",
    }
    jpeg = {
        "field": "image",
        "filename": "photo.jpg",
        "content_type": "image/jpeg",
        "file": "files/pixel.jpg",
    }
    follow = ask("Depuis quand ?", "Préciser l'observation.")
    secret_http = {"error": "http", "detail": f"failure with {SECRET}"}
    items: list[dict[str, Any]] = [
        {
            "id": "health/ok",
            "route": "health",
            "steps": [_step("GET", "/api/health", ANONYMOUS)],
        },
        {
            "id": "list/empty",
            "route": "list",
            "steps": [_step("GET", "/api/investigations", member())],
        },
        {
            "id": "list/newest_twenty",
            "route": "list",
            "provider": {"repeat": True, "steps": [{"decision": ask()}]},
            "steps": [
                *[_create(ask()) for _ in range(21)],
                _step("GET", "/api/investigations", member()),
            ],
        },
        {
            "id": "create/accepted",
            "route": "create",
            "provider": {"steps": [{"decision": ask()}]},
            "steps": [_create(ask())],
        },
        {
            "id": "create/empty_text",
            "route": "create",
            "steps": [
                _step("POST", "/api/investigations", member(), body={"problem": ""}),
                _step("GET", "/api/investigations", member()),
            ],
        },
        {
            "id": "create/blank_text",
            "route": "create",
            "steps": [
                _step(
                    "POST",
                    "/api/investigations",
                    member(),
                    body={"problem": "   "},
                ),
                _step("GET", "/api/investigations", member()),
            ],
        },
        {
            "id": "create/decision_refused",
            "route": "create",
            "provider": {
                "steps": [
                    {
                        "decision": ask(
                            "Ouvrir le conducteur sous tension",
                            "Action proposée.",
                        )
                    }
                ]
            },
            "steps": [
                _create(ask("Ouvrir le conducteur sous tension", "Action proposée.")),
                _step("GET", "/api/investigations/{id}", member()),
            ],
        },
        {
            "id": "create/provider_unavailable",
            "route": "create",
            "provider": {"steps": [secret_http]},
            "forbidden": [SECRET],
            "steps": [
                _create(ask()),
                _step("GET", "/api/investigations/{id}", member()),
            ],
        },
        {
            "id": "create/provider_timeout",
            "route": "create",
            "provider": {
                "steps": [{"error": "timeout", "detail": f"timeout {SECRET}"}]
            },
            "forbidden": [SECRET],
            "steps": [
                _create(ask()),
                _step("GET", "/api/investigations/{id}", member()),
            ],
        },
        {
            "id": "create/internal_error",
            "route": "create",
            "provider": {
                "steps": [{"error": "internal", "detail": f"traceback {SECRET}"}]
            },
            "forbidden": [SECRET],
            "steps": [
                _create(ask()),
                _step("GET", "/api/investigations/{id}", member()),
            ],
        },
        {
            "id": "read/found",
            "route": "read",
            "provider": {"steps": [{"decision": ask()}]},
            "steps": [
                _create(ask()),
                _step("GET", "/api/investigations/{id}", member()),
            ],
        },
        {
            "id": "read/other_organization",
            "route": "read",
            "provider": {"steps": [{"decision": ask()}]},
            "steps": [
                _create(ask()),
                _step("GET", "/api/investigations/{id}", OTHER),
            ],
        },
        {
            "id": "read/unknown",
            "route": "read",
            "steps": [
                _step("GET", "/api/investigations/missing-investigation", member())
            ],
        },
        {
            "id": "message/question",
            "route": "message",
            "provider": {"steps": [{"decision": ask()}, {"decision": follow}]},
            "steps": [
                _create(ask()),
                _step(
                    "POST",
                    "/api/investigations/{id}/message",
                    member(),
                    body={"message": "Aucun code défaut n'est affiché."},
                ),
            ],
        },
        {
            "id": "message/decimal_comma",
            "route": "message",
            "provider": {"steps": [{"decision": measure()}, {"decision": follow}]},
            "steps": [
                _create(measure()),
                _step(
                    "POST",
                    "/api/investigations/{id}/message",
                    member(),
                    body={"message": "12,7"},
                ),
            ],
        },
        {
            "id": "message/wrong_action",
            "route": "message",
            "provider": {"steps": [{"decision": image()}]},
            "steps": [
                _create(image()),
                _step(
                    "POST",
                    "/api/investigations/{id}/message",
                    member(),
                    body={"message": "Je vois de la poussière."},
                ),
            ],
        },
        {
            "id": "message/missing_number",
            "route": "message",
            "provider": {"steps": [{"decision": measure()}]},
            "steps": [
                _create(measure()),
                _step(
                    "POST",
                    "/api/investigations/{id}/message",
                    member(),
                    body={"message": "abc"},
                ),
            ],
        },
        {
            "id": "message/non_finite_value",
            "route": "message",
            "provider": {"steps": [{"decision": measure()}]},
            "steps": [
                _create(measure()),
                _step(
                    "POST",
                    "/api/investigations/{id}/message",
                    member(),
                    body={"message": "NaN"},
                ),
            ],
        },
        {
            "id": "message/non_finite_infinity",
            "route": "message",
            "provider": {"steps": [{"decision": measure()}]},
            "steps": [
                _create(measure()),
                _step(
                    "POST",
                    "/api/investigations/{id}/message",
                    member(),
                    body={"message": "Infinity"},
                ),
            ],
        },
        {
            "id": "measurement/accepted",
            "route": "measurement",
            "provider": {"steps": [{"decision": measure()}, {"decision": follow}]},
            "steps": [
                _create(measure()),
                _step(
                    "POST",
                    "/api/investigations/{id}/measurement",
                    member(),
                    body={
                        "measurement_type": "dc_voltage",
                        "value": 12.7,
                        "unit": "V",
                        "location": "onduleur",
                    },
                ),
            ],
        },
        {
            "id": "measurement/unknown_type",
            "route": "measurement",
            "provider": {"steps": [{"decision": measure()}]},
            "steps": [
                _create(measure()),
                _step(
                    "POST",
                    "/api/investigations/{id}/measurement",
                    member(),
                    body={
                        "measurement_type": "voltage",
                        "value": 12.7,
                        "unit": "V",
                        "location": "onduleur",
                    },
                ),
            ],
        },
        {
            "id": "measurement/wrong_unit",
            "route": "measurement",
            "provider": {"steps": [{"decision": measure()}]},
            "steps": [
                _create(measure()),
                _step(
                    "POST",
                    "/api/investigations/{id}/measurement",
                    member(),
                    body={
                        "measurement_type": "dc_voltage",
                        "value": 12.7,
                        "unit": "mV",
                        "location": "onduleur",
                    },
                ),
            ],
        },
        {
            "id": "measurement/different_measurement",
            "route": "measurement",
            "provider": {"steps": [{"decision": measure()}]},
            "steps": [
                _create(measure()),
                _step(
                    "POST",
                    "/api/investigations/{id}/measurement",
                    member(),
                    body={
                        "measurement_type": "ac_voltage",
                        "value": 230,
                        "unit": "V",
                        "location": "onduleur",
                    },
                ),
            ],
        },
        {
            "id": "measurement/different_location",
            "route": "measurement",
            "provider": {"steps": [{"decision": measure()}]},
            "steps": [
                _create(measure()),
                _step(
                    "POST",
                    "/api/investigations/{id}/measurement",
                    member(),
                    body={
                        "measurement_type": "dc_voltage",
                        "value": 12.7,
                        "unit": "V",
                        "location": "toit",
                    },
                ),
            ],
        },
        {
            "id": "measurement/non_finite_body",
            "route": "measurement",
            "provider": {"steps": [{"decision": measure()}]},
            "steps": [
                _create(measure()),
                _step(
                    "POST",
                    "/api/investigations/{id}/measurement",
                    member(),
                    body_raw=(
                        '{"measurement_type":"dc_voltage","value":NaN,'
                        '"unit":"V","location":"onduleur"}'
                    ),
                ),
            ],
        },
        {
            "id": "measurement/non_finite_infinity",
            "route": "measurement",
            "provider": {"steps": [{"decision": measure()}]},
            "steps": [
                _create(measure()),
                _step(
                    "POST",
                    "/api/investigations/{id}/measurement",
                    member(),
                    body_raw=(
                        '{"measurement_type":"dc_voltage","value":Infinity,'
                        '"unit":"V","location":"onduleur"}'
                    ),
                ),
            ],
        },
        {
            "id": "measurement/string_value",
            "route": "measurement",
            "provider": {"steps": [{"decision": measure()}]},
            "steps": [
                _create(measure()),
                _step(
                    "POST",
                    "/api/investigations/{id}/measurement",
                    member(),
                    body_raw=(
                        '{"measurement_type":"dc_voltage","value":"abc",'
                        '"unit":"V","location":"onduleur"}'
                    ),
                ),
            ],
        },
        {
            "id": "measurement/location_too_long",
            "route": "measurement",
            "provider": {"steps": [{"decision": measure()}]},
            "steps": [
                _create(measure()),
                _step(
                    "POST",
                    "/api/investigations/{id}/measurement",
                    member(),
                    body={
                        "measurement_type": "dc_voltage",
                        "value": 12.7,
                        "unit": "V",
                        "location": "a" * 201,
                    },
                ),
            ],
        },
        {
            "id": "measurement/blank_location",
            "route": "measurement",
            "provider": {"steps": [{"decision": measure()}]},
            "steps": [
                _create(measure()),
                _step(
                    "POST",
                    "/api/investigations/{id}/measurement",
                    member(),
                    body={
                        "measurement_type": "dc_voltage",
                        "value": 12.7,
                        "unit": "V",
                        "location": " ",
                    },
                ),
            ],
        },
        {
            "id": "transcription/accepted_16k",
            "route": "transcription",
            "provider": {"steps": [{"decision": ask()}]},
            "transcriber": {"transcription": "Aucun défaut n'est affiché."},
            "steps": [
                _create(ask()),
                _step(
                    "POST",
                    "/api/investigations/{id}/transcribe",
                    member(),
                    file=audio,
                ),
            ],
        },
        {
            "id": "transcription/accepted_24k",
            "route": "transcription",
            "provider": {"steps": [{"decision": ask()}]},
            "transcriber": {"transcription": "Aucun défaut n'est affiché."},
            "steps": [
                _create(ask()),
                _step(
                    "POST",
                    "/api/investigations/{id}/transcribe",
                    member(),
                    file={**audio, "file": "files/tone-24k.wav"},
                ),
            ],
        },
        {
            "id": "transcription/without_pending_question",
            "route": "transcription",
            "provider": {"steps": [{"decision": measure()}]},
            "transcriber": {"transcription": "Douze volts."},
            "steps": [
                _create(measure()),
                _step(
                    "POST",
                    "/api/investigations/{id}/transcribe",
                    member(),
                    file=audio,
                ),
                _step("GET", "/api/investigations/{id}", member()),
            ],
        },
        {
            "id": "transcription/too_large",
            "route": "transcription",
            "provider": {"steps": [{"decision": ask()}]},
            "steps": [
                _create(ask()),
                _step(
                    "POST",
                    "/api/investigations/{id}/transcribe",
                    member(),
                    file={
                        "field": "audio",
                        "filename": "recording.wav",
                        "content_type": "audio/wav",
                        "fill_bytes": 32 * 1024 * 1024 + 1,
                    },
                ),
            ],
        },
        {
            "id": "transcription/too_long",
            "route": "transcription",
            "provider": {"steps": [{"decision": ask()}]},
            "steps": [
                _create(ask()),
                _step(
                    "POST",
                    "/api/investigations/{id}/transcribe",
                    member(),
                    file={
                        "field": "audio",
                        "filename": "recording.wav",
                        "content_type": "audio/wav",
                        "wav": {
                            "channels": 1,
                            "sample_width": 2,
                            "rate": 16000,
                            "seconds": 601,
                        },
                    },
                ),
            ],
        },
        {
            "id": "transcription/unsupported_type",
            "route": "transcription",
            "provider": {"steps": [{"decision": ask()}]},
            "steps": [
                _create(ask()),
                _step(
                    "POST",
                    "/api/investigations/{id}/transcribe",
                    member(),
                    file={
                        "field": "audio",
                        "filename": "recording.webm",
                        "content_type": "audio/webm",
                        "file": "files/invalid.bin",
                    },
                ),
            ],
        },
        {
            "id": "transcription/stereo",
            "route": "transcription",
            "provider": {"steps": [{"decision": ask()}]},
            "steps": [
                _create(ask()),
                _step(
                    "POST",
                    "/api/investigations/{id}/transcribe",
                    member(),
                    file={**audio, "file": "files/stereo.wav"},
                ),
            ],
        },
        {
            "id": "transcription/eight_bit",
            "route": "transcription",
            "provider": {"steps": [{"decision": ask()}]},
            "steps": [
                _create(ask()),
                _step(
                    "POST",
                    "/api/investigations/{id}/transcribe",
                    member(),
                    file={**audio, "file": "files/width-8.wav"},
                ),
            ],
        },
        {
            "id": "transcription/wrong_rate",
            "route": "transcription",
            "provider": {"steps": [{"decision": ask()}]},
            "steps": [
                _create(ask()),
                _step(
                    "POST",
                    "/api/investigations/{id}/transcribe",
                    member(),
                    file={**audio, "file": "files/rate-8k.wav"},
                ),
            ],
        },
        {
            "id": "transcription/invalid_wav",
            "route": "transcription",
            "provider": {"steps": [{"decision": ask()}]},
            "steps": [
                _create(ask()),
                _step(
                    "POST",
                    "/api/investigations/{id}/transcribe",
                    member(),
                    file={**audio, "file": "files/invalid.bin"},
                ),
            ],
        },
        {
            "id": "transcription/non_pcm",
            "route": "transcription",
            "provider": {"steps": [{"decision": ask()}]},
            "steps": [
                _create(ask()),
                _step(
                    "POST",
                    "/api/investigations/{id}/transcribe",
                    member(),
                    file={**audio, "file": "files/float.wav"},
                ),
            ],
        },
        {
            "id": "transcription/provider_unavailable",
            "route": "transcription",
            "provider": {"steps": [{"decision": ask()}]},
            "transcriber": secret_http,
            "forbidden": [SECRET],
            "steps": [
                _create(ask()),
                _step(
                    "POST",
                    "/api/investigations/{id}/transcribe",
                    member(),
                    file=audio,
                ),
            ],
        },
        {
            "id": "image/accepted_jpeg",
            "route": "image",
            "provider": {"steps": [{"decision": image()}, {"decision": follow}]},
            "analyzer": {
                "description": "Poussière visible sur le module.",
                "certainty": 0.4,
            },
            "steps": [
                _create(image()),
                _step(
                    "POST",
                    "/api/investigations/{id}/image",
                    member(),
                    file=jpeg,
                ),
            ],
        },
        {
            "id": "image/accepted_png",
            "route": "image",
            "provider": {"steps": [{"decision": image()}, {"decision": follow}]},
            "analyzer": {
                "description": "Poussière visible sur le module.",
                "certainty": 0.4,
            },
            "steps": [
                _create(image()),
                _step(
                    "POST",
                    "/api/investigations/{id}/image",
                    member(),
                    file={
                        **jpeg,
                        "filename": "photo.png",
                        "content_type": "image/png",
                        "file": "files/pixel.png",
                    },
                ),
            ],
        },
        {
            "id": "image/accepted_webp",
            "route": "image",
            "provider": {"steps": [{"decision": image()}, {"decision": follow}]},
            "analyzer": {
                "description": "Poussière visible sur le module.",
                "certainty": 0.4,
            },
            "steps": [
                _create(image()),
                _step(
                    "POST",
                    "/api/investigations/{id}/image",
                    member(),
                    file={
                        **jpeg,
                        "filename": "photo.webp",
                        "content_type": "image/webp",
                        "file": "files/pixel.webp",
                    },
                ),
            ],
        },
        {
            "id": "image/not_waiting",
            "route": "image",
            "provider": {"steps": [{"decision": ask()}]},
            "steps": [
                _create(ask()),
                _step(
                    "POST",
                    "/api/investigations/{id}/image",
                    member(),
                    file=jpeg,
                ),
            ],
        },
        {
            "id": "image/too_large",
            "route": "image",
            "provider": {"steps": [{"decision": image()}]},
            "steps": [
                _create(image()),
                _step(
                    "POST",
                    "/api/investigations/{id}/image",
                    member(),
                    file={
                        **jpeg,
                        "fill_bytes": 10 * 1024 * 1024 + 1,
                        "file": None,
                    },
                ),
            ],
        },
        {
            "id": "image/unsupported_type",
            "route": "image",
            "provider": {"steps": [{"decision": image()}]},
            "steps": [
                _create(image()),
                _step(
                    "POST",
                    "/api/investigations/{id}/image",
                    member(),
                    file={
                        **jpeg,
                        "filename": "photo.gif",
                        "content_type": "image/gif",
                        "file": "files/invalid.bin",
                    },
                ),
            ],
        },
        {
            "id": "image/mismatched_bytes",
            "route": "image",
            "provider": {"steps": [{"decision": image()}]},
            "steps": [
                _create(image()),
                _step(
                    "POST",
                    "/api/investigations/{id}/image",
                    member(),
                    file={
                        **jpeg,
                        "content_type": "image/png",
                        "file": "files/pixel.jpg",
                    },
                ),
            ],
        },
        {
            "id": "image/provider_unavailable",
            "route": "image",
            "provider": {"steps": [{"decision": image()}]},
            "analyzer": secret_http,
            "forbidden": [SECRET],
            "steps": [
                _create(image()),
                _step(
                    "POST",
                    "/api/investigations/{id}/image",
                    member(),
                    file=jpeg,
                ),
            ],
        },
        {
            "id": "auth/unauthorized",
            "route": "auth",
            "steps": [_step("GET", "/api/investigations", ANONYMOUS)],
        },
        {
            "id": "auth/no_organization",
            "route": "auth",
            "steps": [_step("GET", "/api/investigations", NO_ORG)],
        },
        {
            "id": "auth/permission_denied",
            "route": "auth",
            "steps": [
                _step(
                    "POST",
                    "/api/investigations",
                    READ_ONLY,
                    body={"problem": PROBLEM},
                ),
                _step("GET", "/api/investigations", member()),
            ],
        },
        {
            "id": "auth/unknown_fields",
            "route": "auth",
            "steps": [
                _step(
                    "POST",
                    "/api/investigations",
                    member(),
                    body={"problem": PROBLEM, "note": "ignoré"},
                ),
                _step("GET", "/api/investigations", member()),
            ],
        },
        {
            "id": "auth/body_identifiers_ignored",
            "route": "auth",
            "steps": [
                _step(
                    "POST",
                    "/api/investigations",
                    member(),
                    body={
                        "problem": PROBLEM,
                        "user_id": "user_from_body",
                        "organization_id": "org_from_body",
                    },
                ),
                _step("GET", "/api/investigations", member()),
            ],
        },
    ]
    for item in items:
        item.setdefault("provider", {"repeat": False, "steps": []})
        item["provider"].setdefault("repeat", False)
        item.setdefault("transcriber", None)
        item.setdefault("analyzer", None)
        item.setdefault("forbidden", [])
    return items


def _execute(spec: dict[str, Any], files: dict[str, bytes]) -> dict[str, Any]:
    sequence = Sequence()
    authenticator = MutableAuthenticator()
    provider = ScriptedProvider(
        spec["provider"]["steps"], bool(spec["provider"]["repeat"])
    )
    transcriber = ScriptedTranscriber(spec["transcriber"])
    analyzer = ScriptedAnalyzer(spec["analyzer"])
    directory = tempfile.mkdtemp(prefix="bintu-http-")
    saved = {
        name: os.environ.pop(name, None)
        for name in (
            "BINTU_DEMO_ORGANIZATION_ID",
            "BINTU_MIGRATION_USER_ID",
            "BINTU_DB_PATH",
        )
    }
    last_id: str | None = None
    recorded: list[dict[str, Any]] = []
    try:
        import bintu_agent_core.sqlite_store as store
        import bintu_backend.app as app_module

        store.uuid4 = sequence.uuid4
        store._utc_now = sequence.now
        app_module.uuid4 = sequence.uuid4
        app = create_app(
            database_path=str(Path(directory) / "api.sqlite3"),
            provider_factory=lambda: provider,
            transcriber_factory=lambda: transcriber,
            image_analyzer_factory=lambda: analyzer,
            authenticator=authenticator,
        )
        with TestClient(app, raise_server_exceptions=False) as client:
            for step in spec["steps"]:
                path = step["path"].replace("{id}", last_id or "")
                authenticator.context = _context(step["auth"])
                issued = len(sequence.issued)
                response = _send(client, step["method"], path, step, files)
                body = response.json()
                content_type = response.headers.get("content-type", "")
                if isinstance(body, dict) and isinstance(
                    body.get("investigation_id"), str
                ):
                    last_id = body["investigation_id"]
                elif (
                    step["method"] == "POST"
                    and step["path"] == "/api/investigations"
                    and len(sequence.issued) > issued
                ):
                    last_id = sequence.issued[issued]
                request: dict[str, Any] = {
                    "method": step["method"],
                    "path": path,
                }
                if "body" in step:
                    request["headers"] = {"content-type": "application/json"}
                    request["body"] = step["body"]
                elif "body_raw" in step:
                    request["headers"] = {"content-type": "application/json"}
                    request["body_raw"] = step["body_raw"]
                elif "file" in step:
                    recipe = {
                        key: value
                        for key, value in step["file"].items()
                        if value is not None and key != "file" or key == "file" and value
                    }
                    request["file"] = recipe
                else:
                    request["headers"] = {}
                text = response.text
                for secret in spec["forbidden"]:
                    if secret in text:
                        raise RuntimeError(
                            f"{spec['id']} leaked a provider secret"
                        )
                recorded.append(
                    {
                        "auth": step["auth"],
                        "request": request,
                        "expect": {
                            "status": response.status_code,
                            "headers": {"content-type": content_type},
                            "body": body,
                        },
                    }
                )
    finally:
        for name, value in saved.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        shutil.rmtree(directory, ignore_errors=True)
    return {
        "id": spec["id"],
        "route": spec["route"],
        "provider": spec["provider"],
        "transcriber": spec["transcriber"],
        "analyzer": spec["analyzer"],
        "forbidden": spec["forbidden"],
        "steps": recorded,
    }


def _send(
    client: TestClient,
    method: str,
    path: str,
    step: dict[str, Any],
    files: dict[str, bytes],
) -> Any:
    if "file" in step:
        recipe = {key: value for key, value in step["file"].items() if value is not None}
        payload = _materialize(recipe, files)
        return client.request(
            method,
            path,
            files={
                recipe["field"]: (
                    recipe["filename"],
                    payload,
                    recipe["content_type"],
                )
            },
        )
    if "body_raw" in step:
        return client.request(
            method,
            path,
            content=step["body_raw"].encode("utf-8"),
            headers={"content-type": "application/json"},
        )
    if "body" in step:
        return client.request(method, path, json=step["body"])
    return client.request(method, path)


def export_fixtures(root: Path | None = FIXTURE_ROOT) -> dict[str, bytes]:
    files = small_files()
    produced: dict[str, bytes] = {
        name: data for name, data in sorted(files.items())
    }
    for spec in cases():
        fixture = _execute(spec, files)
        produced[f"{spec['id']}.json"] = _dump(fixture)
    if root is not None:
        for path in root.rglob("*"):
            if path.is_file() and path.relative_to(root).as_posix() not in produced:
                path.unlink()
        for name, data in produced.items():
            destination = root / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
    return produced


if __name__ == "__main__":
    written = export_fixtures()
    print(f"exported {sum(1 for name in written if name.endswith('.json'))} http fixtures")
