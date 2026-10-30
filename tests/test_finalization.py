import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from bintu_agent_core.engine import InvestigationEngine
from bintu_agent_core.errors import (
    DecisionValidationError,
    UnsupportedToolError,
)
from bintu_agent_core.models import (
    AgentDecision,
    AnalyzeImageArguments,
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
from bintu_agent_core.report import investigation_report
from bintu_agent_core.sqlite_store import SQLiteInvestigationStore
from tests.auth_support import authenticated_app as create_app
from tests.auth_support import bind_investigation


PROBLEM = (
    "La production photovoltaïque a fortement diminué depuis quelques jours."
)
ANSWER = "L'installation fonctionnait normalement auparavant."
IMAGE = (
    "Une couche de poussière couvre une grande partie de plusieurs panneaux."
)
FOLLOW_UP = "Aucun symptôme supplémentaire n'est signalé."
DIAGNOSIS = (
    "Les preuves recueillies étayent l'hypothèse panneaux et affaiblissent "
    "la chaîne électrique. Le stockage n'a pas été vérifié."
)
INSUFFICIENT = (
    "Informations insuffisantes pour établir un diagnostic fiable."
)


class MutatingProvider(MockAIProvider):
    """Attempt to rewrite the state object received by the provider."""

    def decide_next(self, state: InvestigationState) -> AgentDecision:
        state.hypotheses[HypothesisId.H3].status = HypothesisStatus.ELIMINATED
        return super().decide_next(state)


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


def ask(distinguishes: list[HypothesisId], question: str) -> AgentDecision:
    return AgentDecision(
        tool_name=ToolName.ASK_TECHNICIAN,
        arguments=AskTechnicianArguments(
            question=question,
            distinguishes=distinguishes,
        ),
        reason="Obtenir une observation du technicien.",
    )


def analyze() -> AgentDecision:
    return AgentDecision(
        tool_name=ToolName.ANALYZE_IMAGE,
        arguments=AnalyzeImageArguments(
            image_id="image-panels",
            focus="Décrire uniquement les dépôts visibles sur les panneaux.",
            distinguishes=[HypothesisId.H1, HypothesisId.H2],
        ),
        reason="Chercher un indice visuel sans le transformer en mesure.",
    )


def measure() -> AgentDecision:
    return AgentDecision(
        tool_name=ToolName.REQUEST_MEASUREMENT,
        arguments=RequestMeasurementArguments(
            measurement_type="dc_voltage",
            location="sortie panneaux",
            unit="V",
            distinguishes=[HypothesisId.H1, HypothesisId.H2],
        ),
        reason="Ajouter une mesure électrique réelle.",
    )


def finish(
    evidence_ids: list[str],
    confidence: float,
    *,
    outcome: FinishOutcome = FinishOutcome.DIAGNOSED,
    diagnosis: str | None = DIAGNOSIS,
    updates: list[HypothesisUpdate] | None = None,
) -> AgentDecision:
    return AgentDecision(
        tool_name=ToolName.FINISH_INVESTIGATION,
        arguments=FinishInvestigationArguments(
            outcome=outcome,
            diagnosis=diagnosis,
            confidence=confidence,
            evidence=evidence_ids,
            remaining_uncertainties=["H3 n'a pas été vérifiée."],
            distinguishes=[HypothesisId.H1, HypothesisId.H2, HypothesisId.H3],
        ),
        reason="Conclure uniquement à partir des preuves citées.",
        hypothesis_updates=updates or [],
    )


def open_investigation(
    decisions: list[AgentDecision],
    *,
    database: Path | None = None,
) -> InvestigationState:
    if database is None:
        state = InvestigationState(investigation_id="inv-final")
    else:
        state = SQLiteInvestigationStore(database).create_investigation()
    state.problem = Problem(description=PROBLEM)
    return InvestigationEngine(
        state, MutatingProvider(decisions)
    ).state


def collect(
    state: InvestigationState,
    *,
    technician: bool = False,
    image: bool = False,
    measurement: bool = False,
) -> InvestigationEngine:
    decisions: list[AgentDecision] = []
    if technician:
        decisions.append(
            ask([HypothesisId.H0, HypothesisId.H1], "La baisse est-elle nouvelle ?")
        )
    if image:
        decisions.append(analyze())
    if measurement:
        decisions.append(measure())
    engine = InvestigationEngine(state, MutatingProvider(decisions))
    if technician:
        engine.advance()
        engine.submit_technician_answer("answer-history", ANSWER)
    if image:
        engine.advance()
        engine.submit_image_analysis("image-dust", IMAGE, 0.62)
    if measurement:
        engine.advance()
        engine.submit_measurement("m-panels", 31.5)
    return engine


def test_measured_investigation_can_be_completed(tmp_path: Path) -> None:
    database = tmp_path / "completed.sqlite3"
    state = open_investigation([], database=database)
    collect(state, technician=True, image=True, measurement=True)
    qualification = ask(
        [HypothesisId.H1, HypothesisId.H2],
        "Un autre symptôme est-il apparu ?",
    ).model_copy(
        update={
            "hypothesis_updates": [
                update(
                    HypothesisId.H1,
                    EvidenceRelation.SUPPORTING,
                    EvidenceStrength.STRONG,
                    HypothesisStatus.SUPPORTED,
                    ["m-panels"],
                ),
                update(
                    HypothesisId.H2,
                    EvidenceRelation.CONTRADICTORY,
                    EvidenceStrength.INDICATIVE,
                    HypothesisStatus.WEAKENED,
                    ["answer-history"],
                ),
            ]
        }
    )
    engine = InvestigationEngine(
        state,
        MutatingProvider(
            [
                qualification,
                finish(
                    ["answer-history", "image-dust", "m-panels"],
                    0.8,
                ),
            ]
        ),
    )
    engine.advance()
    assert state.hypotheses[HypothesisId.H1].status is HypothesisStatus.SUPPORTED
    assert state.hypotheses[HypothesisId.H2].status is HypothesisStatus.WEAKENED
    assert state.hypotheses[HypothesisId.H3].status is HypothesisStatus.UNEXPLORED
    engine.submit_technician_answer("answer-follow-up", FOLLOW_UP)
    engine.advance()

    assert state.status is InvestigationStatus.COMPLETED
    assert state.conclusion is not None
    assert state.conclusion.diagnosis == DIAGNOSIS
    assert state.conclusion.confidence == 0.8
    assert state.conclusion.evidence_ids == [
        "answer-history",
        "image-dust",
        "m-panels",
    ]
    assert state.hypotheses[HypothesisId.H0].status is HypothesisStatus.UNEXPLORED
    assert state.hypotheses[HypothesisId.H3].status is HypothesisStatus.UNEXPLORED
    assert set(state.measurements) == {"m-panels"}
    assert state.measurements["m-panels"].value == 31.5
    assert state.measurements["m-panels"].unit == "V"
    assert state.measurements["m-panels"].location == "sortie panneaux"

    report = investigation_report(state)
    assert report["problem"] == PROBLEM
    assert report["status"] == "completed"
    assert [item["statement"] for item in report["collected_information"]] == [
        ANSWER,
        FOLLOW_UP,
    ]
    assert IMAGE in [item["statement"] for item in report["observations"]]
    assert report["measurements"] == [
        state.measurements["m-panels"].model_dump(mode="json")
    ]
    assert {
        item["hypothesis_id"]: item["status"] for item in report["hypotheses"]
    } == {
        "H0": "unexplored",
        "H1": "supported",
        "H2": "weakened",
        "H3": "unexplored",
    }
    assert report["diagnosis"] == DIAGNOSIS
    assert report["confidence"] == 0.8
    assert [item["evidence_id"] for item in report["cited_evidence"]] == [
        "answer-history",
        "image-dust",
        "m-panels",
    ]
    assert {item["id"] for item in report["evidence"]} == set(state.evidence)
    assert [item["summary"] for item in report["timeline"]] == [
        event.summary for event in state.timeline
    ]
    assert "chain_of_thought" not in report
    assert INSUFFICIENT not in report["diagnosis"]

    store = SQLiteInvestigationStore(database)
    store.save_investigation(state)
    restored = store.get_investigation(state.investigation_id)
    assert restored.model_dump(mode="json") == state.model_dump(mode="json")
    with sqlite3.connect(database) as connection:
        columns = [
            row[1]
            for row in connection.execute("PRAGMA table_info(investigations)")
        ]
    assert columns == [
        "id",
        "created_at",
        "updated_at",
        "status",
        "state_json",
        "organization_id",
        "created_by_user_id",
        "state_schema_version",
        "state_revision",
    ]
    bind_investigation(database, state.investigation_id)

    client = TestClient(
        create_app(
            database_path=database,
            provider_factory=lambda: MockAIProvider([]),
        )
    )
    response = client.get(f"/api/investigations/{state.investigation_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["state"]["conclusion"] == state.conclusion.model_dump(mode="json")
    assert {
        item["hypothesis_id"]: item["status"]
        for item in body["state"]["hypotheses"]
    }["H3"] == "unexplored"
    refused = client.post(
        f"/api/investigations/{state.investigation_id}/message",
        json={"message": "Investigation terminée"},
    )
    assert refused.status_code == 409
    assert (
        client.get(f"/api/investigations/{state.investigation_id}").json()["status"]
        == "completed"
    )


def test_insufficient_evidence_does_not_invent_a_diagnosis(
    tmp_path: Path,
) -> None:
    database = tmp_path / "insufficient.sqlite3"
    state = open_investigation([], database=database)
    collect(state, technician=True, image=True)
    before_finish = state.model_dump(mode="json")
    rejected = finish(["answer-history", "image-dust"], 0.9)
    engine = InvestigationEngine(state, MockAIProvider([rejected]))
    with pytest.raises(DecisionValidationError, match="requires measurement"):
        engine.advance()
    assert state.model_dump(mode="json") == before_finish

    engine = InvestigationEngine(
        state,
        MockAIProvider(
            [
                finish(
                    ["answer-history", "image-dust"],
                    0.0,
                    outcome=FinishOutcome.INSUFFICIENT_INFORMATION,
                    diagnosis=None,
                )
            ]
        ),
    )
    engine.advance()

    assert state.status is InvestigationStatus.INSUFFICIENT_INFORMATION
    assert state.conclusion is None
    assert state.measurements == {}
    assert state.hypotheses[HypothesisId.H1].status is HypothesisStatus.UNEXPLORED
    assert state.timeline[-1].summary == INSUFFICIENT
    assert "poussière" not in state.timeline[-1].summary
    report = investigation_report(state)
    assert report["diagnosis"] is None
    assert report["confidence"] is None
    assert report["measurements"] == []
    assert report["collected_information"][0]["statement"] == ANSWER
    assert report["timeline"][-1]["summary"] == INSUFFICIENT

    store = SQLiteInvestigationStore(database)
    store.save_investigation(state)
    restored = store.get_investigation(state.investigation_id)
    assert restored.model_dump(mode="json") == state.model_dump(mode="json")
    bind_investigation(database, state.investigation_id)
    client = TestClient(
        create_app(
            database_path=database,
            provider_factory=lambda: MockAIProvider([]),
        )
    )
    body = client.get(f"/api/investigations/{state.investigation_id}").json()
    assert body["status"] == "insufficient_information"
    assert body["state"]["conclusion"] is None
    assert body["state"]["timeline"][-1]["summary"] == INSUFFICIENT


def test_unknown_finish_evidence_is_rejected_without_mutation() -> None:
    state = open_investigation([])
    collect(state, technician=True, image=True, measurement=True)
    before = state.model_dump(mode="json")
    decision = finish(["fake-evidence"], 0.4)

    with pytest.raises(DecisionValidationError, match="unknown evidence"):
        InvestigationEngine(state, MockAIProvider([decision])).advance()

    assert state.model_dump(mode="json") == before
    assert state.conclusion is None
    assert state.status is InvestigationStatus.INVESTIGATING


def test_image_only_high_confidence_is_rejected() -> None:
    state = open_investigation([])
    collect(state, image=True)
    before = state.model_dump(mode="json")

    with pytest.raises(DecisionValidationError, match="only on image analysis"):
        InvestigationEngine(
            state, MockAIProvider([finish(["image-dust"], 0.9)])
        ).advance()

    assert state.model_dump(mode="json") == before


def test_high_confidence_without_measurement_is_rejected() -> None:
    state = open_investigation([])
    collect(state, technician=True)
    before = state.model_dump(mode="json")

    with pytest.raises(DecisionValidationError, match="requires measurement"):
        InvestigationEngine(
            state, MockAIProvider([finish(["answer-history"], 0.85)])
        ).advance()

    assert state.model_dump(mode="json") == before


def test_unexplored_hypothesis_cannot_be_eliminated_by_a_finish() -> None:
    state = open_investigation([])
    collect(state, technician=True, image=True, measurement=True)
    before = state.model_dump(mode="json")
    decision = finish(
        ["answer-history", "image-dust", "m-panels"],
        0.8,
        updates=[
            update(
                HypothesisId.H3,
                EvidenceRelation.SUPPORTING,
                EvidenceStrength.STRONG,
                HypothesisStatus.ELIMINATED,
                ["m-panels"],
            )
        ],
    )

    with pytest.raises(DecisionValidationError, match="contradictory"):
        InvestigationEngine(state, MockAIProvider([decision])).advance()

    assert state.model_dump(mode="json") == before
    assert state.hypotheses[HypothesisId.H3].status is HypothesisStatus.UNEXPLORED
    assert state.conclusion is None


def test_elimination_still_requires_strong_contradictory_evidence() -> None:
    state = open_investigation([])
    collect(state, technician=True)
    decision = ask([HypothesisId.H0], "La baisse est-elle confirmée ?").model_copy(
        update={
            "hypothesis_updates": [
                update(
                    HypothesisId.H0,
                    EvidenceRelation.CONTRADICTORY,
                    EvidenceStrength.STRONG,
                    HypothesisStatus.ELIMINATED,
                    ["answer-history"],
                )
            ]
        }
    )

    InvestigationEngine(state, MockAIProvider([decision])).advance()

    assert state.hypotheses[HypothesisId.H0].status is HypothesisStatus.ELIMINATED
    assert state.hypotheses[HypothesisId.H0].contradictory_evidence_ids == [
        "answer-history"
    ]
    assert state.conclusion is None
    assert state.status is InvestigationStatus.WAITING_FOR_TECHNICIAN


def test_generate_report_still_reads_state_without_executing_the_tool() -> None:
    state = open_investigation([])
    collect(state, technician=True, image=True, measurement=True)
    before = state.model_dump(mode="json")
    decision = AgentDecision(
        tool_name=ToolName.GENERATE_REPORT,
        arguments=GenerateReportArguments(
            investigation_id=state.investigation_id,
            distinguishes=[HypothesisId.H1],
        ),
        reason="Préparer un rapport.",
    )

    with pytest.raises(UnsupportedToolError):
        InvestigationEngine(state, MockAIProvider([decision])).advance()

    assert state.model_dump(mode="json") == before
    report = investigation_report(state)
    assert report["problem"] == PROBLEM
    assert report["diagnosis"] is None
    assert {item["id"] for item in report["evidence"]} == set(state.evidence)
    assert report["measurements"][0]["location"] == "sortie panneaux"
