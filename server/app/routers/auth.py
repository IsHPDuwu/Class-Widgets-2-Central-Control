from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import require_admin, require_platform_admin
from ..models import (
    AdminSession,
    AdminUser,
    AuditLog,
    Organization,
    OrganizationMembership,
    SystemSetting,
    utc_iso,
    utc_now,
)
from ..schemas import LoginRequest, RegistrationRequest, UserCreate, UserOrganizationAssignment
from ..security import generate_secret, hash_password, hash_secret, verify_password

router = APIRouter(tags=["authentication"])


def _registration_enabled(db: Session) -> bool:
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
    token = generate_secret()
    expires_at = utc_now() + timedelta(hours=12)
    db.add(AdminSession(user_id=user.id, token_hash=hash_secret(token), expires_at=expires_at))
    db.add(AuditLog(actor=user.username, action="login", resource="session"))
    db.commit()
    return {"token": token, "expires_at": utc_iso(expires_at), "role": user.role}


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
    }


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    principal: Annotated[dict, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    require_platform_admin(principal)
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
    require_platform_admin(principal)
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
    require_platform_admin(principal)
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
    require_platform_admin(principal)
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