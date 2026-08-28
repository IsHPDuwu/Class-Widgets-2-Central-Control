import asyncio
import base64
from datetime import timedelta
from unittest.mock import patch

from app.config import Settings
from app.database import SessionLocal
from app.models import OAuthExchangeCode, OAuthProvider, utc_now
from app.routers.auth import _discovery
from app.security import encrypt_secret, generate_secret, hash_secret


def create_organization(client, admin_headers):
    return client.post(
        "/api/v1/admin/organizations",
        json={"name": "Permission School"},
        headers=admin_headers,
    ).json()


def create_user(client, admin_headers, organization_id, username="member"):
    response = client.post(
        "/api/v1/auth/users",
        headers=admin_headers,
        json={
            "username": username,
            "password": "strong-password-123",
            "role": "admin",
            "organization_ids": [organization_id],
        },
    )
    assert response.status_code == 201
    return response.json()


def login(client, username="member"):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": "strong-password-123"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['token']}"}


def test_explicit_grants_replace_legacy_role_and_inherit_to_group(client, admin_headers):
    organization = create_organization(client, admin_headers)
    user = create_user(client, admin_headers, organization["id"])
    assigned = client.put(
        f"/api/v1/auth/users/{user['id']}/grants",
        headers=admin_headers,
        json={
            "authorization_status": "active",
            "grants": [
                {
                    "permission_key": "organization.groups.view",
                    "organization_id": organization["id"],
                    "resource_type": "organization",
                }
            ],
        },
    )
    assert assigned.status_code == 200

    headers = login(client)
    visible = client.get(
        f"/api/v1/admin/groups?organization_id={organization['id']}", headers=headers
    )
    assert visible.status_code == 200
    denied = client.post(
        "/api/v1/admin/groups",
        headers=headers,
        json={"organization_id": organization["id"], "name": "Denied Group"},
    )
    assert denied.status_code == 403


def test_pending_account_can_only_read_own_principal(client, admin_headers):
    organization = create_organization(client, admin_headers)
    user = create_user(client, admin_headers, organization["id"], "pending-member")
    client.put(
        f"/api/v1/auth/users/{user['id']}/grants",
        headers=admin_headers,
        json={"authorization_status": "pending", "grants": []},
    )
    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "pending-member", "password": "strong-password-123"},
    )
    assert login_response.status_code == 403


def test_oauth_exchange_code_is_single_use(client):
    plaintext_code = generate_secret()
    session_token = generate_secret()
    with SessionLocal() as db:
        db.add(
            OAuthExchangeCode(
                code_hash=hash_secret(plaintext_code),
                session_token_encrypted=encrypt_secret(
                    session_token,
                    base64.urlsafe_b64encode(b"0" * 32).decode(),
                ),
                expires_at=utc_now() + timedelta(minutes=1),
            )
        )
        db.commit()

    first = client.post("/api/v1/auth/oauth/exchange", json={"code": plaintext_code})
    assert first.status_code == 200
    assert first.json()["token"] == session_token
    second = client.post("/api/v1/auth/oauth/exchange", json={"code": plaintext_code})
    assert second.status_code == 400


def test_cp_oauth_discovery_without_jwks_uses_userinfo():
    provider = OAuthProvider(issuer_url="https://www.cpoauth.com")
    settings = Settings(allow_insecure_http=False, secret_encryption_key=base64.urlsafe_b64encode(b"0" * 32).decode())
    discovery = {
        "issuer": "https://www.cpoauth.com",
        "authorization_endpoint": "https://www.cpoauth.com/oauth/authorize",
        "token_endpoint": "https://www.cpoauth.com/api/oauth/token",
        "userinfo_endpoint": "https://www.cpoauth.com/api/oauth/userinfo",
    }

    class Response:
        content = b"{}"

        def raise_for_status(self):
            return None

        def json(self):
            return discovery

        async def aread(self):
            return self.content

    class Stream:
        async def __aenter__(self):
            return Response()

        async def __aexit__(self, *_args):
            return None

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        def stream(self, *_args, **_kwargs):
            return Stream()

    with patch("app.routers.auth.httpx.AsyncClient", return_value=Client()):
        result = asyncio.run(_discovery(provider, settings))
    assert result["userinfo_endpoint"].endswith("/userinfo")