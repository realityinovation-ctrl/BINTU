"""Authentication and organization isolation. No Clerk network and no secret."""

from __future__ import annotations

import json
import logging
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from clerk_backend_api.security.types import (
    AuthStatus,
    RequestState,
    TokenVerificationErrorReason,
)
from bintu_agent_core.sqlite_store import SQLiteInvestigationStore
from bintu_backend.app import create_app
from bintu_backend.authentication import (
    ClerkRequestAuthenticator,
    context_from_payload,
)
from bintu_backend.authorization import (
    DIAGNOSTIC_CREATE,
    DIAGNOSTIC_OPERATE,
    DIAGNOSTIC_READ,
    ORGANIZATION_MANAGE,
    ROLE_PERMISSIONS,
    PermissionDenied,
    authorize,
)
from bintu_backend.migration import claim_demo_organization
from tests.auth_support import (
    OTHER_ORGANIZATION_ID,
    TEST_ORGANIZATION_ID,
    TEST_USER_ID,
    authenticated_app,
    context_for,
)
from bintu_backend.authentication import FixedAuthenticator


PNG_BYTES = b"\x89PNG\r\n\x1a\nminimal-test-payload"


class AskingProvider:
    def decide_next(self, state: object) -> object:
        from bintu_agent_core.models import (
            AgentDecision,
            AskTechnicianArguments,
            HypothesisId,
            ToolName,
        )

        question = "Quel état est affiché ?"
        if getattr(state, "observations", None):
            question = "Depuis quand cette observation est-elle constatée ?"
        return AgentDecision(
            tool_name=ToolName.ASK_TECHNICIAN,
            arguments=AskTechnicianArguments(
                question=question,
                distinguishes=[HypothesisId.H0, HypothesisId.H2],
            ),
            reason="Obtenir une observation.",
        )


def _client(tmp_path: Path, authenticator: object) -> TestClient:
    return TestClient(
        create_app(
            database_path=tmp_path / "access.sqlite3",
            provider_factory=AskingProvider,
            authenticator=authenticator,  # type: ignore[arg-type]
        )
    )


def _create(client: TestClient) -> str:
    response = client.post(
        "/api/investigations?organization_id=org_sent_by_the_browser",
        json={
            "problem": "Production faible.",
            "organization_id": "org_sent_by_the_browser",
            "created_by_user_id": "user_sent_by_the_browser",
            "role": "owner",
        },
    )
    assert response.status_code == 422
    response = client.post(
        "/api/investigations?organization_id=org_sent_by_the_browser",
        json={"problem": "Production faible."},
    )
    assert response.status_code == 201
    return response.json()["investigation_id"]


def test_health_is_public_and_diagnostics_require_a_session(tmp_path: Path) -> None:
    client = TestClient(
        create_app(
            database_path=tmp_path / "health.sqlite3",
            provider_factory=AskingProvider,
        )
    )

    assert client.get("/api/health").status_code == 200
    denied = client.get("/api/investigations")
    assert denied.status_code == 401
    assert denied.json() == {"detail": "Authentication required"}
    assert "sk_" not in denied.text


def test_invalid_and_expired_tokens_are_unauthorized(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    seen: dict[str, list[str]] = {}

    def verify(request, *, secret_key: str, authorized_parties: list[str]):
        del secret_key
        seen["parties"] = authorized_parties
        token = request.headers.get("authorization", "")
        if token == "Bearer expired-token-value":
            return RequestState(
                status=AuthStatus.SIGNED_OUT,
                reason=TokenVerificationErrorReason.TOKEN_EXPIRED,
            )
        return RequestState(
            status=AuthStatus.SIGNED_OUT,
            reason=TokenVerificationErrorReason.TOKEN_INVALID_SIGNATURE,
        )

    client = _client(
        tmp_path,
        ClerkRequestAuthenticator(
            "sk_test_unused",
            ["http://localhost:5173"],
            verify=verify,
        ),
    )
    with caplog.at_level(logging.INFO, logger="bintu.authentication"):
        expired = client.get(
            "/api/investigations",
            headers={"Authorization": "Bearer expired-token-value"},
        )
        invalid = client.get(
            "/api/investigations",
            headers={"Authorization": "Bearer invalid-token-value"},
        )

    assert expired.status_code == 401
    assert invalid.status_code == 401
    assert expired.json()["detail"] == "Authentication required"
    assert "Token has expired" not in expired.text
    assert "expired-token-value" not in caplog.text
    assert "invalid-token-value" not in caplog.text
    assert "sk_test_unused" not in caplog.text
    assert seen["parties"] == ["http://localhost:5173"]


def test_production_without_authorized_parties_rejects_every_token(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("BINTU_ENV", "production")
    monkeypatch.delenv("CLERK_AUTHORIZED_PARTIES", raising=False)
    called = {"count": 0}

    def verify(request, *, secret_key: str, authorized_parties: list[str]):
        del request, secret_key, authorized_parties
        called["count"] += 1
        raise AssertionError("verification must not run without parties")

    authenticator = ClerkRequestAuthenticator.from_environment()
    authenticator._verify = verify  # type: ignore[method-assign]
    client = _client(tmp_path, authenticator)
    response = client.get(
        "/api/investigations",
        headers={"Authorization": "Bearer not-verified"},
    )

    assert response.status_code == 401
    assert called["count"] == 0
    assert "not-verified" not in response.text


def test_missing_organization_is_forbidden(tmp_path: Path) -> None:
    client = _client(
        tmp_path,
        FixedAuthenticator(
            context_for("member", organization_id=None, user_id=TEST_USER_ID)
        ),
    )

    response = client.get("/api/investigations")

    assert response.status_code == 403
    assert response.json() == {"detail": "Active organization required"}


def test_free_clerk_roles_map_to_bintu_permissions() -> None:
    admin = context_from_payload(
        {
            "sub": "user_admin",
            "org_id": TEST_ORGANIZATION_ID,
            "org_role": "org:admin",
        }
    )
    member = context_from_payload(
        {
            "sub": "user_member",
            "org_id": TEST_ORGANIZATION_ID,
            "org_role": "member",
        }
    )
    unknown = context_from_payload(
        {
            "sub": "user_owner",
            "org_id": TEST_ORGANIZATION_ID,
            "org_role": "org:owner",
        }
    )

    assert admin.role == "admin"
    assert admin.permissions == ROLE_PERMISSIONS["admin"]
    assert ORGANIZATION_MANAGE in admin.permissions
    authorize(admin, ORGANIZATION_MANAGE)
    authorize(admin, DIAGNOSTIC_OPERATE)
    assert member.role == "member"
    assert member.permissions == frozenset(
        {DIAGNOSTIC_READ, DIAGNOSTIC_CREATE, DIAGNOSTIC_OPERATE}
    )
    assert ORGANIZATION_MANAGE not in member.permissions
    with pytest.raises(PermissionDenied):
        authorize(member, ORGANIZATION_MANAGE)
    assert unknown.role is None
    assert unknown.permissions == frozenset()


def test_unknown_role_cannot_read_a_diagnostic(tmp_path: Path) -> None:
    context = context_from_payload(
        {"sub": "user_owner", "org_id": TEST_ORGANIZATION_ID, "org_role": "org:reader"}
    )
    client = _client(tmp_path, FixedAuthenticator(context))

    response = client.get("/api/investigations")

    assert response.status_code == 403
    assert response.json() == {"detail": "Permission denied"}


def test_verified_token_permissions_override_the_role_name(tmp_path: Path) -> None:
    context = context_from_payload(
        {
            "sub": TEST_USER_ID,
            "org_id": TEST_ORGANIZATION_ID,
            "org_role": "org:admin",
            "org_permissions": ["org:diagnostic:read"],
        }
    )
    assert context.role == "admin"
    assert context.permissions == frozenset({DIAGNOSTIC_READ})
    client = _client(tmp_path, FixedAuthenticator(context))

    response = client.post(
        "/api/investigations", json={"problem": "Production faible."}
    )

    assert response.status_code == 403


def test_raw_v2_organization_claim_is_accepted() -> None:
    context = context_from_payload(
        {
            "sub": "user_member",
            "v": 2,
            "o": {"id": TEST_ORGANIZATION_ID, "rol": "member"},
        }
    )

    assert context.organization_id == TEST_ORGANIZATION_ID
    assert context.role == "member"
    assert context.permissions == ROLE_PERMISSIONS["member"]


def test_pending_session_has_no_organization() -> None:
    context = context_from_payload(
        {
            "sub": TEST_USER_ID,
            "sts": "pending",
            "org_id": TEST_ORGANIZATION_ID,
            "org_role": "member",
        }
    )

    assert context.organization_id is None
    assert context.permissions == frozenset()


def test_member_create_uses_the_verified_organization(tmp_path: Path) -> None:
    database = tmp_path / "access.sqlite3"
    client = _client(tmp_path, FixedAuthenticator(context_for(
        "member", user_id=TEST_USER_ID
    )))
    investigation_id = _create(client)

    with sqlite3.connect(database) as connection:
        row = connection.execute(
            """
            SELECT organization_id, created_by_user_id, state_revision, state_json
            FROM investigations WHERE id = ?
            """,
            (investigation_id,),
        ).fetchone()

    assert row[0] == TEST_ORGANIZATION_ID
    assert row[1] == TEST_USER_ID
    assert row[2] == 2
    payload = json.loads(row[3])
    assert "organization_id" not in payload
    assert "user_id" not in payload
    listed = client.get("/api/investigations")
    assert listed.status_code == 200
    assert listed.json()[0]["investigation_id"] == investigation_id


def test_admin_and_member_can_operate_inside_their_organization(
    tmp_path: Path,
) -> None:
    database = tmp_path / "roles.sqlite3"
    admin = TestClient(
        create_app(
            database_path=database,
            provider_factory=AskingProvider,
            authenticator=FixedAuthenticator(
                context_for("admin", user_id="user_test_admin")
            ),
        )
    )
    investigation_id = _create(admin)
    assert admin.get(f"/api/investigations/{investigation_id}").status_code == 200
    assert (
        admin.post(
            f"/api/investigations/{investigation_id}/message",
            json={"message": "Observation admin."},
        ).status_code
        == 200
    )

    member = TestClient(
        create_app(
            database_path=database,
            provider_factory=AskingProvider,
            authenticator=FixedAuthenticator(
                context_for("member", user_id=TEST_USER_ID)
            ),
        )
    )
    assert member.get(f"/api/investigations/{investigation_id}").status_code == 200
    created = member.post(
        "/api/investigations", json={"problem": "Second diagnostic."}
    )
    assert created.status_code == 201
    member_id = created.json()["investigation_id"]
    assert (
        member.post(
            f"/api/investigations/{member_id}/message",
            json={"message": "Observation membre."},
        ).status_code
        == 200
    )


def test_read_only_permissions_cannot_change_a_diagnostic(tmp_path: Path) -> None:
    database = tmp_path / "shared.sqlite3"
    member = TestClient(
        authenticated_app(
            database_path=database, provider_factory=AskingProvider
        )
    )
    investigation_id = _create(member)
    limited = TestClient(
        create_app(
            database_path=database,
            provider_factory=AskingProvider,
            authenticator=FixedAuthenticator(
                context_for(
                    "member",
                    permissions=frozenset({DIAGNOSTIC_READ}),
                )
            ),
        )
    )

    assert limited.get(f"/api/investigations/{investigation_id}").status_code == 200
    assert limited.get("/api/investigations").status_code == 200
    assert limited.post(
        "/api/investigations", json={"problem": "Interdit."}
    ).status_code == 403
    message = limited.post(
        f"/api/investigations/{investigation_id}/message",
        json={"message": "non"},
    )
    measurement = limited.post(
        f"/api/investigations/{investigation_id}/measurement",
        json={
            "measurement_type": "dc_voltage",
            "value": 1,
            "unit": "V",
            "location": "bornes",
        },
    )
    image = limited.post(
        f"/api/investigations/{investigation_id}/image",
        files={"image": ("panel.png", PNG_BYTES, "image/png")},
    )
    audio = limited.post(
        f"/api/investigations/{investigation_id}/transcribe",
        files={"audio": ("recording.wav", b"RIFF", "audio/wav")},
    )

    assert message.status_code == 403
    assert measurement.status_code == 403
    assert image.status_code == 403
    assert audio.status_code == 403
    assert "Permission denied" == message.json()["detail"]


def test_another_organization_receives_not_found(tmp_path: Path) -> None:
    database = tmp_path / "shared.sqlite3"
    admin = TestClient(
        authenticated_app(
            database_path=database, provider_factory=AskingProvider
        )
    )
    investigation_id = _create(admin)
    outsider = TestClient(
        create_app(
            database_path=database,
            provider_factory=AskingProvider,
            authenticator=FixedAuthenticator(
                context_for(
                    "member",
                    organization_id=OTHER_ORGANIZATION_ID,
                    user_id="user_test_other",
                )
            ),
        )
    )

    assert outsider.get("/api/investigations").json() == []
    assert (
        outsider.get(f"/api/investigations/{investigation_id}").status_code == 404
    )
    assert (
        outsider.post(
            f"/api/investigations/{investigation_id}/message",
            json={"message": "non"},
        ).status_code
        == 404
    )
    assert (
        outsider.post(
            f"/api/investigations/{investigation_id}/transcribe",
            files={"audio": ("recording.wav", b"RIFF", "audio/wav")},
        ).status_code
        == 404
    )
    assert admin.get(f"/api/investigations/{investigation_id}").status_code == 200


def test_local_cors_allows_the_bearer_header(tmp_path: Path) -> None:
    client = TestClient(
        create_app(database_path=tmp_path / "cors.sqlite3", provider_factory=AskingProvider)
    )
    allowed = client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    rejected = client.options(
        "/api/health",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )

    assert allowed.status_code == 200
    assert "authorization" in allowed.headers["access-control-allow-headers"].lower()
    assert allowed.headers.get("access-control-allow-credentials") in {None, "false"}
    assert rejected.headers.get("access-control-allow-origin") is None


def test_unassigned_diagnostics_keep_their_snapshot(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    database = tmp_path / "legacy.sqlite3"
    store = SQLiteInvestigationStore(database)
    originals = []
    for _ in range(3):
        state = store.create_investigation()
        originals.append(state.investigation_id)
    before = _snapshots(database)

    monkeypatch.setenv("BINTU_DEMO_ORGANIZATION_ID", "not-an-org")
    monkeypatch.setenv("BINTU_MIGRATION_USER_ID", "user_migration")
    assert claim_demo_organization(store) == 0
    assert _snapshots(database) == before

    monkeypatch.setenv("BINTU_DEMO_ORGANIZATION_ID", "org_demo123")
    monkeypatch.setenv("BINTU_MIGRATION_USER_ID", "user_migration")
    assert claim_demo_organization(store) == 3
    after = {item[0]: item for item in _snapshots(database)}

    assert set(after) == set(originals)
    for investigation_id, state_json, *_rest in before:
        assert after[investigation_id][1] == state_json
        assert after[investigation_id][2] == "org_demo123"
        assert after[investigation_id][3] == "user_migration"
        assert after[investigation_id][4] == 1


def _snapshots(database: Path) -> list[tuple[str, str, str | None, str | None, int]]:
    with sqlite3.connect(database) as connection:
        return connection.execute(
            """
            SELECT id, state_json, organization_id, created_by_user_id, state_revision
            FROM investigations
            ORDER BY id
            """
        ).fetchall()
