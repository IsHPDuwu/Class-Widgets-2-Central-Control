import asyncio
import base64
import hashlib
import ipaddress
import socket
from datetime import UTC, timedelta
from typing import Annotated
from urllib.parse import urlencode, urlparse

import httpx
from authlib.jose import JoseError, jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..config import Settings, get_settings
from ..database import get_db
from ..dependencies import require_admin, require_permission
from ..models import (
    AdminSession,
    AdminUser,
    AuditLog,
    Device,
    DeviceGroup,
    OAuthExchangeCode,
    OAuthIdentity,
    OAuthLoginAttempt,
    OAuthProvider,
    Organization,
    OrganizationMembership,
    SystemSetting,
    UserPermissionGrant,
    utc_iso,
    utc_now,
)
from ..permissions import PERMISSION_KEYS, permission_catalog
from ..schemas import (
    LoginRequest,
    OAuthExchangeRequest,
    OAuthProviderCreate,
    OAuthProviderUpdate,
    RegistrationRequest,
    UserCreate,
    UserOrganizationAssignment,
    UserPermissionAssignment,
)
from ..security import (
    decrypt_secret,
    encrypt_secret,
    generate_secret,
    hash_password,
    hash_secret,
    verify_password,
)

router = APIRouter(tags=["authentication"])


def _provider_dict(provider: OAuthProvider) -> dict:
    return {
        "id": provider.id,
        "key": provider.key,
        "name": provider.name,
        "issuer_url": provider.issuer_url,
        "client_id": provider.client_id,
        "has_client_secret": bool(provider.client_secret_encrypted),
        "scopes": provider.scopes,
        "enabled": provider.enabled,
        "allow_signup": provider.allow_signup,
        "created_at": utc_iso(provider.created_at),
        "updated_at": utc_iso(provider.updated_at),
    }


def _validate_issuer_url(value: str, settings: Settings) -> str:
    normalized = value.strip().rstrip("/")
    parsed = urlparse(normalized)
    if parsed.scheme not in ({"http", "https"} if settings.allow_insecure_http else {"https"}):
        raise HTTPException(status_code=400, detail="OIDC issuer must use HTTPS")
    if not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise HTTPException(status_code=400, detail="invalid OIDC issuer")
    return normalized


async def _validate_remote_url(value: str, settings: Settings, label: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in ({"http", "https"} if settings.allow_insecure_http else {"https"}):
        raise HTTPException(status_code=400, detail=f"invalid OIDC {label}")
    if not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise HTTPException(status_code=400, detail=f"invalid OIDC {label}")
    if settings.allow_insecure_http:
        return value
    try:
        addresses = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: socket.getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM),
        )
    except socket.gaierror as exc:
        raise HTTPException(status_code=400, detail=f"unable to resolve OIDC {label}") from exc
    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if not ip.is_global:
            raise HTTPException(status_code=400, detail=f"OIDC {label} resolves to a private address")
    return value


async def _discovery(provider: OAuthProvider, settings: Settings) -> dict:
    issuer = _validate_issuer_url(provider.issuer_url, settings)
    discovery_url = await _validate_remote_url(
        f"{issuer}/.well-known/openid-configuration", settings, "issuer"
    )
    try:
        async with (
            httpx.AsyncClient(timeout=8, follow_redirects=False) as client,
            client.stream("GET", discovery_url) as response,
        ):
            response.raise_for_status()
            content = await response.aread()
            if len(content) > 1_000_000:
                raise ValueError("discovery document too large")
            document = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="unable to load OIDC discovery") from exc
    if document.get("issuer", "").rstrip("/") != issuer:
        raise HTTPException(status_code=400, detail="OIDC discovery issuer mismatch")
    for key in ("authorization_endpoint", "token_endpoint"):
        await _validate_remote_url(str(document.get(key, "")), settings, key)
    if document.get("jwks_uri"):
        await _validate_remote_url(str(document["jwks_uri"]), settings, "jwks_uri")
    elif not document.get("userinfo_endpoint"):
        raise HTTPException(status_code=400, detail="OIDC discovery requires jwks_uri or userinfo_endpoint")
    else:
        await _validate_remote_url(str(document["userinfo_endpoint"]), settings, "userinfo_endpoint")
    return document


def _create_session(user: AdminUser, db: Session) -> tuple[str, object]:
    token = generate_secret()
    expires_at = utc_now() + timedelta(hours=12)
    db.add(AdminSession(user_id=user.id, token_hash=hash_secret(token), expires_at=expires_at))
    return token, expires_at


def _registration_enabled(db: Session) -> bool:
    SystemSetting.__table__.create(bind=db.get_bind(), checkfirst=True)
    setting = db.get(SystemSetting, "allow_registration")
    return bool(setting.value.get("enabled", False)) if setting else False


@router.get("/registration-status")
def registration_status(db: Annotated[Session, Depends(get_db)]) -> dict[str, bool]:
    return {"allow_registration": _registration_enabled(db)}


def _validate_organization_ids(organization_ids: set[str], db: Session) -> list[str]:
    """Return a stable organization ID list after verifying every ID exists."""
    if not organization_ids:
        return []
    existing_ids = set(
        db.scalars(select(Organization.id).where(Organization.id.in_(organization_ids))).all()
    )
    if missing_ids := organization_ids - existing_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"organization not found: {sorted(missing_ids)[0]}",
        )
    return sorted(existing_ids)


@router.post("/login")
def login(payload: LoginRequest, db: Annotated[Session, Depends(get_db)]) -> dict:
    user = db.scalar(select(AdminUser).where(AdminUser.username == payload.username))
    if user is None or user.disabled or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials")
    if user.authorization_status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="account pending authorization")
    token, expires_at = _create_session(user, db)
    db.add(AuditLog(actor=user.username, action="login", resource="session"))
    db.commit()
    return {"token": token, "expires_at": utc_iso(expires_at), "role": user.role}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    principal: Annotated[dict, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    authorization = request.headers.get("Authorization", "")
    if authorization.startswith("Bearer "):
        db.execute(
            delete(AdminSession).where(
                AdminSession.token_hash == hash_secret(authorization.removeprefix("Bearer ").strip())
            )
        )
        db.commit()


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegistrationRequest, db: Annotated[Session, Depends(get_db)]) -> dict:
    if not _registration_enabled(db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="registration is disabled")
    if db.scalar(select(AdminUser).where(AdminUser.username == payload.username)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="username exists")
    if db.scalar(select(Organization).where(Organization.name == payload.organization_name)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="organization exists")
    organization = Organization(name=payload.organization_name)
    db.add(organization)
    db.flush()
    user = AdminUser(username=payload.username, password_hash=hash_password(payload.password), role="admin")
    db.add(user)
    db.flush()
    db.add(OrganizationMembership(user_id=user.id, organization_id=organization.id))
    db.add(AuditLog(actor=payload.username, action="register", resource=f"organization:{organization.name}"))
    db.commit()
    return {"username": user.username, "organization_id": organization.id}


@router.get("/me")
def current_principal(
    principal: Annotated[dict, Depends(require_admin)],
) -> dict:
    return {
        "id": principal["id"],
        "username": principal["username"],
        "role": principal["role"],
        "platform_admin": principal["platform_admin"],
        "organization_ids": sorted(principal["organization_ids"] or []),
        "authorization_status": principal.get("authorization_status", "active"),
        "permissions": sorted({grant.permission_key for grant in principal.get("grants", [])}),
    }


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    principal: Annotated[dict, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    require_permission(principal, "platform.users.manage")
    if db.scalar(select(AdminUser).where(AdminUser.username == payload.username)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="username exists")
    organization_ids = _validate_organization_ids(payload.organization_ids, db)
    user = AdminUser(
        username=payload.username,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.flush()
    db.add_all(
        [
            OrganizationMembership(user_id=user.id, organization_id=organization_id)
            for organization_id in organization_ids
        ]
    )
    db.add(
        AuditLog(
            actor=principal["username"],
            action="create",
            resource=f"user:{payload.username}",
            details={"role": payload.role, "organization_ids": organization_ids},
        )
    )
    db.commit()
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "organization_ids": organization_ids,
    }


@router.get("/users")
def list_users(
    principal: Annotated[dict, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict]:
    require_permission(principal, "platform.users.manage")
    users = db.scalars(select(AdminUser).order_by(AdminUser.username)).all()
    memberships = db.execute(
        select(OrganizationMembership.user_id, OrganizationMembership.organization_id)
    ).all()
    organization_ids_by_user: dict[str, list[str]] = {}
    for user_id, organization_id in memberships:
        organization_ids_by_user.setdefault(user_id, []).append(organization_id)
    return [
        {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "disabled": user.disabled,
            "display_name": user.display_name,
            "email": user.email,
            "authorization_status": user.authorization_status,
            "has_password": bool(user.password_hash),
            "organization_ids": sorted(organization_ids_by_user.get(user.id, [])),
        }
        for user in users
    ]


@router.put("/users/{user_id}/organizations")
def assign_user_organizations(
    user_id: str,
    payload: UserOrganizationAssignment,
    principal: Annotated[dict, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    require_permission(principal, "platform.users.manage")
    user = db.get(AdminUser, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")
    organization_ids = _validate_organization_ids(payload.organization_ids, db)
    db.execute(delete(OrganizationMembership).where(OrganizationMembership.user_id == user.id))
    db.add_all(
        [
            OrganizationMembership(user_id=user.id, organization_id=organization_id)
            for organization_id in organization_ids
        ]
    )
    db.add(
        AuditLog(
            actor=principal["username"],
            action="assign_organizations",
            resource=f"user:{user.username}",
            details={"organization_ids": organization_ids},
        )
    )
    db.commit()
    return {"id": user.id, "organization_ids": organization_ids}


@router.get("/audit")
def list_audit_logs(
    principal: Annotated[dict, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict]:
    require_permission(principal, "platform.audit.view")
    logs = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(200)).all()
    return [
        {
            "id": item.id,
            "actor": item.actor,
            "action": item.action,
            "resource": item.resource,
            "details": item.details,
            "created_at": utc_iso(item.created_at),
        }
        for item in logs
    ]


@router.get("/permissions/catalog")
def get_permission_catalog(
    principal: Annotated[dict, Depends(require_admin)],
) -> dict:
    return permission_catalog()


@router.get("/users/{user_id}/grants")
def get_user_grants(
    user_id: str,
    principal: Annotated[dict, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    require_permission(principal, "platform.users.manage")
    user = db.get(AdminUser, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    grants = db.scalars(
        select(UserPermissionGrant).where(UserPermissionGrant.user_id == user_id)
    ).all()
    return {
        "user_id": user.id,
        "authorization_status": user.authorization_status,
        "grants": [
            {
                "permission_key": grant.permission_key,
                "organization_id": grant.organization_id,
                "resource_type": grant.resource_type,
                "resource_id": grant.resource_id,
            }
            for grant in grants
        ],
    }


@router.put("/users/{user_id}/grants")
def set_user_grants(
    user_id: str,
    payload: UserPermissionAssignment,
    principal: Annotated[dict, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    require_permission(principal, "platform.users.manage")
    user = db.get(AdminUser, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    normalized: set[tuple[str, str | None, str, str | None]] = set()
    organization_ids: set[str] = set()
    for grant in payload.grants:
        if grant.permission_key not in PERMISSION_KEYS:
            raise HTTPException(status_code=400, detail=f"unknown permission: {grant.permission_key}")
        if grant.permission_key.startswith("platform."):
            if grant.organization_id or grant.resource_type != "platform" or grant.resource_id:
                raise HTTPException(status_code=400, detail="invalid platform permission scope")
        else:
            if not grant.organization_id or db.get(Organization, grant.organization_id) is None:
                raise HTTPException(status_code=400, detail="organization permission requires organization")
            organization_ids.add(grant.organization_id)
            if grant.resource_type == "group":
                group = db.get(DeviceGroup, grant.resource_id)
                if group is None or group.organization_id != grant.organization_id:
                    raise HTTPException(status_code=400, detail="invalid group permission scope")
            elif grant.resource_type == "device":
                device = db.get(Device, grant.resource_id)
                if device is None or device.group.organization_id != grant.organization_id:
                    raise HTTPException(status_code=400, detail="invalid device permission scope")
            elif grant.resource_type != "organization" or grant.resource_id:
                raise HTTPException(status_code=400, detail="invalid organization permission scope")
        normalized.add((grant.permission_key, grant.organization_id, grant.resource_type, grant.resource_id))
    db.execute(delete(UserPermissionGrant).where(UserPermissionGrant.user_id == user.id))
    db.execute(delete(OrganizationMembership).where(OrganizationMembership.user_id == user.id))
    db.add_all(
        UserPermissionGrant(
            user_id=user.id,
            permission_key=key,
            organization_id=organization_id,
            resource_type=resource_type,
            resource_id=resource_id,
        )
        for key, organization_id, resource_type, resource_id in sorted(normalized, key=str)
    )
    db.add_all(
        OrganizationMembership(user_id=user.id, organization_id=organization_id)
        for organization_id in sorted(organization_ids)
    )
    user.authorization_status = payload.authorization_status
    db.add(AuditLog(actor=principal["username"], action="assign_permissions", resource=f"user:{user.username}", details={"grant_count": len(normalized), "authorization_status": payload.authorization_status}))
    db.commit()
    return get_user_grants(user.id, principal, db)


@router.get("/oauth/providers")
def public_oauth_providers(db: Annotated[Session, Depends(get_db)]) -> list[dict]:
    providers = db.scalars(
        select(OAuthProvider).where(OAuthProvider.enabled.is_(True)).order_by(OAuthProvider.name)
    ).all()
    return [{"key": provider.key, "name": provider.name} for provider in providers]


@router.get("/oauth/providers/manage")
def list_oauth_providers(
    principal: Annotated[dict, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict]:
    require_permission(principal, "platform.oauth_providers.manage")
    return [_provider_dict(item) for item in db.scalars(select(OAuthProvider).order_by(OAuthProvider.name)).all()]


@router.post("/oauth/providers/manage", status_code=status.HTTP_201_CREATED)
async def create_oauth_provider(
    payload: OAuthProviderCreate,
    principal: Annotated[dict, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict:
    require_permission(principal, "platform.oauth_providers.manage")
    if db.scalar(select(OAuthProvider).where(OAuthProvider.key == payload.key)):
        raise HTTPException(status_code=409, detail="OAuth provider key exists")
    provider = OAuthProvider(
        key=payload.key,
        name=payload.name,
        issuer_url=_validate_issuer_url(payload.issuer_url, settings),
        client_id=payload.client_id,
        client_secret_encrypted=encrypt_secret(payload.client_secret, settings.secret_encryption_key),
        scopes=payload.scopes,
        enabled=payload.enabled,
        allow_signup=payload.allow_signup,
    )
    await _discovery(provider, settings)
    db.add(provider)
    db.commit()
    return _provider_dict(provider)


@router.put("/oauth/providers/manage/{provider_id}")
async def update_oauth_provider(
    provider_id: str,
    payload: OAuthProviderUpdate,
    principal: Annotated[dict, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict:
    require_permission(principal, "platform.oauth_providers.manage")
    provider = db.get(OAuthProvider, provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="OAuth provider not found")
    provider.name = payload.name
    provider.issuer_url = _validate_issuer_url(payload.issuer_url, settings)
    provider.client_id = payload.client_id
    if payload.client_secret:
        provider.client_secret_encrypted = encrypt_secret(payload.client_secret, settings.secret_encryption_key)
    provider.scopes = payload.scopes
    provider.enabled = payload.enabled
    provider.allow_signup = payload.allow_signup
    provider.updated_at = utc_now()
    await _discovery(provider, settings)
    db.commit()
    return _provider_dict(provider)


@router.post("/oauth/providers/manage/{provider_id}/test")
async def test_oauth_provider(
    provider_id: str,
    principal: Annotated[dict, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, bool]:
    require_permission(principal, "platform.oauth_providers.manage")
    provider = db.get(OAuthProvider, provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="OAuth provider not found")
    await _discovery(provider, settings)
    return {"ok": True}


@router.get("/oauth/{provider_key}/start")
async def start_oauth_login(
    provider_key: str,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    return_path: str = Query(default="/", max_length=300),
):
    provider = db.scalar(select(OAuthProvider).where(OAuthProvider.key == provider_key, OAuthProvider.enabled.is_(True)))
    if provider is None:
        raise HTTPException(status_code=404, detail="OAuth provider not found")
    document = await _discovery(provider, settings)
    state = generate_secret()
    nonce = generate_secret()
    verifier = generate_secret(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    safe_return_path = return_path if return_path.startswith("/") and not return_path.startswith("//") else "/"
    db.add(OAuthLoginAttempt(provider_id=provider.id, state_hash=hash_secret(state), nonce=nonce, code_verifier_encrypted=encrypt_secret(verifier, settings.secret_encryption_key), return_path=safe_return_path, expires_at=utc_now() + timedelta(minutes=10)))
    db.commit()
    callback = f"{settings.public_url.rstrip('/')}/api/v1/auth/oauth/{provider.key}/callback"
    query = urlencode({"response_type": "code", "client_id": provider.client_id, "redirect_uri": callback, "scope": provider.scopes, "state": state, "nonce": nonce, "code_challenge": challenge, "code_challenge_method": "S256"})
    return RedirectResponse(f"{document['authorization_endpoint']}?{query}")


@router.get("/oauth/{provider_key}/callback")
async def oauth_callback(
    provider_key: str,
    code: str,
    state: str,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    provider = db.scalar(select(OAuthProvider).where(OAuthProvider.key == provider_key, OAuthProvider.enabled.is_(True)))
    attempt = db.scalar(select(OAuthLoginAttempt).where(OAuthLoginAttempt.state_hash == hash_secret(state)))
    if provider is None or attempt is None or attempt.provider_id != provider.id or attempt.expires_at.replace(tzinfo=UTC) <= utc_now():
        raise HTTPException(status_code=400, detail="invalid or expired OAuth state")
    nonce = attempt.nonce
    verifier_encrypted = attempt.code_verifier_encrypted
    return_path = attempt.return_path
    db.delete(attempt)
    db.commit()
    document = await _discovery(provider, settings)
    callback = f"{settings.public_url.rstrip('/')}/api/v1/auth/oauth/{provider.key}/callback"
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            token_response = await client.post(document["token_endpoint"], data={"grant_type": "authorization_code", "code": code, "redirect_uri": callback, "client_id": provider.client_id, "client_secret": decrypt_secret(provider.client_secret_encrypted, settings.secret_encryption_key), "code_verifier": decrypt_secret(verifier_encrypted, settings.secret_encryption_key)})
            if token_response.status_code >= 400 or len(token_response.content) > 1_000_000:
                raise HTTPException(status_code=400, detail="OIDC token exchange failed")
            token = token_response.json()
            jwks = None
            if token.get("id_token") and document.get("jwks_uri"):
                async with client.stream("GET", document["jwks_uri"]) as jwks_response:
                    jwks_response.raise_for_status()
                    jwks_content = await jwks_response.aread()
                    if len(jwks_content) > 1_000_000:
                        raise ValueError("JWKS document too large")
                    jwks = jwks_response.json()
            elif not token.get("access_token"):
                raise ValueError("OIDC token response has no id_token or access_token")
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="OIDC provider request failed") from exc
    if token.get("id_token") and jwks is not None:
        try:
            claims = jwt.decode(token["id_token"], jwks, claims_options={"iss": {"essential": True, "value": document["issuer"]}, "aud": {"essential": True, "value": provider.client_id}, "nonce": {"essential": True, "value": nonce}})
            claims.validate()
        except (JoseError, KeyError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="invalid OIDC identity token") from exc
    else:
        try:
            async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
                userinfo_response = await client.get(
                    document["userinfo_endpoint"],
                    headers={"Authorization": f"Bearer {token['access_token']}"},
                )
                userinfo_response.raise_for_status()
                if len(userinfo_response.content) > 1_000_000:
                    raise ValueError("userinfo response too large")
                claims = userinfo_response.json()
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="OIDC UserInfo request failed") from exc
        if not isinstance(claims, dict) or not claims.get("sub"):
            raise HTTPException(status_code=400, detail="OIDC UserInfo has no subject")
    subject = str(claims["sub"])
    identity = db.scalar(select(OAuthIdentity).where(OAuthIdentity.provider_id == provider.id, OAuthIdentity.subject == subject))
    if identity is None:
        if not provider.allow_signup:
            raise HTTPException(status_code=403, detail="OAuth account is not invited")
        base_username = str(claims.get("preferred_username") or claims.get("username") or claims.get("email") or f"oidc-{subject[:20]}")[:70]
        username = base_username
        suffix = 1
        while db.scalar(select(AdminUser).where(AdminUser.username == username)):
            suffix += 1
            username = f"{base_username[:70]}-{suffix}"
        user = AdminUser(username=username, password_hash=None, role="viewer", display_name=str(claims.get("name") or claims.get("display_name") or "")[:120], email=str(claims.get("email", ""))[:320], authorization_status="pending")
        db.add(user)
        db.flush()
        identity = OAuthIdentity(provider_id=provider.id, user_id=user.id, issuer=str(document["issuer"]), subject=subject, email=user.email, display_name=user.display_name)
        db.add(identity)
    else:
        user = db.get(AdminUser, identity.user_id)
    if user is None or user.disabled:
        raise HTTPException(status_code=403, detail="OAuth account is disabled")
    identity.last_login_at = utc_now()
    session_token, _ = _create_session(user, db)
    exchange = generate_secret()
    db.add(OAuthExchangeCode(code_hash=hash_secret(exchange), session_token_encrypted=encrypt_secret(session_token, settings.secret_encryption_key), expires_at=utc_now() + timedelta(seconds=60)))
    db.add(AuditLog(actor=user.username, action="oauth_login", resource=f"provider:{provider.key}"))
    db.commit()
    return RedirectResponse(f"{settings.public_url.rstrip('/')}/oauth/callback?{urlencode({'code': exchange, 'return_path': return_path})}")


@router.post("/oauth/exchange")
def exchange_oauth_code(
    payload: OAuthExchangeRequest,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict:
    exchange = db.scalar(select(OAuthExchangeCode).where(OAuthExchangeCode.code_hash == hash_secret(payload.code)))
    if exchange is None or exchange.expires_at.replace(tzinfo=UTC) <= utc_now():
        raise HTTPException(status_code=400, detail="invalid or expired OAuth exchange code")
    token = decrypt_secret(exchange.session_token_encrypted, settings.secret_encryption_key)
    db.delete(exchange)
    db.commit()
    return {"token": token}