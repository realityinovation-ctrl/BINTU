"""Thin Muse Spark adapter for the provider-neutral Agent Contract."""

from __future__ import annotations

import json
import os
from typing import Any

import httpx
from pydantic import ValidationError

from bintu_agent_core.errors import (
    ProviderConfigurationError,
    ProviderHTTPError,
    ProviderResponseError,
    ProviderTimeoutError,
)
from bintu_agent_core.models import AgentDecision, InvestigationState, ToolName


META_ENDPOINT = "https://api.meta.ai/v1/chat/completions"
META_MODEL = "muse-spark-1.3"
DEFAULT_TIMEOUT_SECONDS = 30.0

SYSTEM_PROMPT = """\
You select exactly one next action for a BINTU photovoltaic investigation.
Return one JSON object matching the supplied AgentDecision JSON schema.
Do not add observations or evidence. Do not modify hypotheses or state.
Do not execute tools. Use only a tool_name and arguments allowed by the schema.
The backend will independently validate safety and business rules.
Do not include chain-of-thought. The reason must be a short operational reason.
"""


class MetaAIProvider:
    """Translate one Muse Spark completion into one AgentDecision."""

    def __init__(
        self,
        *,
        client: httpx.Client | None = None,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        api_key = os.environ.get("MODEL_API_KEY")
        if not api_key or not api_key.strip():
            raise ProviderConfigurationError(
                "MODEL_API_KEY environment variable is required"
            )
        self._api_key = api_key
        self._client = client or httpx.Client(timeout=timeout_seconds)
        self._owns_client = client is None

    def decide_next(self, state: InvestigationState) -> AgentDecision:
        request_body = {
            "model": META_MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "agent_decision_schema": AgentDecision.model_json_schema(),
                            "investigation_state": state.model_dump(mode="json"),
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
            "temperature": 0,
        }
        try:
            response = self._client.post(
                META_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=request_body,
            )
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError("Meta request timed out") from exc
        except httpx.RequestError as exc:
            raise ProviderHTTPError("Meta request failed") from exc

        if response.is_error:
            raise ProviderHTTPError(
                f"Meta returned HTTP status {response.status_code}"
            )

        content = self._extract_content(response)
        payload = self._parse_decision_json(content)
        self._validate_top_level_fields(payload)
        try:
            ToolName(payload["tool_name"])
        except ValueError as exc:
            raise ProviderResponseError(
                f"unknown tool_name: {payload['tool_name']!r}"
            ) from exc
        try:
            return AgentDecision.model_validate(payload)
        except ValidationError as exc:
            details = exc.errors(include_url=False, include_input=False)
            raise ProviderResponseError(
                f"invalid AgentDecision: {details}"
            ) from exc

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> MetaAIProvider:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    @staticmethod
    def _extract_content(response: httpx.Response) -> str:
        try:
            body = response.json()
            content = body["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise ProviderResponseError(
                "Meta response does not contain choices[0].message.content"
            ) from exc
        if not isinstance(content, str) or not content.strip():
            raise ProviderResponseError("Meta response content must be a non-empty string")
        return content

    @staticmethod
    def _parse_decision_json(content: str) -> dict[str, Any]:
        stripped = content.strip()
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            parsed = MetaAIProvider._extract_single_embedded_object(stripped)
        if not isinstance(parsed, dict):
            raise ProviderResponseError("decision JSON must be an object")
        return parsed

    @staticmethod
    def _extract_single_embedded_object(content: str) -> dict[str, Any]:
        start = content.find("{")
        if start < 0:
            raise ProviderResponseError("Meta response content is not valid JSON")
        decoder = json.JSONDecoder()
        try:
            parsed, consumed = decoder.raw_decode(content[start:])
        except json.JSONDecodeError as exc:
            raise ProviderResponseError(
                "Meta response content is not valid JSON"
            ) from exc
        suffix = content[start + consumed :]
        if "{" in suffix or "}" in suffix:
            raise ProviderResponseError(
                "Meta response contains more than one JSON object"
            )
        if not isinstance(parsed, dict):
            raise ProviderResponseError("decision JSON must be an object")
        return parsed

    @staticmethod
    def _validate_top_level_fields(payload: dict[str, Any]) -> None:
        for field in ("tool_name", "arguments", "reason"):
            if field not in payload:
                raise ProviderResponseError(f"missing required field: {field}")
