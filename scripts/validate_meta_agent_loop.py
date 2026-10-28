"""Manual two-call validation of the real Meta decision loop.

This script is intentionally outside pytest. It performs at most two live Meta
requests and does not interpret measurements or invent observations.

Run:

    .\\.venv\\Scripts\\python scripts\\validate_meta_agent_loop.py
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

import httpx

from bintu_agent_core.engine import InvestigationEngine
from bintu_agent_core.errors import (
    AgentCoreError,
    DecisionValidationError,
    UnsupportedToolError,
)
from bintu_agent_core.meta_provider import MetaAIProvider
from bintu_agent_core.models import (
    AgentDecision,
    EvidenceRelation,
    EvidenceStrength,
    HypothesisId,
    HypothesisImpact,
    InvestigationState,
    InvestigationStatus,
    Problem,
    ToolName,
)
from bintu_agent_core.provider import MockAIProvider
from bintu_agent_core.sqlite_store import SQLiteInvestigationStore
from bintu_agent_core.validation import validate_decision


ROOT = Path(__file__).parents[1]
FIXTURE = ROOT / "tests" / "fixtures" / "full_investigation_scenario.json"
PROBLEM = (
    "La production photovoltaïque a fortement diminué depuis quelques jours."
)
CONTROLLED_ANSWER = "Aucun autre symptôme nouveau n'a été observé."
CONTROLLED_MEASUREMENT = 28.0


class RecordingTransport(httpx.BaseTransport):
    """Count live requests and retain redacted response metadata."""

    def __init__(self) -> None:
        self.inner = httpx.HTTPTransport()
        self.calls = 0
        self.responses: list[dict[str, object]] = []

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        content = request.read()
        self.calls += 1
        if self.calls > 2:
            raise RuntimeError("Meta call limit exceeded")
        outbound = httpx.Request(
            request.method,
            request.url,
            headers=request.headers,
            content=content,
        )
        response = self.inner.handle_request(outbound)
        raw = response.read()
        sent_state = json.loads(json.loads(content)["messages"][1]["content"])[
            "investigation_state"
        ]
        try:
            body = json.loads(raw)
        except json.JSONDecodeError:
            body = {}
        message = ""
        if isinstance(body, dict):
            try:
                message = body["choices"][0]["message"]["content"]
            except (KeyError, IndexError, TypeError):
                message = ""
        self.responses.append(
            {
                "status": response.status_code,
                "model": body.get("model") if isinstance(body, dict) else None,
                "usage": body.get("usage") if isinstance(body, dict) else None,
                "content": message,
                "sent_state": sent_state,
            }
        )
        return httpx.Response(
            response.status_code,
            headers=response.headers,
            content=raw,
            request=request,
        )

    def close(self) -> None:
        self.inner.close()


def impact(
    hypothesis_id: HypothesisId, relation: EvidenceRelation
) -> HypothesisImpact:
    return HypothesisImpact(
        hypothesis_id=hypothesis_id,
        relation=relation,
        strength=EvidenceStrength.INDICATIVE,
    )


def validated_evidence_state(database: Path) -> InvestigationState:
    """Rebuild the validated scenario strictly before its final diagnosis."""

    decisions = json.loads(FIXTURE.read_text(encoding="utf-8"))
    store = SQLiteInvestigationStore(database)
    state = store.create_investigation()
    state.problem = Problem(description=PROBLEM)
    engine = InvestigationEngine(state, MockAIProvider(decisions[:2]))
    engine.advance()
    engine.submit_technician_answer(
        "answer-history",
        "L'installation fonctionnait normalement auparavant.",
        impacts=[impact(HypothesisId.H0, EvidenceRelation.CONTRADICTORY)],
    )
    engine.advance()
    engine.submit_image_analysis(
        "image-dust",
        "Une couche de poussière couvre une grande partie de plusieurs panneaux.",
        0.62,
        impacts=[impact(HypothesisId.H1, EvidenceRelation.SUPPORTING)],
    )
    store.save_investigation(state)
    restored = store.get_investigation(state.investigation_id)
    engine = InvestigationEngine(restored, MockAIProvider(decisions[2:3]))
    engine.advance()
    engine.submit_measurement(
        "m-panels",
        31.5,
        impacts=[impact(HypothesisId.H2, EvidenceRelation.SUPPORTING)],
    )
    store.save_investigation(restored)
    return store.get_investigation(restored.investigation_id)


def state_view(state: InvestigationState) -> dict[str, object]:
    pending = None
    if state.pending_action is not None:
        pending = {
            "action_id": state.pending_action.action_id,
            **state.pending_action.decision.model_dump(mode="json"),
        }
    return {
        "status": state.status.value,
        "problem": state.problem.description if state.problem else None,
        "step_count": state.step_count,
        "hypotheses": {
            hypothesis_id.value: hypothesis.status.value
            for hypothesis_id, hypothesis in state.hypotheses.items()
        },
        "observations": [
            observation.model_dump(mode="json")
            for observation in state.observations.values()
        ],
        "measurements": [
            measurement.model_dump(mode="json")
            for measurement in state.measurements.values()
        ],
        "evidence": [
            evidence.model_dump(mode="json")
            for evidence in state.evidence.values()
        ],
        "pending_action": pending,
        "conclusion": (
            state.conclusion.model_dump(mode="json")
            if state.conclusion is not None
            else None
        ),
        "timeline_count": len(state.timeline),
    }


def raw_decision_fields(content: str) -> dict[str, object]:
    try:
        payload = json.loads(content.strip())
    except json.JSONDecodeError:
        return {"json_valid": False}
    if not isinstance(payload, dict):
        return {"json_valid": False}
    return {
        "json_valid": True,
        "schema_version": payload.get("schema_version"),
        "hypothesis_updates": payload.get("hypothesis_updates"),
        "top_level_fields": sorted(payload),
    }


def decision_view(decision: AgentDecision) -> dict[str, object]:
    return decision.model_dump(mode="json")


def apply_validated_decision(
    state: InvestigationState, decision: AgentDecision
) -> dict[str, object]:
    before = state.model_dump(mode="json")
    try:
        validate_decision(state, decision)
    except DecisionValidationError as exc:
        return {
            "accepted": False,
            "error": str(exc),
            "state_unchanged": state.model_dump(mode="json") == before,
        }
    engine = InvestigationEngine(
        state, MockAIProvider([decision.model_copy(deep=True)])
    )
    try:
        engine.advance()
    except UnsupportedToolError as exc:
        return {
            "accepted": False,
            "error": str(exc),
            "state_unchanged": state.model_dump(mode="json") == before,
        }
    except AgentCoreError as exc:
        return {
            "accepted": False,
            "error": str(exc),
            "state_unchanged": state.model_dump(mode="json") == before,
        }
    return {
        "accepted": True,
        "error": None,
        "state_unchanged": False,
    }


def continue_without_invented_observation(
    state: InvestigationState,
) -> tuple[bool, str]:
    pending = state.pending_action
    if pending is None:
        if state.status is InvestigationStatus.INVESTIGATING:
            return True, "core_action_applied"
        return False, f"terminal_status:{state.status.value}"
    arguments = pending.decision.arguments
    tool_name = pending.decision.tool_name
    engine = InvestigationEngine(state, MockAIProvider([]))
    if tool_name is ToolName.ASK_TECHNICIAN:
        engine.submit_technician_answer("answer-controlled", CONTROLLED_ANSWER)
        return True, "controlled_technician_answer"
    if tool_name is ToolName.REQUEST_MEASUREMENT:
        engine.submit_measurement("measurement-controlled", CONTROLLED_MEASUREMENT)
        return True, "controlled_measurement"
    if tool_name is ToolName.ANALYZE_IMAGE:
        return False, "image_requires_human_observation"
    return False, f"unsupported_continuation:{tool_name.value}"


def main() -> None:
    if not os.environ.get("MODEL_API_KEY", "").strip():
        raise SystemExit("MODEL_API_KEY absente")
    with tempfile.TemporaryDirectory(prefix="bintu-meta-loop-") as directory:
        state = validated_evidence_state(Path(directory) / "loop.sqlite3")
        if state.conclusion is not None:
            raise SystemExit("diagnostic injecté dans l'état initial")
        transport = RecordingTransport()
        client = httpx.Client(transport=transport, timeout=90)
        provider = MetaAIProvider(client=client, timeout_seconds=90)
        report: dict[str, object] = {
            "initial_state": state_view(state),
            "calls": [],
        }
        try:
            for call_number in (1, 2):
                print(f"REAL META CALL #{call_number}", flush=True)
                before = state.model_dump(mode="json")
                try:
                    decision = provider.decide_next(state.model_copy(deep=True))
                except AgentCoreError as exc:
                    report["calls"].append(
                        {
                            "call": call_number,
                            "http": (
                                transport.responses[-1]["status"]
                                if transport.responses
                                else None
                            ),
                            "model": (
                                transport.responses[-1]["model"]
                                if transport.responses
                                else None
                            ),
                            "usage": (
                                transport.responses[-1]["usage"]
                                if transport.responses
                                else None
                            ),
                            "provider_error": str(exc),
                            "state_unchanged": state.model_dump(mode="json") == before,
                        }
                    )
                    break
                provider_did_not_mutate = state.model_dump(mode="json") == before
                raw = raw_decision_fields(str(transport.responses[-1]["content"]))
                validation = apply_validated_decision(state, decision)
                call: dict[str, object] = {
                    "call": call_number,
                    "http": transport.responses[-1]["status"],
                    "model": transport.responses[-1]["model"],
                    "usage": transport.responses[-1]["usage"],
                    "provider_did_not_mutate_state": provider_did_not_mutate,
                    "raw_fields": raw,
                    "decision": decision_view(decision),
                    "core": validation,
                    "state_after_validation": state_view(state),
                }
                if call_number == 2:
                    sent = transport.responses[-1]["sent_state"]
                    call["new_evidence_visible_to_meta"] = (
                        CONTROLLED_ANSWER in json.dumps(sent, ensure_ascii=False)
                        or "measurement-controlled" in json.dumps(sent)
                        or "Comparaison factuelle" in json.dumps(sent, ensure_ascii=False)
                    )
                report["calls"].append(call)
                if not validation["accepted"]:
                    break
                if call_number == 2:
                    break
                continued, reason = continue_without_invented_observation(state)
                call["continuation"] = reason
                call["state_before_second_call"] = state_view(state)
                if not continued:
                    break
        finally:
            provider.close()
            client.close()
        print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
