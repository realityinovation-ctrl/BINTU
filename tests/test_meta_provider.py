import copy
import json

import httpx
import pytest

from bintu_agent_core.errors import (
    ProviderConfigurationError,
    ProviderHTTPError,
    ProviderResponseError,
    ProviderTimeoutError,
)
from bintu_agent_core.meta_provider import (
    DEFAULT_TIMEOUT_SECONDS,
    MAX_DECISION_TIMEOUT_SECONDS,
    META_ENDPOINT,
    MetaAIProvider,
    resolve_decision_timeout,
)
from bintu_agent_core.models import (
    HypothesisId,
    InvestigationState,
    RequestMeasurementArguments,
    ToolName,
)


VALID_DECISION = {
    "tool_name": "request_measurement",
    "arguments": {
        "measurement_type": "dc_voltage",
        "location": "entrée DC de l'onduleur",
        "unit": "V",
        "distinguishes": ["H1", "H2"],
    },
    "reason": "Mesurer la tension pour distinguer le champ de la chaîne.",
}


def completion(content: str) -> dict[str, object]:
    return {"choices": [{"message": {"content": content}}]}


def provider_with_handler(
    monkeypatch: pytest.MonkeyPatch,
    handler: httpx.MockTransport,
) -> MetaAIProvider:
    monkeypatch.setenv("MODEL_API_KEY", "test-key-not-real")
    return MetaAIProvider(client=httpx.Client(transport=handler))


def test_valid_response_becomes_agent_decision(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == META_ENDPOINT
        assert request.headers["Authorization"] == "Bearer test-key-not-real"
        body = json.loads(request.content)
        assert body["model"] == "muse-spark-1.3"
        return httpx.Response(
            200, json=completion(json.dumps(VALID_DECISION)), request=request
        )

    provider = provider_with_handler(monkeypatch, httpx.MockTransport(handler))
    decision = provider.decide_next(InvestigationState(investigation_id="inv-1"))

    assert decision.tool_name is ToolName.REQUEST_MEASUREMENT
    assert isinstance(decision.arguments, RequestMeasurementArguments)
    assert decision.arguments.distinguishes == [
        HypothesisId.H1,
        HypothesisId.H2,
    ]


def test_single_json_object_embedded_in_text_is_accepted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    content = (
        "Décision proposée :\n```json\n"
        f"{json.dumps(VALID_DECISION, ensure_ascii=False)}"
        "\n```\n"
    )
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200, json=completion(content), request=request
        )
    )

    decision = provider_with_handler(monkeypatch, transport).decide_next(
        InvestigationState(investigation_id="inv-1")
    )

    assert decision.tool_name is ToolName.REQUEST_MEASUREMENT


def test_invalid_json_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            json=completion('{"tool_name": "ask_technician"'),
            request=request,
        )
    )

    with pytest.raises(ProviderResponseError, match="not valid JSON"):
        provider_with_handler(monkeypatch, transport).decide_next(
            InvestigationState(investigation_id="inv-1")
        )


def test_unknown_tool_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "tool_name": "unknown_tool",
        "arguments": {"distinguishes": ["H0"]},
        "reason": "Tester.",
    }
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200, json=completion(json.dumps(payload)), request=request
        )
    )

    with pytest.raises(ProviderResponseError, match="unknown tool_name"):
        provider_with_handler(monkeypatch, transport).decide_next(
            InvestigationState(investigation_id="inv-1")
        )


def test_invalid_arguments_are_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    incompatible_muse_payload = {
        "tool_name": "request_measurement",
        "arguments": {
            "measurements_needed": [
                "tension DC",
                "courant DC",
                "puissance AC onduleur",
            ]
        },
        "reason": "Obtenir les mesures.",
    }
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            json=completion(json.dumps(incompatible_muse_payload)),
            request=request,
        )
    )

    with pytest.raises(ProviderResponseError, match="invalid AgentDecision"):
        provider_with_handler(monkeypatch, transport).decide_next(
            InvestigationState(investigation_id="inv-1")
        )


def test_missing_required_field_is_rejected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "tool_name": "ask_technician",
        "arguments": {"question": "État ?", "distinguishes": ["H0", "H3"]},
    }
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200, json=completion(json.dumps(payload)), request=request
        )
    )

    with pytest.raises(ProviderResponseError, match="missing required field: reason"):
        provider_with_handler(monkeypatch, transport).decide_next(
            InvestigationState(investigation_id="inv-1")
        )


def test_meta_http_error_is_wrapped(monkeypatch: pytest.MonkeyPatch) -> None:
    transport = httpx.MockTransport(
        lambda request: httpx.Response(503, request=request)
    )

    with pytest.raises(ProviderHTTPError, match="HTTP status 503"):
        provider_with_handler(monkeypatch, transport).decide_next(
            InvestigationState(investigation_id="inv-1")
        )


def test_meta_timeout_is_wrapped(monkeypatch: pytest.MonkeyPatch) -> None:
    def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("simulated timeout", request=request)

    with pytest.raises(ProviderTimeoutError, match="timed out"):
        provider_with_handler(
            monkeypatch, httpx.MockTransport(timeout)
        ).decide_next(InvestigationState(investigation_id="inv-1"))


def test_missing_api_key_is_explicit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MODEL_API_KEY", raising=False)

    with pytest.raises(ProviderConfigurationError, match="MODEL_API_KEY"):
        MetaAIProvider(
            client=httpx.Client(
                transport=httpx.MockTransport(
                    lambda request: httpx.Response(200, request=request)
                )
            )
        )


def test_provider_does_not_mutate_investigation_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state = InvestigationState(investigation_id="inv-immutable")
    before = copy.deepcopy(state.model_dump())
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            json=completion(json.dumps(VALID_DECISION)),
            request=request,
        )
    )

    provider_with_handler(monkeypatch, transport).decide_next(state)

    assert state.model_dump() == before


def test_decision_timeout_defaults_above_observed_latency(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MODEL_API_KEY", "test-key-not-real")
    monkeypatch.delenv("META_DECISION_TIMEOUT_SECONDS", raising=False)

    provider = MetaAIProvider()
    try:
        assert provider._timeout_seconds == DEFAULT_TIMEOUT_SECONDS
        assert provider._timeout_seconds == 60
        assert provider._client.timeout.read == 60
    finally:
        provider.close()


def test_decision_timeout_reads_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MODEL_API_KEY", "test-key-not-real")
    monkeypatch.setenv("META_DECISION_TIMEOUT_SECONDS", "75")

    provider = MetaAIProvider()
    try:
        assert provider._timeout_seconds == 75
        assert provider._client.timeout.read == 75
    finally:
        provider.close()


def test_decision_timeout_rejects_unbounded_values(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("META_DECISION_TIMEOUT_SECONDS", raising=False)

    assert resolve_decision_timeout(None) == 60
    with pytest.raises(ProviderConfigurationError, match="at most"):
        resolve_decision_timeout(MAX_DECISION_TIMEOUT_SECONDS + 1)
    with pytest.raises(ProviderConfigurationError, match="at most"):
        resolve_decision_timeout(float("inf"))
    monkeypatch.setenv("META_DECISION_TIMEOUT_SECONDS", "slow")
    with pytest.raises(ProviderConfigurationError, match="positive"):
        resolve_decision_timeout(None)
    monkeypatch.setenv("META_DECISION_TIMEOUT_SECONDS", "0")
    with pytest.raises(ProviderConfigurationError, match="greater than 0"):
        resolve_decision_timeout(None)
