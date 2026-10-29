import json

import httpx
import pytest

from bintu_agent_core.engine import InvestigationEngine
from bintu_agent_core.errors import (
    DecisionValidationError,
    UnsupportedToolError,
)
from bintu_agent_core.meta_provider import MetaAIProvider
from bintu_agent_core.models import (
    AgentDecision,
    AskTechnicianArguments,
    EvidenceRelation,
    EvidenceStrength,
    FinishInvestigationArguments,
    FinishOutcome,
    GenerateReportArguments,
    HypothesisId,
    HypothesisStatus,
    HypothesisUpdate,
    InvestigationState,
    InvestigationStatus,
    Problem,
    RequestMeasurementArguments,
    ToolName,
)
from bintu_agent_core.provider import MockAIProvider
from bintu_agent_core.sqlite_store import SQLiteInvestigationStore
from bintu_agent_core.validation import validate_decision


def ask(distinguishes: list[HypothesisId]) -> AgentDecision:
    return AgentDecision(
        tool_name=ToolName.ASK_TECHNICIAN,
        arguments=AskTechnicianArguments(
            question="Quel état est affiché ?",
            distinguishes=distinguishes,
        ),
        reason="Obtenir une observation.",
    )


def update(
    hypothesis_id: HypothesisId,
    relation: EvidenceRelation,
    strength: EvidenceStrength,
    status: HypothesisStatus,
    evidence_ids: list[str],
) -> HypothesisUpdate:
    return HypothesisUpdate(
        hypothesis_id=hypothesis_id,
        relation=relation,
        strength=strength,
        status=status,
        evidence_ids=evidence_ids,
        reason="Proposition fondée sur les preuves citées.",
    )


def state_with_evidence() -> InvestigationState:
    state = InvestigationState(investigation_id="inv-updates")
    state.problem = Problem(description="Production photovoltaïque faible.")
    engine = InvestigationEngine(
        state, MockAIProvider([ask([HypothesisId.H0, HypothesisId.H1])])
    )
    engine.advance()
    engine.submit_technician_answer("answer-1", "Aucun défaut n'est affiché.")
    return state


def test_valid_update_is_applied_by_core_without_diagnosis() -> None:
    state = state_with_evidence()
    decision = AgentDecision(
        tool_name=ToolName.REQUEST_MEASUREMENT,
        arguments=RequestMeasurementArguments(
            measurement_type="dc_voltage",
            location="sortie panneaux",
            unit="V",
            distinguishes=[HypothesisId.H1, HypothesisId.H2],
        ),
        reason="Demander une mesure après avoir qualifié H1.",
        hypothesis_updates=[
            update(
                HypothesisId.H1,
                EvidenceRelation.SUPPORTING,
                EvidenceStrength.STRONG,
                HypothesisStatus.SUPPORTED,
                ["answer-1"],
            )
        ],
    )

    InvestigationEngine(state, MockAIProvider([decision])).advance()

    assert state.hypotheses[HypothesisId.H1].status is HypothesisStatus.SUPPORTED
    assert state.hypotheses[HypothesisId.H1].supporting_evidence_ids == ["answer-1"]
    assert state.status is InvestigationStatus.WAITING_FOR_TECHNICIAN
    assert state.conclusion is None


def test_unknown_evidence_is_rejected_without_mutation() -> None:
    state = state_with_evidence()
    before = state.model_dump(mode="json")
    decision = ask([HypothesisId.H1]).model_copy(
        update={
            "hypothesis_updates": [
                update(
                    HypothesisId.H1,
                    EvidenceRelation.SUPPORTING,
                    EvidenceStrength.STRONG,
                    HypothesisStatus.SUPPORTED,
                    ["fake-evidence"],
                )
            ]
        }
    )

    with pytest.raises(DecisionValidationError, match="unknown evidence"):
        validate_decision(state, decision)
    with pytest.raises(DecisionValidationError, match="unknown evidence"):
        InvestigationEngine(state, MockAIProvider([decision])).advance()

    assert state.model_dump(mode="json") == before


def test_elimination_without_contradiction_is_rejected() -> None:
    state = state_with_evidence()
    before = state.model_dump(mode="json")
    decision = ask([HypothesisId.H1]).model_copy(
        update={
            "hypothesis_updates": [
                update(
                    HypothesisId.H1,
                    EvidenceRelation.SUPPORTING,
                    EvidenceStrength.STRONG,
                    HypothesisStatus.ELIMINATED,
                    ["answer-1"],
                )
            ]
        }
    )

    with pytest.raises(DecisionValidationError, match="contradictory"):
        InvestigationEngine(state, MockAIProvider([decision])).advance()

    assert state.model_dump(mode="json") == before


def test_update_without_evidence_is_rejected() -> None:
    state = state_with_evidence()
    decision = ask([HypothesisId.H1]).model_copy(
        update={
            "hypothesis_updates": [
                update(
                    HypothesisId.H1,
                    EvidenceRelation.SUPPORTING,
                    EvidenceStrength.STRONG,
                    HypothesisStatus.SUPPORTED,
                    [],
                )
            ]
        }
    )

    with pytest.raises(DecisionValidationError, match="requires evidence_ids"):
        validate_decision(state, decision)


def test_one_decision_can_update_several_hypotheses(tmp_path) -> None:
    state = state_with_evidence()
    decision = AgentDecision(
        tool_name=ToolName.ASK_TECHNICIAN,
        arguments=AskTechnicianArguments(
            question="La baisse est-elle récente ?",
            distinguishes=[HypothesisId.H1, HypothesisId.H2],
        ),
        reason="Poursuivre après deux qualifications.",
        hypothesis_updates=[
            update(
                HypothesisId.H1,
                EvidenceRelation.SUPPORTING,
                EvidenceStrength.STRONG,
                HypothesisStatus.SUPPORTED,
                ["answer-1"],
            ),
            update(
                HypothesisId.H2,
                EvidenceRelation.CONTRADICTORY,
                EvidenceStrength.INDICATIVE,
                HypothesisStatus.WEAKENED,
                ["answer-1"],
            ),
        ],
    )
    InvestigationEngine(state, MockAIProvider([decision])).advance()
    store = SQLiteInvestigationStore(tmp_path / "updates.sqlite3")
    store.create_investigation()
    persisted = state.model_copy(deep=True)
    persisted.investigation_id = store.list_investigations()[0].id
    store.save_investigation(persisted)
    restored = store.get_investigation(persisted.investigation_id)

    assert restored.model_dump(mode="json") == persisted.model_dump(mode="json")
    assert restored.hypotheses[HypothesisId.H1].status is HypothesisStatus.SUPPORTED
    assert restored.hypotheses[HypothesisId.H2].status is HypothesisStatus.WEAKENED
    assert restored.conclusion is None


def test_finish_rules_remain_independent_from_hypothesis_updates() -> None:
    state = state_with_evidence()
    before = state.model_dump(mode="json")
    decision = AgentDecision(
        tool_name=ToolName.FINISH_INVESTIGATION,
        arguments=FinishInvestigationArguments(
            outcome=FinishOutcome.DIAGNOSED,
            diagnosis="Diagnostic proposé.",
            confidence=0.4,
            evidence=["missing"],
            distinguishes=[HypothesisId.H1],
        ),
        reason="Conclure.",
        hypothesis_updates=[
            update(
                HypothesisId.H1,
                EvidenceRelation.SUPPORTING,
                EvidenceStrength.STRONG,
                HypothesisStatus.SUPPORTED,
                ["answer-1"],
            )
        ],
    )

    with pytest.raises(DecisionValidationError, match="unknown evidence"):
        InvestigationEngine(state, MockAIProvider([decision])).advance()

    assert state.model_dump(mode="json") == before
    assert state.conclusion is None


def test_deferred_report_does_not_apply_hypothesis_updates() -> None:
    state = state_with_evidence()
    before = state.model_dump(mode="json")
    decision = AgentDecision(
        tool_name=ToolName.GENERATE_REPORT,
        arguments=GenerateReportArguments(
            investigation_id=state.investigation_id,
            distinguishes=[HypothesisId.H1],
        ),
        reason="Préparer un rapport.",
        hypothesis_updates=[
            update(
                HypothesisId.H1,
                EvidenceRelation.SUPPORTING,
                EvidenceStrength.STRONG,
                HypothesisStatus.SUPPORTED,
                ["answer-1"],
            )
        ],
    )

    with pytest.raises(UnsupportedToolError):
        InvestigationEngine(state, MockAIProvider([decision])).advance()

    assert state.model_dump(mode="json") == before


def test_meta_provider_parses_updates_without_mutating_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MODEL_API_KEY", "not-a-real-key")
    state = state_with_evidence()
    before = state.model_dump(mode="json")
    payload = {
        "tool_name": "ask_technician",
        "arguments": {
            "question": "La baisse est-elle récente ?",
            "distinguishes": ["H1"],
        },
        "reason": "Poursuivre.",
        "hypothesis_updates": [
            {
                "hypothesis_id": "H1",
                "relation": "supporting",
                "strength": "strong",
                "status": "supported",
                "evidence_ids": ["answer-1"],
                "reason": "La réponse existante étaye H1.",
            }
        ],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": json.dumps(payload)}}]},
            request=request,
        )

    decision = MetaAIProvider(
        client=httpx.Client(transport=httpx.MockTransport(handler))
    ).decide_next(state)

    assert state.model_dump(mode="json") == before
    assert decision.hypothesis_updates[0].status is HypothesisStatus.SUPPORTED
    assert state.hypotheses[HypothesisId.H1].status is HypothesisStatus.UNEXPLORED
