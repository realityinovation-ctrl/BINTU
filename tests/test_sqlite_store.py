import json
import sqlite3
from contextlib import closing
from pathlib import Path

import pytest

from bintu_agent_core.engine import InvestigationEngine
from bintu_agent_core.errors import (
    InvestigationNotFoundError,
    StateCorruptionError,
)
from bintu_agent_core.models import (
    AgentDecision,
    AskTechnicianArguments,
    HypothesisId,
    InvestigationState,
    InvestigationStatus,
    ToolName,
)
from bintu_agent_core.provider import MockAIProvider
from bintu_agent_core.sqlite_store import SQLiteInvestigationStore


def store_at(tmp_path: Path, name: str = "bintu.sqlite3") -> SQLiteInvestigationStore:
    return SQLiteInvestigationStore(tmp_path / name)


def waiting_state(store: SQLiteInvestigationStore) -> InvestigationState:
    state = store.create_investigation()
    decision = AgentDecision(
        tool_name=ToolName.ASK_TECHNICIAN,
        arguments=AskTechnicianArguments(
            question="Quel état est affiché par l'onduleur ?",
            distinguishes=[HypothesisId.H0, HypothesisId.H2],
        ),
        reason="Obtenir une observation avant de poursuivre.",
    )
    InvestigationEngine(state, MockAIProvider([decision])).advance()
    return state


def test_create_investigation_persists_initial_state(tmp_path: Path) -> None:
    store = store_at(tmp_path)

    state = store.create_investigation()

    restored = store.get_investigation(state.investigation_id)
    assert restored == state
    assert restored.status is InvestigationStatus.INVESTIGATING


def test_save_and_read_investigation(tmp_path: Path) -> None:
    store = store_at(tmp_path)
    state = store.create_investigation()
    state.installation.panel_count = 12

    store.save_investigation(state)

    assert store.get_investigation(state.investigation_id).installation.panel_count == 12


def test_full_state_round_trip_is_equivalent(tmp_path: Path) -> None:
    store = store_at(tmp_path)
    state = waiting_state(store)
    store.save_investigation(state)

    restored = store.get_investigation(state.investigation_id)

    assert restored.model_dump(mode="json") == state.model_dump(mode="json")
    assert restored.pending_action == state.pending_action
    assert restored.timeline == state.timeline


def test_modified_state_can_be_saved_again(tmp_path: Path) -> None:
    store = store_at(tmp_path)
    state = waiting_state(store)
    store.save_investigation(state)
    engine = InvestigationEngine(state, MockAIProvider([]))
    engine.submit_technician_answer("answer-1", "Aucun code défaut affiché.")

    store.save_investigation(state)
    restored = store.get_investigation(state.investigation_id)

    assert restored.status is InvestigationStatus.INVESTIGATING
    assert restored.observations == state.observations
    assert restored.evidence == state.evidence
    assert restored.verifications == state.verifications


def test_multiple_investigations_are_independent(tmp_path: Path) -> None:
    store = store_at(tmp_path)
    first = store.create_investigation()
    second = store.create_investigation()
    first.installation.panel_count = 8
    store.save_investigation(first)

    assert store.get_investigation(first.investigation_id).installation.panel_count == 8
    assert (
        store.get_investigation(second.investigation_id).installation.panel_count
        is None
    )


def test_list_investigations_respects_limit(tmp_path: Path) -> None:
    store = store_at(tmp_path)
    states = [store.create_investigation() for _ in range(3)]

    summaries = store.list_investigations(limit=2)

    assert len(summaries) == 2
    assert {summary.id for summary in summaries}.issubset(
        {state.investigation_id for state in states}
    )
    assert all(summary.created_at and summary.updated_at for summary in summaries)


def test_unknown_installation_values_remain_null(tmp_path: Path) -> None:
    store = store_at(tmp_path)
    state = store.create_investigation()

    restored = store.get_investigation(state.investigation_id)

    assert all(
        value is None for value in restored.installation.model_dump().values()
    )


def test_missing_investigation_is_explicit(tmp_path: Path) -> None:
    store = store_at(tmp_path)

    with pytest.raises(InvestigationNotFoundError, match="not found"):
        store.get_investigation("missing")


def test_invalid_json_is_rejected(tmp_path: Path) -> None:
    database = tmp_path / "bintu.sqlite3"
    store = SQLiteInvestigationStore(database)
    state = store.create_investigation()
    with closing(sqlite3.connect(database)) as connection:
        with connection:
            connection.execute(
                "UPDATE investigations SET state_json = ? WHERE id = ?",
                ("{invalid", state.investigation_id),
            )

    with pytest.raises(StateCorruptionError, match="not valid JSON"):
        store.get_investigation(state.investigation_id)


def test_missing_json_fields_are_not_reconstructed_from_defaults(
    tmp_path: Path,
) -> None:
    database = tmp_path / "bintu.sqlite3"
    store = SQLiteInvestigationStore(database)
    state = store.create_investigation()
    with closing(sqlite3.connect(database)) as connection:
        with connection:
            raw = connection.execute(
                "SELECT state_json FROM investigations WHERE id = ?",
                (state.investigation_id,),
            ).fetchone()[0]
            payload = json.loads(raw)
            del payload["installation"]
            connection.execute(
                "UPDATE investigations SET state_json = ? WHERE id = ?",
                (json.dumps(payload), state.investigation_id),
            )

    with pytest.raises(StateCorruptionError, match="reconstruction"):
        store.get_investigation(state.investigation_id)


def test_two_test_databases_are_isolated(tmp_path: Path) -> None:
    first_store = store_at(tmp_path, "first.sqlite3")
    second_store = store_at(tmp_path, "second.sqlite3")
    state = first_store.create_investigation()

    with pytest.raises(InvestigationNotFoundError):
        second_store.get_investigation(state.investigation_id)
    assert second_store.list_investigations(limit=10) == []


def test_state_json_has_schema_version_one(tmp_path: Path) -> None:
    database = tmp_path / "bintu.sqlite3"
    store = SQLiteInvestigationStore(database)
    state = store.create_investigation()

    with closing(sqlite3.connect(database)) as connection:
        raw = connection.execute(
            "SELECT state_json FROM investigations WHERE id = ?",
            (state.investigation_id,),
        ).fetchone()[0]

    payload = json.loads(raw)
    assert payload["schema_version"] == 1
    assert payload["investigation_id"] == state.investigation_id


def test_delete_is_available_for_test_cleanup(tmp_path: Path) -> None:
    store = store_at(tmp_path)
    state = store.create_investigation()

    store.delete_investigation(state.investigation_id)

    with pytest.raises(InvestigationNotFoundError):
        store.get_investigation(state.investigation_id)
