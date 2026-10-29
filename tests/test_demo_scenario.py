from pathlib import Path

from fastapi.testclient import TestClient

from bintu_agent_core.models import InvestigationStatus
from bintu_backend.app import create_app
from scripts.replay_demo_scenario import seed_controlled_demo


def test_controlled_demo_can_be_reopened_without_meta(tmp_path: Path) -> None:
    database = tmp_path / "demo.sqlite3"
    seeded = seed_controlled_demo(database)
    calls = {"count": 0}

    def provider() -> object:
        calls["count"] += 1
        raise AssertionError("consultation must not ask for a decision")

    client = TestClient(
        create_app(database_path=database, provider_factory=provider)
    )
    response = client.get(f"/api/investigations/{seeded.investigation_id}")
    listed = client.get("/api/investigations")

    assert calls["count"] == 0
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == InvestigationStatus.COMPLETED.value
    assert body["state"]["conclusion"]["confidence"] == 0.62
    assert body["state"]["conclusion"]["evidence_ids"] == [
        "answer-history",
        "image-dust",
        "m-panels",
    ]
    assert body["state"]["measurements"][0]["value"] == 31.5
    assert listed.status_code == 200
    assert listed.json()[0]["investigation_id"] == seeded.investigation_id
    assert "fixture" not in response.text
