"""Export deterministic parity fixtures by executing the Python core.

No Meta call and no read of data/bintu.sqlite3. Re-run this module to
refresh parity/fixtures. tests/test_parity_fixtures.py checks the files.
"""

from __future__ import annotations

import json
import sqlite3
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient

from bintu_agent_core.engine import InvestigationEngine
from bintu_agent_core.models import (
    AgentDecision,
    AnalyzeImageArguments,
    AskTechnicianArguments,
    CompareMeasurementsArguments,
    DiagnosticSystem,
    FinishInvestigationArguments,
    EvidenceRelation,
    EvidenceStrength,
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
from bintu_agent_core.provider import AIProvider, MockAIProvider
from bintu_agent_core.sqlite_store import (
    SCHEMA_VERSION,
    SQLiteInvestigationStore,
    _serialize_state,
)
from bintu_agent_core.validation import assert_decision_is_not_repetitive
from tests.auth_support import TEST_ORGANIZATION_ID, TEST_USER_ID, authenticated_app


FIXTURE_ROOT = ROOT / "parity" / "fixtures"


@dataclass
class Case:
    case_id: str
    category: str
    operation: str
    state: InvestigationState | None = None
    legacy_document: dict[str, Any] | None = None
    decision: AgentDecision | None = None
    submission: dict[str, Any] | None = None


def _jsonable(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False))


def _text(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def _snapshot(state: InvestigationState) -> dict[str, Any]:
    dumped = state.model_dump(mode="json")
    return {
        "step_count": dumped["step_count"],
        "hypotheses": dumped["hypotheses"],
        "evidence": dumped["evidence"],
        "timeline": dumped["timeline"],
    }


def _ask(question: str) -> AgentDecision:
    return AgentDecision(
        tool_name=ToolName.ASK_TECHNICIAN,
        arguments=AskTechnicianArguments(
            question=question,
            distinguishes=[HypothesisId.H0, HypothesisId.H1],
        ),
        reason="Obtenir une observation manquante.",
    )


def _measure(
    measurement_type: str = "dc_voltage",
    unit: str = "V",
    location: str = "onduleur",
) -> AgentDecision:
    return AgentDecision(
        tool_name=ToolName.REQUEST_MEASUREMENT,
        arguments=RequestMeasurementArguments(
            measurement_type=measurement_type,
            location=location,
            unit=unit,
            distinguishes=[HypothesisId.H1, HypothesisId.H2],
        ),
        reason="Mesurer le point demandé.",
    )


def _image(focus: str = "poussière sur le champ") -> AgentDecision:
    return AgentDecision(
        tool_name=ToolName.ANALYZE_IMAGE,
        arguments=AnalyzeImageArguments(
            image_id="image-demande-1",
            focus=focus,
            distinguishes=[HypothesisId.H1],
        ),
        reason="Voir ce que la photo montre.",
    )


def _completed(investigation_id: str) -> InvestigationState:
    state = _state(investigation_id)
    state.status = InvestigationStatus.COMPLETED
    return state


def _state(investigation_id: str) -> InvestigationState:
    return InvestigationState(
        investigation_id=investigation_id,
        problem=Problem(description="La production est anormalement faible."),
    )


def _engine(state: InvestigationState, decisions: list[AgentDecision]) -> InvestigationEngine:
    return InvestigationEngine(state, MockAIProvider(decisions))


def _answered(investigation_id: str, question: str = "Le disjoncteur est-il fermé ?") -> InvestigationState:
    state = _state(investigation_id)
    decision = _ask(question)
    engine = _engine(state, [decision])
    engine.advance()
    engine.submit_technician_answer("answer-1", "Oui, il est fermé.")
    return state


def _measured(
    investigation_id: str,
    measurement_id: str = "m-1",
    location: str = "onduleur",
    value: float = 310.0,
) -> InvestigationState:
    state = _state(investigation_id)
    decision = _measure(location=location)
    engine = _engine(state, [decision])
    engine.advance()
    engine.submit_measurement(measurement_id, value)
    return state


class _ForbiddenProvider:
    def decide_next(self, state: InvestigationState) -> AgentDecision:
        del state
        raise AssertionError("the provider must not be called")


def _insert(database: Path, state: InvestigationState) -> None:
    SQLiteInvestigationStore(database)
    connection = sqlite3.connect(database)
    try:
        connection.execute(
            """
            INSERT INTO investigations (
                id, created_at, updated_at, status, state_json,
                organization_id, created_by_user_id,
                state_schema_version, state_revision
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                state.investigation_id,
                "2026-01-01T00:00:00+00:00",
                "2026-01-01T00:00:00+00:00",
                state.status.value,
                _serialize_state(state),
                TEST_ORGANIZATION_ID,
                TEST_USER_ID,
                SCHEMA_VERSION,
                1,
            ),
        )
        connection.commit()
    finally:
        connection.close()


def _run(case: Case) -> dict[str, Any]:
    if case.operation == "legacy_installation":
        return _run_legacy(case)
    if case.operation == "sqlite_roundtrip":
        return _run_roundtrip(case)
    if case.operation == "http_non_finite_measurement":
        return _run_non_finite(case)
    if case.state is None or case.decision is None and case.operation == "advance":
        raise RuntimeError(f"{case.case_id} is missing its state or decision")

    state = case.state
    assert state is not None
    before = _snapshot(state)
    provider: AIProvider
    if case.operation == "advance_at_step_limit":
        provider = _ForbiddenProvider()
    elif case.decision is None:
        provider = MockAIProvider([])
    else:
        provider = MockAIProvider([case.decision])
    engine = InvestigationEngine(state, provider)
    try:
        if case.operation in {"advance", "advance_at_step_limit"}:
            if (
                case.decision is not None
                and case.decision.tool_name is ToolName.FINISH_INVESTIGATION
            ):
                assert_decision_is_not_repetitive(state, case.decision)
            engine.advance()
            if (
                case.decision is not None
                and case.decision.tool_name is ToolName.FINISH_INVESTIGATION
            ):
                assert_decision_is_not_repetitive(state, case.decision)
        elif case.operation == "submit_technician_answer":
            engine.submit_technician_answer(
                str(case.submission["evidence_id"]),
                str(case.submission["answer"]),
            )
        elif case.operation == "submit_measurement":
            engine.submit_measurement(
                str(case.submission["measurement_id"]),
                float(case.submission["value"]),
            )
        elif case.operation == "submit_image_analysis":
            engine.submit_image_analysis(
                str(case.submission["evidence_id"]),
                str(case.submission["statement"]),
                float(case.submission["certainty"]),
            )
        elif case.operation == "advance_provider_exhausted":
            InvestigationEngine(state, MockAIProvider([])).advance()
        else:
            raise RuntimeError(f"unknown operation {case.operation}")
    except Exception as exc:
        if _snapshot(state) != before:
            raise RuntimeError(f"{case.case_id} changed state before refusing") from exc
        return {
            "expected": {
                "error": {"type": type(exc).__name__, "message": str(exc)}
            },
            "invariants": before,
        }
    return {"expected": {"state": state.model_dump(mode="json")}, "invariants": None}


def _run_legacy(case: Case) -> dict[str, Any]:
    document = case.legacy_document
    if document is None:
        raise RuntimeError("legacy fixture has no document")
    with tempfile.TemporaryDirectory() as directory:
        database = Path(directory) / "legacy.sqlite3"
        SQLiteInvestigationStore(database)
        payload = {"schema_version": SCHEMA_VERSION, **document}
        connection = sqlite3.connect(database)
        try:
            connection.execute(
                """
                INSERT INTO investigations (
                    id, created_at, updated_at, status, state_json,
                    state_schema_version, state_revision
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    document["investigation_id"],
                    "2026-01-01T00:00:00+00:00",
                    "2026-01-01T00:00:00+00:00",
                    document["status"],
                    json.dumps(payload, ensure_ascii=False),
                    SCHEMA_VERSION,
                    1,
                ),
            )
            connection.commit()
        finally:
            connection.close()
        restored = SQLiteInvestigationStore(database).get_investigation(
            document["investigation_id"]
        )
    return {
        "expected": {"state": restored.model_dump(mode="json")},
        "invariants": None,
    }


def _run_roundtrip(case: Case) -> dict[str, Any]:
    if case.state is None:
        raise RuntimeError("roundtrip fixture has no state")
    with tempfile.TemporaryDirectory() as directory:
        database = Path(directory) / "motor.sqlite3"
        _insert(database, case.state)
        restored = SQLiteInvestigationStore(database).get_investigation(
            case.state.investigation_id
        )
    return {
        "expected": {"state": restored.model_dump(mode="json")},
        "invariants": None,
    }


def _run_non_finite(case: Case) -> dict[str, Any]:
    if case.state is None:
        raise RuntimeError("non-finite fixture has no state")
    before = _snapshot(case.state)
    with tempfile.TemporaryDirectory() as directory:
        database = Path(directory) / "api.sqlite3"
        _insert(database, case.state)
        client = TestClient(
            authenticated_app(
                database_path=database,
                provider_factory=_ForbiddenProvider,
            )
        )
        response = client.post(
            f"/api/investigations/{case.state.investigation_id}/message",
            json={"message": case.submission["message"]},
        )
        reloaded = SQLiteInvestigationStore(database).get_investigation(
            case.state.investigation_id
        )
    if _snapshot(reloaded) != before:
        raise RuntimeError("non-finite measurement changed the stored state")
    return {
        "expected": {
            "error": {
                "type": "HTTPException",
                "status_code": response.status_code,
                "message": response.json()["detail"],
            }
        },
        "invariants": before,
    }


def _waiting(state: InvestigationState, decision: AgentDecision) -> InvestigationState:
    _engine(state, [decision]).advance()
    return state


def _two_measurements(investigation_id: str) -> InvestigationState:
    state = _measured(investigation_id, "m-field", "champ", 300.0)
    _engine(state, [_measure(location="onduleur")]).advance()
    InvestigationEngine(state, MockAIProvider([])).submit_measurement("m-inverter", 180.0)
    return state


def _imaged(investigation_id: str) -> InvestigationState:
    state = _waiting(_state(investigation_id), _image())
    InvestigationEngine(state, MockAIProvider([])).submit_image_analysis(
        "image-1",
        "Une couche uniforme est visible.",
        0.4,
    )
    return state


def cases() -> list[Case]:
    left = _two_measurements("parity-compare")
    compared = _two_measurements("parity-compare-again")
    compare_decision = AgentDecision(
        tool_name=ToolName.COMPARE_MEASUREMENTS,
        arguments=CompareMeasurementsArguments(
            measurement_ids=["m-field", "m-inverter"],
            comparison_reason="Comparer le champ et l'onduleur.",
            distinguishes=[HypothesisId.H1, HypothesisId.H2],
        ),
        reason="Les deux tensions sont comparables.",
    )
    _engine(compared, [compare_decision]).advance()
    limited = _state("parity-step-limit")
    limited.step_count = 20
    limited.max_steps = 20
    eliminated = _answered("parity-stays-eliminated")
    eliminated.hypotheses[HypothesisId.H1].status = HypothesisStatus.ELIMINATED
    legacy_source = _state("parity-legacy-installation")
    legacy_source.system.characteristics["panel_count"] = 12
    legacy_source.system.characteristics["battery_present"] = False
    legacy_raw = legacy_source.model_dump(mode="json")
    legacy_document = {
        key: value for key, value in legacy_raw.items() if key != "system"
    }
    legacy_document["installation"] = {
        "nominal_power_kwp": None,
        "panel_count": 12,
        "inverter_model": None,
        "battery_present": False,
        "battery_capacity_kwh": None,
        "system_voltage_v": None,
    }
    motor = _state("parity-electric-motor")
    motor.problem = Problem(description="Le moteur chauffe au démarrage.")
    motor.system = DiagnosticSystem(
        domain="electrical",
        type="electric_motor",
        manufacturer="Nord",
        model="SK 90",
        characteristics={"rated_power_kw": 4},
    )
    finish = AgentDecision(
        tool_name=ToolName.FINISH_INVESTIGATION,
        arguments=FinishInvestigationArguments(
            outcome=FinishOutcome.DIAGNOSED,
            diagnosis="La tension chute entre le champ et l'onduleur.",
            confidence=0.8,
            evidence=["m-1"],
            distinguishes=[HypothesisId.H1, HypothesisId.H2],
        ),
        reason="La mesure citée explique le symptôme.",
    )
    return [
        Case(
            "first_decision",
            "creation",
            "advance",
            _state("parity-first-decision"),
            decision=_ask("Depuis quand ?"),
        ),
        Case(
            "technician_answer",
            "question",
            "submit_technician_answer",
            _waiting(_state("parity-question"), _ask("Depuis quand ?")),
            decision=_ask("Depuis quand ?"),
            submission={"evidence_id": "answer-1", "answer": "Depuis trois jours."},
        ),
        Case(
            "valid_measurement",
            "measurement",
            "submit_measurement",
            _waiting(_state("parity-valid-measurement"), _measure()),
            decision=_measure(),
            submission={"measurement_id": "m-1", "value": 310.0},
        ),
        Case(
            "unknown_type",
            "measurement",
            "advance",
            _state("parity-unknown-type"),
            decision=_measure("voltage", "V"),
        ),
        Case(
            "wrong_unit",
            "measurement",
            "advance",
            _state("parity-wrong-unit"),
            decision=_measure("dc_voltage", "A"),
        ),
        Case(
            "non_finite_value",
            "measurement",
            "http_non_finite_measurement",
            _waiting(_state("parity-non-finite"), _measure()),
            decision=_measure(),
            submission={"message": "NaN"},
        ),
        Case(
            "image_accepted",
            "image",
            "submit_image_analysis",
            _waiting(_state("parity-image"), _image()),
            decision=_image(),
            submission={
                "evidence_id": "image-1",
                "statement": "Une couche uniforme est visible.",
                "certainty": 0.4,
            },
        ),
        Case(
            "image_rejected_without_request",
            "image",
            "submit_image_analysis",
            _waiting(_state("parity-image-refused"), _ask("Une question ?")),
            decision=_image(),
            submission={
                "evidence_id": "image-1",
                "statement": "Une couche uniforme est visible.",
                "certainty": 0.4,
            },
        ),
        Case("compare_measurements", "comparison", "advance", left, decision=compare_decision),
        Case("valid_conclusion", "conclusion", "advance", _measured("parity-valid-finish"), decision=finish),
        Case(
            "high_confidence_without_measurement",
            "conclusion",
            "advance",
            _answered("parity-high-confidence"),
            decision=AgentDecision(
                tool_name=ToolName.FINISH_INVESTIGATION,
                arguments=FinishInvestigationArguments(
                    outcome=FinishOutcome.DIAGNOSED,
                    diagnosis="Le symptôme vient de l'onduleur.",
                    confidence=0.8,
                    evidence=["answer-1"],
                    distinguishes=[HypothesisId.H0, HypothesisId.H1],
                ),
                reason="La réponse seule ne suffit pas à cette confiance.",
            ),
        ),
        Case(
            "image_only_high_confidence",
            "conclusion",
            "advance",
            _imaged("parity-image-only"),
            decision=AgentDecision(
                tool_name=ToolName.FINISH_INVESTIGATION,
                arguments=FinishInvestigationArguments(
                    outcome=FinishOutcome.DIAGNOSED,
                    diagnosis="Le champ est masqué.",
                    confidence=0.8,
                    evidence=["image-1"],
                    distinguishes=[HypothesisId.H1],
                ),
                reason="La photo seule ne suffit pas à cette confiance.",
            ),
        ),
        Case(
            "insufficient_information",
            "insufficient",
            "advance",
            _answered("parity-insufficient"),
            decision=AgentDecision(
                tool_name=ToolName.FINISH_INVESTIGATION,
                arguments=FinishInvestigationArguments(
                    outcome=FinishOutcome.INSUFFICIENT_INFORMATION,
                    diagnosis=None,
                    confidence=0.3,
                    evidence=["answer-1"],
                    remaining_uncertainties=["La cause électrique reste ouverte."],
                    distinguishes=[HypothesisId.H0, HypothesisId.H1],
                ),
                reason="La réponse ne tranche pas.",
            ),
        ),
        Case(
            "max_steps",
            "step_limit",
            "advance_at_step_limit",
            limited,
            decision=_ask("Cette question ne doit pas être posée."),
        ),
        Case(
            "repeated_question",
            "anti_loop",
            "advance",
            _answered("parity-repeat-question"),
            decision=_ask("Le disjoncteur est-il fermé ?"),
        ),
        Case(
            "repeated_measurement",
            "anti_loop",
            "advance",
            _measured("parity-repeat-measurement"),
            decision=_measure(),
        ),
        Case(
            "repeated_image_focus",
            "anti_loop",
            "advance",
            _imaged("parity-repeat-image"),
            decision=_image(),
        ),
        Case(
            "repeated_comparison",
            "anti_loop",
            "advance",
            compared,
            decision=compare_decision,
        ),
        Case(
            "finish_is_not_repetitive",
            "anti_loop",
            "advance",
            _measured("parity-finish-exempt"),
            decision=finish,
        ),
        Case(
            "elimination_without_strong_contradiction",
            "hypothesis",
            "advance",
            _answered("parity-elimination", "Première question ?"),
            decision=AgentDecision(
                tool_name=ToolName.ASK_TECHNICIAN,
                arguments=AskTechnicianArguments(
                    question="Deuxième question ?",
                    distinguishes=[HypothesisId.H1],
                ),
                reason="Tenter une élimination interdite.",
                hypothesis_updates=[
                    HypothesisUpdate(
                        hypothesis_id=HypothesisId.H1,
                        relation="supporting",
                        strength="strong",
                        status=HypothesisStatus.ELIMINATED,
                        evidence_ids=["answer-1"],
                        reason="Une preuve favorable ne peut pas éliminer.",
                    )
                ],
            ),
        ),
        Case(
            "eliminated_hypothesis_stays_eliminated",
            "hypothesis",
            "advance",
            eliminated,
            decision=AgentDecision(
                tool_name=ToolName.ASK_TECHNICIAN,
                arguments=AskTechnicianArguments(
                    question="Autre observation ?",
                    distinguishes=[HypothesisId.H1],
                ),
                reason="Confirmer qu'une hypothèse éliminée le reste.",
                hypothesis_updates=[
                    HypothesisUpdate(
                        hypothesis_id=HypothesisId.H1,
                        relation="contradictory",
                        strength="strong",
                        status=HypothesisStatus.ELIMINATED,
                        evidence_ids=["answer-1"],
                        reason="La contradiction forte ne la réouvre pas.",
                    )
                ],
            ),
        ),
        Case(
            "energized_conductor",
            "safety",
            "advance",
            _state("parity-safety"),
            decision=_ask("Pouvez-vous ouvrir le conducteur sous tension ?"),
        ),
        Case(
            "generate_report_rejected",
            "report",
            "advance",
            _state("parity-report"),
            decision=AgentDecision(
                tool_name=ToolName.GENERATE_REPORT,
                arguments=GenerateReportArguments(
                    investigation_id="parity-report",
                    distinguishes=[HypothesisId.H0],
                ),
                reason="Le rapport n'est pas exécuté par le core.",
            ),
        ),
        Case(
            "legacy_installation",
            "persistence",
            "legacy_installation",
            legacy_document=legacy_document,
        ),
        Case("electric_motor", "persistence", "sqlite_roundtrip", motor),
        Case(
            "confidence_at_limit_without_measurement",
            "conclusion",
            "advance",
            _answered("parity-confidence-limit"),
            decision=AgentDecision(
                tool_name=ToolName.FINISH_INVESTIGATION,
                arguments=FinishInvestigationArguments(
                    outcome=FinishOutcome.DIAGNOSED,
                    diagnosis="La réponse suffit à cette confiance.",
                    confidence=0.7,
                    evidence=["answer-1"],
                    distinguishes=[HypothesisId.H0, HypothesisId.H1],
                ),
                reason="La limite haute accepte une réponse sans mesure.",
            ),
        ),
        Case(
            "advance_outside_investigating",
            "transition",
            "advance",
            _completed("parity-not-investigating"),
            decision=_ask("Cette question ne doit pas partir."),
        ),
        Case(
            "status_derived_by_core",
            "hypothesis",
            "advance",
            _answered("parity-derived-status", "Question initiale ?"),
            decision=AgentDecision(
                tool_name=ToolName.ASK_TECHNICIAN,
                arguments=AskTechnicianArguments(
                    question="Question suivante ?",
                    distinguishes=[HypothesisId.H1],
                ),
                reason="Le statut proposé ne doit pas être recopié.",
                hypothesis_updates=[
                    HypothesisUpdate(
                        hypothesis_id=HypothesisId.H1,
                        relation=EvidenceRelation.SUPPORTING,
                        strength=EvidenceStrength.INDICATIVE,
                        status=HypothesisStatus.SUPPORTED,
                        evidence_ids=["answer-1"],
                        reason="L'IA propose un statut plus fort que la dérivation.",
                    )
                ],
            ),
        ),
        Case(
            "first_decision_failed",
            "creation",
            "advance_provider_exhausted",
            _state("parity-create-failed"),
        ),
        Case(
            "refused_conclusion_unchanged",
            "conclusion",
            "advance",
            _answered("parity-refused-conclusion"),
            decision=AgentDecision(
                tool_name=ToolName.FINISH_INVESTIGATION,
                arguments=FinishInvestigationArguments(
                    outcome=FinishOutcome.DIAGNOSED,
                    diagnosis="Conclusion refusée.",
                    confidence=0.8,
                    evidence=["answer-1"],
                    distinguishes=[HypothesisId.H0, HypothesisId.H1],
                ),
                reason="Cette conclusion ne doit rien écrire.",
            ),
        ),
    ]


def export_fixtures(root: Path | None = FIXTURE_ROOT) -> dict[str, str]:
    """Capture each input, execute it, and optionally write the JSON files."""

    documents: dict[str, str] = {}
    for case in cases():
        input_state = _capture_input(case)
        outcome = _run(case)
        payload = {
            "id": case.case_id,
            "category": case.category,
            "operation": case.operation,
            "input_state": input_state,
            "decision": (
                case.decision.model_dump(mode="json")
                if case.decision is not None
                else None
            ),
            "submission": case.submission,
            "expected": outcome["expected"],
            "invariants": outcome["invariants"],
        }
        relative = f"{case.category}/{case.case_id}.json"
        documents[relative] = _text(_jsonable(payload))
    if root is not None:
        for relative, text in documents.items():
            path = root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
    return documents


def _capture_input(case: Case) -> dict[str, Any]:
    if case.legacy_document is not None:
        return _jsonable(case.legacy_document)
    if case.state is None:
        raise RuntimeError(f"{case.case_id} has no input state")
    return case.state.model_dump(mode="json")


def main() -> None:
    documents = export_fixtures()
    print(f"{len(documents)} fixtures écrites dans {FIXTURE_ROOT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
