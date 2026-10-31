"""Execute the four scripted scenarios and render their real engine traces."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from bintu_agent_core.engine import InvestigationEngine
from bintu_agent_core.models import (
    AgentDecision,
    EvidenceRelation,
    EvidenceStrength,
    HypothesisId,
    HypothesisImpact,
    InvestigationState,
    InvestigationStatus,
    TimelineEventType,
)
from bintu_agent_core.provider import AIProvider, MockAIProvider


ROOT = Path(__file__).parents[1]
FIXTURES = ROOT / "tests" / "fixtures"
REPORT_PATH = ROOT / "docs" / "validation" / "agent-core-scenarios.md"


def impact(
    hypothesis_id: HypothesisId,
    relation: EvidenceRelation,
    strength: EvidenceStrength,
) -> HypothesisImpact:
    return HypothesisImpact(
        hypothesis_id=hypothesis_id,
        relation=relation,
        strength=strength,
    )


@dataclass(frozen=True)
class ScenarioDefinition:
    title: str
    fixture: str
    results: dict[int, dict[str, Any]]


SCENARIOS = (
    ScenarioDefinition(
        title="Installation normale / aucune panne",
        fixture="normal_battery_full.json",
        results={
            1: {
                "kind": "technician_answer",
                "evidence_id": "answer-full",
                "answer": "Oui, la batterie affiche 100 %.",
                "impacts": [
                    impact(
                        HypothesisId.H0,
                        EvidenceRelation.SUPPORTING,
                        EvidenceStrength.STRONG,
                    ),
                    impact(
                        HypothesisId.H3,
                        EvidenceRelation.CONTRADICTORY,
                        EvidenceStrength.INDICATIVE,
                    ),
                ],
            }
        },
    ),
    ScenarioDefinition(
        title="Dégradation d'un câble ou d'une connexion",
        fixture="degraded_cable.json",
        results={
            1: {
                "kind": "measurement",
                "measurement_id": "m-array",
                "value": 400.0,
            },
            2: {
                "kind": "measurement",
                "measurement_id": "m-inverter",
                "value": 315.0,
            },
            3: {
                "kind": "verification_impacts",
                "verification_id": "verification:action-3",
                "impacts": [
                    impact(
                        HypothesisId.H1,
                        EvidenceRelation.CONTRADICTORY,
                        EvidenceStrength.INDICATIVE,
                    ),
                    impact(
                        HypothesisId.H2,
                        EvidenceRelation.SUPPORTING,
                        EvidenceStrength.STRONG,
                    ),
                ],
            },
        },
    ),
    ScenarioDefinition(
        title="Piège : image suggestive, mesures contradictoires",
        fixture="dust_photo_measurement_trap.json",
        results={
            1: {
                "kind": "image_analysis",
                "evidence_id": "image-dust",
                "statement": "Un dépôt de poussière est visible.",
                "certainty": 0.65,
                "impacts": [
                    impact(
                        HypothesisId.H1,
                        EvidenceRelation.SUPPORTING,
                        EvidenceStrength.INDICATIVE,
                    )
                ],
            },
            2: {
                "kind": "measurement",
                "measurement_id": "m-array",
                "value": 398.0,
            },
            3: {
                "kind": "measurement",
                "measurement_id": "m-inverter",
                "value": 300.0,
            },
            4: {
                "kind": "verification_impacts",
                "verification_id": "verification:action-4",
                "impacts": [
                    impact(
                        HypothesisId.H1,
                        EvidenceRelation.CONTRADICTORY,
                        EvidenceStrength.INDICATIVE,
                    ),
                    impact(
                        HypothesisId.H2,
                        EvidenceRelation.SUPPORTING,
                        EvidenceStrength.STRONG,
                    ),
                ],
            },
        },
    ),
    ScenarioDefinition(
        title="Informations insuffisantes",
        fixture="insufficient_information.json",
        results={
            1: {
                "kind": "technician_answer",
                "evidence_id": "answer-unavailable",
                "answer": "Impossible de relever l'affichage.",
                "impacts": [],
            }
        },
    ),
)


class TracingProvider(AIProvider):
    def __init__(self, provider: MockAIProvider) -> None:
        self.provider = provider
        self.decisions: list[AgentDecision] = []
        self.input_unchanged: list[bool] = []

    def decide_next(self, state: InvestigationState) -> AgentDecision:
        before = state.model_dump(mode="json")
        decision = self.provider.decide_next(state)
        self.input_unchanged.append(before == state.model_dump(mode="json"))
        self.decisions.append(decision.model_copy(deep=True))
        return decision


def jsonable(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if isinstance(value, list):
        return [jsonable(item) for item in value]
    if isinstance(value, dict):
        return {key: jsonable(item) for key, item in value.items()}
    return value


def apply_result(
    engine: InvestigationEngine, result: dict[str, Any] | None
) -> dict[str, Any]:
    if result is None:
        return {
            "kind": "none",
            "note": "Aucun résultat externe : action exécutée par le Core ou fin.",
        }
    kind = result["kind"]
    if kind == "technician_answer":
        engine.submit_technician_answer(
            result["evidence_id"],
            result["answer"],
            impacts=result["impacts"],
        )
    elif kind == "measurement":
        engine.submit_measurement(result["measurement_id"], result["value"])
    elif kind == "image_analysis":
        engine.submit_image_analysis(
            result["evidence_id"],
            result["statement"],
            result["certainty"],
            impacts=result["impacts"],
        )
    elif kind == "verification_impacts":
        engine.apply_verification_impacts(
            result["verification_id"], result["impacts"]
        )
    else:
        raise ValueError(f"unknown scripted result kind: {kind}")
    return jsonable(result)


def state_summary(state: InvestigationState) -> dict[str, Any]:
    return {
        "status": state.status.value,
        "step_count": state.step_count,
        "system": state.system.model_dump(mode="json"),
        "hypotheses": {
            hypothesis_id.value: hypothesis.model_dump(mode="json")
            for hypothesis_id, hypothesis in state.hypotheses.items()
        },
    }


def execute_scenario(definition: ScenarioDefinition) -> dict[str, Any]:
    decisions = json.loads(
        (FIXTURES / definition.fixture).read_text(encoding="utf-8")
    )
    state = InvestigationState(investigation_id=f"validation-{definition.fixture}")
    provider = TracingProvider(MockAIProvider(decisions))
    engine = InvestigationEngine(state, provider)
    initial_state = state.model_dump(mode="json")
    steps: list[dict[str, Any]] = []

    while state.status is InvestigationStatus.INVESTIGATING:
        step_number = state.step_count + 1
        observation_ids = set(state.observations)
        evidence_ids = set(state.evidence)
        timeline_start = len(state.timeline)

        engine.advance()
        decision = provider.decisions[-1]
        result = apply_result(engine, definition.results.get(step_number))

        created_observations = [
            observation.model_dump(mode="json")
            for observation_id, observation in state.observations.items()
            if observation_id not in observation_ids
        ]
        created_evidence = [
            evidence.model_dump(mode="json")
            for evidence_id, evidence in state.evidence.items()
            if evidence_id not in evidence_ids
        ]
        timeline_delta = state.timeline[timeline_start:]
        hypothesis_changes = [
            event.details
            for event in timeline_delta
            if event.event_type is TimelineEventType.HYPOTHESIS_CHANGED
        ]
        proofs = []
        for change in hypothesis_changes:
            for evidence_id in change.get("evidence_ids", []):
                evidence = state.evidence[evidence_id]
                observation = state.observations[evidence.observation_id]
                proofs.append(
                    {
                        "hypothesis_id": change["hypothesis_id"],
                        "evidence": evidence.model_dump(mode="json"),
                        "observation": observation.model_dump(mode="json"),
                    }
                )

        steps.append(
            {
                "number": step_number,
                "provider_decision": decision.model_dump(mode="json"),
                "provider_input_unchanged": provider.input_unchanged[-1],
                "action": decision.tool_name.value,
                "core_validation": "accepted",
                "result_supplied": result,
                "observations_created": created_observations,
                "evidence_created": created_evidence,
                "hypothesis_changes": hypothesis_changes,
                "proofs_for_changes": proofs,
                "state_after_step": state_summary(state),
                "timeline_delta": [
                    event.model_dump(mode="json") for event in timeline_delta
                ],
            }
        )

    for index, step in enumerate(steps):
        step["next_action"] = (
            steps[index + 1]["action"] if index + 1 < len(steps) else None
        )

    return {
        "title": definition.title,
        "fixture": definition.fixture,
        "initial_state": initial_state,
        "steps": steps,
        "final_state": state.model_dump(mode="json"),
        "timeline": [
            event.model_dump(mode="json") for event in state.timeline
        ],
    }


def json_block(value: Any) -> str:
    return "```json\n" + json.dumps(value, ensure_ascii=False, indent=2) + "\n```"


def render_scenario(scenario: dict[str, Any], number: int) -> str:
    lines = [
        f"## {number}. {scenario['title']}",
        "",
        f"Fixture de décisions : `{scenario['fixture']}`.",
        "",
        "### État initial",
        "",
        json_block(scenario["initial_state"]),
    ]
    for step in scenario["steps"]:
        lines.extend(
            [
                "",
                f"### Étape {step['number']}",
                "",
                "Décision réelle du provider scripté :",
                "",
                json_block(step["provider_decision"]),
                "",
                f"- Action proposée : `{step['action']}`",
                f"- Validation par le Core : `{step['core_validation']}`",
                (
                    "- État d'entrée du provider inchangé : "
                    f"`{str(step['provider_input_unchanged']).lower()}`"
                ),
                f"- Prochaine action : `{step['next_action'] or 'aucune'}`",
                "",
                "Résultat scripté fourni au moteur :",
                "",
                json_block(step["result_supplied"]),
                "",
                "Observations réellement créées :",
                "",
                json_block(step["observations_created"]),
                "",
                "Evidence réellement créées :",
                "",
                json_block(step["evidence_created"]),
                "",
                "Changements de statut d'hypothèse :",
                "",
                json_block(step["hypothesis_changes"]),
                "",
                "Preuves justifiant ces changements :",
                "",
                json_block(step["proofs_for_changes"]),
                "",
                "État après l'étape :",
                "",
                json_block(step["state_after_step"]),
                "",
                "Événements de timeline de l'étape :",
                "",
                json_block(step["timeline_delta"]),
            ]
        )
    lines.extend(
        [
            "",
            "### État final",
            "",
            json_block(scenario["final_state"]),
            "",
            "### Timeline complète",
            "",
            json_block(scenario["timeline"]),
        ]
    )
    return "\n".join(lines)


def generate_report() -> str:
    scenarios = [
        execute_scenario(definition) for definition in SCENARIOS
    ]
    sections = [
        "# Validation fonctionnelle de l'Agent Core",
        "",
        (
            "Ce document est généré par l'exécution réelle de "
            "`InvestigationEngine` avec les décisions et résultats scriptés. "
            "Il valide la mécanique du moteur, pas l'intelligence diagnostique."
        ),
        "",
        (
            "Les mesures, réponses et analyses ci-dessous proviennent "
            "exclusivement des données de scénario déclarées dans le générateur. "
            "Les caractéristiques de système non fournies restent absentes."
        ),
        "",
        "Commande de régénération :",
        "",
        "```powershell",
        r".\.venv\Scripts\python scripts\generate_validation_report.py",
        "```",
    ]
    for index, scenario in enumerate(scenarios, start=1):
        sections.extend(["", render_scenario(scenario, index)])
    return "\n".join(sections) + "\n"


def main() -> None:
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(generate_report(), encoding="utf-8")
    print(f"Rapport généré : {REPORT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
