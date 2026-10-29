import importlib
import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from bintu_agent_core.errors import ProviderHTTPError, ProviderResponseError
from bintu_agent_core.models import (
    AgentDecision,
    AnalyzeImageArguments,
    AskTechnicianArguments,
    HypothesisId,
    InvestigationState,
    ToolName,
)
from bintu_agent_core.sqlite_store import SQLiteInvestigationStore
from bintu_backend.app import create_app
from bintu_backend.image import ImageAnalysis, MetaImageAnalyzer


PNG_BYTES = b"\x89PNG\r\n\x1a\nminimal-test-payload"


class ImageThenQuestionProvider:
    def __init__(self) -> None:
        self.calls = 0

    def decide_next(self, state: InvestigationState) -> AgentDecision:
        del state
        self.calls += 1
        if self.calls == 1:
            return AgentDecision(
                tool_name=ToolName.ANALYZE_IMAGE,
                arguments=AnalyzeImageArguments(
                    image_id="image-action-1",
                    focus="Vérifier les obstructions visibles sur le panneau.",
                    distinguishes=[HypothesisId.H1, HypothesisId.H2],
                ),
                reason="Rechercher uniquement des indices visuels.",
            )
        return AgentDecision(
            tool_name=ToolName.ASK_TECHNICIAN,
            arguments=AskTechnicianArguments(
                question="Une autre zone du panneau est-elle masquée ?",
                distinguishes=[HypothesisId.H1, HypothesisId.H2],
            ),
            reason="Poursuivre la vérification.",
        )


class AskingProvider:
    def decide_next(self, state: InvestigationState) -> AgentDecision:
        del state
        return AgentDecision(
            tool_name=ToolName.ASK_TECHNICIAN,
            arguments=AskTechnicianArguments(
                question="Quel état est affiché ?",
                distinguishes=[HypothesisId.H0],
            ),
            reason="Demander une observation.",
        )


class StubImageAnalyzer:
    def __init__(
        self,
        result: ImageAnalysis | None = None,
        error: Exception | None = None,
    ) -> None:
        self.result = result or ImageAnalysis(
            description=(
                "Une partie du panneau semble couverte par des dépôts visibles."
            ),
            certainty=0.76,
        )
        self.error = error
        self.calls = 0
        self.focus: str | None = None

    def analyze(
        self, image: bytes, content_type: str, focus: str
    ) -> ImageAnalysis:
        assert image == PNG_BYTES
        assert content_type == "image/png"
        self.calls += 1
        self.focus = focus
        if self.error:
            raise self.error
        return self.result


def image_client(
    tmp_path: Path,
    analyzer: StubImageAnalyzer,
) -> tuple[TestClient, Path, str]:
    database = tmp_path / "image.sqlite3"
    provider = ImageThenQuestionProvider()
    app = create_app(
        database_path=database,
        provider_factory=lambda: provider,
        image_analyzer_factory=lambda: analyzer,
    )
    client = TestClient(app)
    created = client.post(
        "/api/investigations",
        json={"problem": "Production photovoltaïque faible."},
    ).json()
    return client, database, created["investigation_id"]


def post_image(
    client: TestClient,
    investigation_id: str,
    content: bytes = PNG_BYTES,
    content_type: str = "image/png",
):
    return client.post(
        f"/api/investigations/{investigation_id}/image",
        files={"image": ("panel.png", content, content_type)},
    )


def test_valid_image_returns_validated_visual_observation(
    tmp_path: Path,
) -> None:
    analyzer = StubImageAnalyzer()
    client, _, investigation_id = image_client(tmp_path, analyzer)

    response = post_image(client, investigation_id)

    assert response.status_code == 200
    observation = response.json()["state"]["observations"][0]
    assert observation["statement"] == analyzer.result.description
    assert observation["certainty"] == 0.76
    assert analyzer.focus == (
        "Vérifier les obstructions visibles sur le panneau."
    )


def test_invalid_image_format_is_rejected(tmp_path: Path) -> None:
    analyzer = StubImageAnalyzer()
    client, _, investigation_id = image_client(tmp_path, analyzer)

    response = post_image(
        client, investigation_id, b"not-an-image", "image/gif"
    )

    assert response.status_code == 415
    assert analyzer.calls == 0


def test_image_content_must_match_declared_format(tmp_path: Path) -> None:
    analyzer = StubImageAnalyzer()
    client, _, investigation_id = image_client(tmp_path, analyzer)

    response = post_image(client, investigation_id, b"not-png")

    assert response.status_code == 422
    assert analyzer.calls == 0


def test_image_too_large_is_rejected(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    app_module = importlib.import_module("bintu_backend.app")
    monkeypatch.setattr(app_module, "MAX_IMAGE_BYTES", 8)
    analyzer = StubImageAnalyzer()
    client, _, investigation_id = image_client(tmp_path, analyzer)

    response = post_image(client, investigation_id)

    assert response.status_code == 413
    assert analyzer.calls == 0


def test_image_for_missing_investigation_is_404(tmp_path: Path) -> None:
    analyzer = StubImageAnalyzer()
    app = create_app(
        database_path=tmp_path / "image.sqlite3",
        provider_factory=AskingProvider,
        image_analyzer_factory=lambda: analyzer,
    )

    response = post_image(TestClient(app), "missing")

    assert response.status_code == 404
    assert analyzer.calls == 0


def test_image_provider_error_is_clean_and_state_is_unchanged(
    tmp_path: Path,
) -> None:
    analyzer = StubImageAnalyzer(error=ProviderHTTPError("private body"))
    client, _, investigation_id = image_client(tmp_path, analyzer)
    before = client.get(f"/api/investigations/{investigation_id}").json()

    response = post_image(client, investigation_id)
    after = client.get(f"/api/investigations/{investigation_id}").json()

    assert response.status_code == 502
    assert response.json() == {"detail": "AI provider unavailable"}
    assert after == before


def test_visual_observation_and_evidence_are_persisted(tmp_path: Path) -> None:
    analyzer = StubImageAnalyzer()
    client, database, investigation_id = image_client(tmp_path, analyzer)

    post_image(client, investigation_id)
    state = SQLiteInvestigationStore(database).get_investigation(
        investigation_id
    )

    observation = next(iter(state.observations.values()))
    evidence = next(iter(state.evidence.values()))
    assert observation.source_type.value == "image_analysis"
    assert observation.source_id == "image-action-1"
    assert evidence.observation_id == observation.id
    assert evidence.source_type.value == "image_analysis"


def test_image_analysis_never_creates_measurement(tmp_path: Path) -> None:
    analyzer = StubImageAnalyzer()
    client, database, investigation_id = image_client(tmp_path, analyzer)

    post_image(client, investigation_id)
    state = SQLiteInvestigationStore(database).get_investigation(
        investigation_id
    )

    assert state.measurements == {}
    observation = next(iter(state.observations.values()))
    assert observation.value is None
    assert observation.unit is None


def test_image_alone_never_changes_hypothesis_status(tmp_path: Path) -> None:
    analyzer = StubImageAnalyzer()
    client, database, investigation_id = image_client(tmp_path, analyzer)

    post_image(client, investigation_id)
    state = SQLiteInvestigationStore(database).get_investigation(
        investigation_id
    )

    assert all(
        hypothesis.status.value == "unexplored"
        for hypothesis in state.hypotheses.values()
    )
    verification = next(iter(state.verifications.values()))
    assert verification.impacts == []


def test_image_requires_an_explicit_core_action(tmp_path: Path) -> None:
    analyzer = StubImageAnalyzer()
    app = create_app(
        database_path=tmp_path / "image.sqlite3",
        provider_factory=AskingProvider,
        image_analyzer_factory=lambda: analyzer,
    )
    client = TestClient(app)
    investigation_id = client.post(
        "/api/investigations",
        json={"problem": "Production faible."},
    ).json()["investigation_id"]

    response = post_image(client, investigation_id)

    assert response.status_code == 409
    assert analyzer.calls == 0


def test_image_error_never_exposes_api_key(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    secret = "image-secret-that-must-not-leak"
    monkeypatch.setenv("MODEL_API_KEY", secret)
    analyzer = StubImageAnalyzer(error=ProviderHTTPError(secret))
    client, _, investigation_id = image_client(tmp_path, analyzer)

    response = post_image(client, investigation_id)

    assert response.status_code == 502
    assert secret not in response.text


def test_meta_image_adapter_uses_multimodal_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MODEL_API_KEY", "not-a-real-key")

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        assert request.headers["Authorization"] == "Bearer not-a-real-key"
        assert body["model"] == "muse-spark-1.3"
        content = body["messages"][1]["content"]
        assert content[0]["type"] == "text"
        assert content[1]["type"] == "image_url"
        assert content[1]["image_url"]["url"].startswith(
            "data:image/png;base64,"
        )
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "description": (
                                        "Des dépôts sont visibles sur le panneau."
                                    ),
                                    "certainty": 0.8,
                                }
                            )
                        }
                    }
                ]
            },
            request=request,
        )

    analyzer = MetaImageAnalyzer(
        client=httpx.Client(transport=httpx.MockTransport(handler))
    )

    result = analyzer.analyze(PNG_BYTES, "image/png", "Dépôts visibles")

    assert result.description == "Des dépôts sont visibles sur le panneau."
    assert result.certainty == 0.8


def test_meta_image_adapter_rejects_non_observation_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MODEL_API_KEY", "not-a-real-key")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "description": "Panneau visible.",
                                    "certainty": 0.8,
                                    "voltage": 18,
                                }
                            )
                        }
                    }
                ]
            },
            request=request,
        )

    analyzer = MetaImageAnalyzer(
        client=httpx.Client(transport=httpx.MockTransport(handler))
    )

    with pytest.raises(ProviderResponseError):
        analyzer.analyze(PNG_BYTES, "image/png", "État visible")
