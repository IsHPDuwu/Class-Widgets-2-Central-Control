from datetime import UTC
from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .database import get_db
from .models import (
    AdminSession,
    AdminUser,
    AuditLog,
    Device,
    Organization,
    OrganizationMembership,
    UserPermissionGrant,
    utc_now,
)
from .permissions import legacy_role_allows
from .security import hash_secret, secrets_match

bearer = HTTPBearer(auto_error=False)


def require_admin(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    x_admin_key: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    if x_admin_key and secrets_match(x_admin_key, hash_secret(settings.admin_key)):
        return {
            "id": "bootstrap",
            "username": "bootstrap",
            "role": "admin",
            "platform_admin": True,
            "organization_ids": None,
            "grants": [],
        }
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication required",
        )
    token_hash = hash_secret(authorization.removeprefix("Bearer ").strip())
    session = db.scalar(select(AdminSession).where(AdminSession.token_hash == token_hash))
    if session is None or session.expires_at.replace(tzinfo=UTC) <= utc_now():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid session")
    user = db.get(AdminUser, session.user_id)
    if user is None or user.disabled:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid session")
    grants = db.scalars(
        select(UserPermissionGrant).where(UserPermissionGrant.user_id == user.id)
    ).all()
    if request.url.path not in {"/api/v1/auth/me", "/api/v1/auth/oauth/complete"} and user.authorization_status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="account pending authorization")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        db.add(
            AuditLog(
                actor=user.username,
                action=request.method.lower(),
                resource=request.url.path,
            )
        )
    organization_ids = set(
        db.scalars(
            select(OrganizationMembership.organization_id).where(
                OrganizationMembership.user_id == user.id
            )
        ).all()
    )
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "platform_admin": False,
        "organization_ids": organization_ids,
        "authorization_status": user.authorization_status,
        "grants": grants,
    }


def has_permission(
    principal: dict[str, Any],
    permission_key: str,
    *,
    organization_id: str | None = None,
    group_id: str | None = None,
    device_id: str | None = None,
) -> bool:
    if principal["platform_admin"]:
        return True
    grants: list[UserPermissionGrant] = principal.get("grants", [])
    if not grants:
        return bool(
            organization_id in principal["organization_ids"]
            and legacy_role_allows(principal["role"], permission_key)
        )
    for grant in grants:
        if grant.permission_key != permission_key:
            continue
        if permission_key.startswith("platform."):
            return grant.organization_id is None
        if grant.organization_id != organization_id:
            continue
        if grant.resource_type == "organization":
            return True
        if grant.resource_type == "group" and grant.resource_id == group_id:
            return True
        if grant.resource_type == "device" and grant.resource_id == device_id:
            return True
    return False


def require_permission(
    principal: dict[str, Any],
    permission_key: str,
    *,
    organization_id: str | None = None,
    group_id: str | None = None,
    device_id: str | None = None,
) -> None:
    if not has_permission(
        principal,
        permission_key,
        organization_id=organization_id,
        group_id=group_id,
        device_id=device_id,
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="permission denied")


def require_organization_access(
    organization_id: str,
    principal: dict[str, Any],
    db: Session,
) -> Organization:
    organization = db.get(Organization, organization_id)
    if organization is None or (
        not principal["platform_admin"]
        and organization_id not in principal["organization_ids"]
        and not any(grant.organization_id == organization_id for grant in principal.get("grants", []))
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="organization not found")
    return organization


def require_platform_admin(principal: dict[str, Any]) -> None:
    if not principal["platform_admin"] and not any(
        grant.permission_key in {"platform.users.manage", "platform.organizations.manage"}
        and grant.organization_id is None
        for grant in principal.get("grants", [])
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="platform admin role required",
        )


def require_device(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> Device:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="device token required"
        )
    token_hash = hash_secret(credentials.credentials)
    device = db.scalar(select(Device).where(Device.token_hash == token_hash))
    if device is None or device.revoked:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid device token")
    return device
