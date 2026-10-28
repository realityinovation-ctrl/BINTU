"""One manual Meta call that may propose hypothesis_updates.

This script is outside pytest. It performs exactly one live request.
A missing hypothesis_updates field is recorded, not retried.

Run:

    .\\.venv\\Scripts\\python scripts\\validate_hypothesis_update_meta.py
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

import httpx

from bintu_agent_core.errors import AgentCoreError
from bintu_agent_core.meta_provider import MetaAIProvider
from bintu_agent_core.models import InvestigationState
from validate_meta_agent_loop import (
    apply_validated_decision,
    decision_view,
    raw_decision_fields,
    state_view,
    validated_evidence_state,
)


class SingleCallTransport(httpx.BaseTransport):
    """Allow exactly one live request and keep redacted response metadata."""

    def __init__(self) -> None:
        self.inner = httpx.HTTPTransport()
        self.calls = 0
        self.status: int | None = None
        self.model: str | None = None
        self.usage: object = None
        self.content = ""

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        content = request.read()
        self.calls += 1
        if self.calls > 1:
            raise RuntimeError("Meta call limit exceeded")
        outbound = httpx.Request(
            request.method,
            request.url,
            headers=request.headers,
            content=content,
        )
        response = self.inner.handle_request(outbound)
        raw = response.read()
        self.status = response.status_code
        try:
            body = json.loads(raw)
        except json.JSONDecodeError:
            body = {}
        if isinstance(body, dict):
            model = body.get("model")
            self.model = model if isinstance(model, str) else None
            self.usage = body.get("usage")
            try:
                self.content = body["choices"][0]["message"]["content"]
            except (KeyError, IndexError, TypeError):
                self.content = ""
        return httpx.Response(
            response.status_code,
            headers=response.headers,
            content=raw,
            request=request,
        )

    def close(self) -> None:
        self.inner.close()


def hypotheses(state: InvestigationState) -> dict[str, str]:
    return {
        hypothesis_id.value: hypothesis.status.value
        for hypothesis_id, hypothesis in state.hypotheses.items()
    }


def main() -> None:
    if not os.environ.get("MODEL_API_KEY", "").strip():
        raise SystemExit("MODEL_API_KEY absente")
    with tempfile.TemporaryDirectory(prefix="bintu-hypothesis-meta-") as directory:
        state = validated_evidence_state(Path(directory) / "updates.sqlite3")
        before_dump = state.model_dump(mode="json")
        transport = SingleCallTransport()
        client = httpx.Client(transport=transport, timeout=90)
        provider = MetaAIProvider(client=client, timeout_seconds=90)
        print("REAL META CALL #1", flush=True)
        try:
            decision = provider.decide_next(state.model_copy(deep=True))
        except AgentCoreError as exc:
            report = {
                "http": transport.status,
                "model": transport.model,
                "usage": transport.usage,
                "provider_error": str(exc),
                "provider_did_not_mutate_state": (
                    state.model_dump(mode="json") == before_dump
                ),
                "raw_fields": raw_decision_fields(transport.content),
                "hypotheses_before": hypotheses(state),
            }
        else:
            provider_did_not_mutate = state.model_dump(mode="json") == before_dump
            core = apply_validated_decision(state, decision)
            report = {
                "http": transport.status,
                "model": transport.model,
                "usage": transport.usage,
                "provider_did_not_mutate_state": provider_did_not_mutate,
                "raw_fields": raw_decision_fields(transport.content),
                "decision": decision_view(decision),
                "core": core,
                "hypotheses_before": {
                    key: before_dump["hypotheses"][key]["status"]
                    for key in before_dump["hypotheses"]
                },
                "state_after_validation": state_view(state),
            }
        finally:
            provider.close()
            client.close()
        print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
