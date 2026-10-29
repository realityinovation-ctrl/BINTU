"""Seed the controlled demonstration investigation.

Replays tests/fixtures/full_investigation_scenario.json with MockAIProvider.
This does not call Meta and does not mean Meta chooses this sequence.

Run, with the API database path used by the local server:

    .\\.venv\\Scripts\\python scripts\\replay_demo_scenario.py
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from bintu_agent_core.engine import InvestigationEngine
from bintu_agent_core.models import (
    EvidenceRelation,
    EvidenceStrength,
    HypothesisId,
    HypothesisImpact,
    InvestigationState,
    Problem,
)
from bintu_agent_core.provider import MockAIProvider
from bintu_agent_core.sqlite_store import SQLiteInvestigationStore


ROOT = Path(__file__).parents[1]
FIXTURE = ROOT / "tests" / "fixtures" / "full_investigation_scenario.json"
PROBLEM = (
    "La production photovoltaïque a fortement diminué depuis quelques jours."
)
ANSWER = "L'installation fonctionnait normalement auparavant."
IMAGE = (
    "Une couche de poussière couvre une grande partie de plusieurs panneaux."
)


def indicative(
    hypothesis_id: HypothesisId, relation: EvidenceRelation
) -> HypothesisImpact:
    return HypothesisImpact(
        hypothesis_id=hypothesis_id,
        relation=relation,
        strength=EvidenceStrength.INDICATIVE,
    )


def seed_controlled_demo(database: Path) -> InvestigationState:
    """Replay the validated fixture into SQLite and return the final state."""

    decisions = json.loads(FIXTURE.read_text(encoding="utf-8"))
    store = SQLiteInvestigationStore(database)
    state = store.create_investigation()
    state.problem = Problem(description=PROBLEM)
    engine = InvestigationEngine(state, MockAIProvider(decisions[:2]))
    engine.advance()
    engine.submit_technician_answer(
        "answer-history",
        ANSWER,
        impacts=[indicative(HypothesisId.H0, EvidenceRelation.CONTRADICTORY)],
    )
    engine.advance()
    engine.submit_image_analysis(
        "image-dust",
        IMAGE,
        0.62,
        impacts=[indicative(HypothesisId.H1, EvidenceRelation.SUPPORTING)],
    )
    store.save_investigation(state)
    restored = store.get_investigation(state.investigation_id)
    engine = InvestigationEngine(restored, MockAIProvider(decisions[2:]))
    engine.advance()
    engine.submit_measurement(
        "m-panels",
        31.5,
        impacts=[indicative(HypothesisId.H2, EvidenceRelation.SUPPORTING)],
    )
    engine.advance()
    store.save_investigation(restored)
    return store.get_investigation(restored.investigation_id)


def main() -> None:
    database = Path(
        os.environ.get("BINTU_DB_PATH", ROOT / "data" / "bintu.sqlite3")
    )
    state = seed_controlled_demo(database)
    print("Démonstration contrôlée enregistrée.")
    print("MockAIProvider a rejoué la fixture. Meta n'a pas choisi cette séquence.")
    print(f"Base : {database}")
    print(
        "Ouvrez "
        f"http://127.0.0.1:5173/investigations/{state.investigation_id}"
    )


if __name__ == "__main__":
    main()
