from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import (
    require_admin,
    require_organization_access,
    require_platform_admin,
)
from ..models import (
    Command,
    CommandAcknowledgement,
    Device,
    DeviceGroup,
    DiagnosticReport,
    Organization,
    PairingCode,
    PolicyRevision,
    ScheduleRevision,
    SystemSetting,
    utc_iso,
    utc_now,
)
from ..schemas import (
    CommandCreate,
    GroupAssignment,
    GroupCreate,
    OrganizationCreate,
    PairingCodeCreate,
    PolicyPublish,
    PolicyUpdate,
    ResourceAssignment,
    ResourceClone,
    SchedulePublish,
    ScheduleUpdate,
    RegistrationSetting,
)
from ..security import generate_secret, hash_secret

router = APIRouter(tags=["admin"])


@router.get("/settings/registration")
def get_registration_setting(
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> dict[str, bool]:
    require_platform_admin(principal)
    setting = db.get(SystemSetting, "allow_registration")
    return {"allow_registration": bool(setting and setting.value.get("enabled", False))}


@router.put("/settings/registration")
def update_registration_setting(
    payload: RegistrationSetting,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> dict[str, bool]:
    require_platform_admin(principal)
    setting = db.get(SystemSetting, "allow_registration")
    if setting is None:
        setting = SystemSetting(key="allow_registration")
        db.add(setting)
    setting.value = {"enabled": payload.allow_registration}
    setting.updated_at = utc_now()
    db.commit()
    return {"allow_registration": payload.allow_registration}


def _require_group_access(group_id: str, principal: dict, db: Session) -> DeviceGroup:
    group = db.get(DeviceGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="group not found")
    require_organization_access(group.organization_id, principal, db)
    return group


def _require_device_access(device_id: str, principal: dict, db: Session):
    from ..models import Device

    device = db.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="device not found")
    _require_group_access(device.group_id, principal, db)
    return device


def _require_schedule_access(schedule_id: str, principal: dict, db: Session) -> ScheduleRevision:
    revision = db.get(ScheduleRevision, schedule_id)
    if revision is None:
        raise HTTPException(status_code=404, detail="schedule not found")
    require_organization_access(revision.organization_id, principal, db)
    return revision


def _require_policy_access(policy_id: str, principal: dict, db: Session) -> PolicyRevision:
    revision = db.get(PolicyRevision, policy_id)
    if revision is None:
        raise HTTPException(status_code=404, detail="policy not found")
    require_organization_access(revision.organization_id, principal, db)
    return revision


@router.post("/organizations", status_code=status.HTTP_201_CREATED)
def create_organization(
    payload: OrganizationCreate,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> dict:
    require_platform_admin(principal)
    organization = Organization(name=payload.name)
    db.add(organization)
    db.commit()
    return {"id": organization.id, "name": organization.name}


@router.get("/organizations")
def list_organizations(
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> list[dict]:
    statement = select(Organization).order_by(Organization.name)
    if not principal["platform_admin"]:
        statement = statement.where(Organization.id.in_(principal["organization_ids"]))
    organizations = db.scalars(statement).all()
    return [{"id": item.id, "name": item.name} for item in organizations]


@router.post("/groups", status_code=status.HTTP_201_CREATED)
def create_group(
    payload: GroupCreate,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> dict:
    require_organization_access(payload.organization_id, principal, db)
    group = DeviceGroup(organization_id=payload.organization_id, name=payload.name)
    db.add(group)
    db.commit()
    return {"id": group.id, "organization_id": group.organization_id, "name": group.name}


@router.get("/groups")
def list_groups(
    organization_id: str,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> list[dict]:
    require_organization_access(organization_id, principal, db)
    groups = db.scalars(
        select(DeviceGroup)
        .where(DeviceGroup.organization_id == organization_id)
        .order_by(DeviceGroup.name)
    ).all()
    return [
        {
            "id": item.id,
            "organization_id": item.organization_id,
            "name": item.name,
            "schedule_revision": item.schedule_revision.revision
            if item.schedule_revision
            else 0,
            "policy_revision": item.policy_revision.revision if item.policy_revision else 0,
        }
        for item in groups
    ]


@router.patch("/devices/{device_id}/group")
def move_device(
    device_id: str,
    payload: GroupAssignment,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> dict:
    device = _require_device_access(device_id, principal, db)
    group = _require_group_access(payload.group_id, principal, db)
    if device.group.organization_id != group.organization_id:
        raise HTTPException(
            status_code=400, detail="device and group belong to different organizations"
        )
    device.group_id = group.id
    device.schedule_revision = 0
    device.policy_revision = 0
    db.commit()
    return {"id": device.id, "group_id": group.id, "group_name": group.name}


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(
    device_id: str,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> None:
    """撤销并删除设备，使其安装实例可以重新配对。"""
    device = _require_device_access(device_id, principal, db)
    db.query(CommandAcknowledgement).filter(
        CommandAcknowledgement.device_id == device.id
    ).delete(synchronize_session=False)
    db.query(DiagnosticReport).filter(
        DiagnosticReport.device_id == device.id
    ).delete(synchronize_session=False)
    db.delete(device)
    db.commit()


@router.post("/groups/{group_id}/pairing-codes", status_code=status.HTTP_201_CREATED)
def create_pairing_code(
    group_id: str,
    payload: PairingCodeCreate,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> dict:
    _require_group_access(group_id, principal, db)
    plain_code = generate_secret(9).replace("-", "").replace("_", "")[:10].upper()
    expires_at = utc_now() + timedelta(minutes=payload.expires_in_minutes)
    pairing_code = PairingCode(
        group_id=group_id,
        code_hash=hash_secret(plain_code),
        expires_at=expires_at,
    )
    db.add(pairing_code)
    db.commit()
    return {"code": plain_code, "expires_at": utc_iso(expires_at)}


@router.post("/schedules", status_code=status.HTTP_201_CREATED)
def publish_schedule(
    payload: SchedulePublish,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> dict:
    require_organization_access(payload.organization_id, principal, db)
    latest = db.scalar(
        select(func.max(ScheduleRevision.revision)).where(
            ScheduleRevision.organization_id == payload.organization_id
        )
    )
    revision = ScheduleRevision(
        organization_id=payload.organization_id,
        revision=(latest or 0) + 1,
        name=payload.name,
        data=payload.schedule.model_dump(mode="json"),
    )
    db.add(revision)
    db.flush()
    groups = db.scalars(select(DeviceGroup).where(DeviceGroup.id.in_(payload.group_ids))).all()
    if len(groups) != len(set(payload.group_ids)):
        raise HTTPException(status_code=400, detail="one or more groups were not found")
    if any(group.organization_id != payload.organization_id for group in groups):
        raise HTTPException(status_code=400, detail="group belongs to another organization")
    for group in groups:
        group.schedule_revision_id = revision.id
    db.commit()
    return {"id": revision.id, "revision": revision.revision}


@router.get("/schedules")
def list_schedules(
    organization_id: str,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> list[dict]:
    require_organization_access(organization_id, principal, db)
    revisions = db.scalars(
        select(ScheduleRevision)
        .where(ScheduleRevision.organization_id == organization_id)
        .order_by(ScheduleRevision.revision.desc())
    ).all()
    groups = db.scalars(
        select(DeviceGroup).where(DeviceGroup.organization_id == organization_id)
    ).all()
    return [
        {
            "id": item.id,
            "name": item.name,
            "revision": item.revision,
            "schedule": item.data,
            "group_ids": [group.id for group in groups if group.schedule_revision_id == item.id],
            "created_at": utc_iso(item.created_at),
        }
        for item in revisions
    ]


@router.put("/schedules/{schedule_id}/groups")
def assign_schedule(
    schedule_id: str,
    payload: ResourceAssignment,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> dict:
    revision = _require_schedule_access(schedule_id, principal, db)
    groups = db.scalars(select(DeviceGroup).where(DeviceGroup.id.in_(payload.group_ids))).all()
    if len(groups) != len(set(payload.group_ids)) or any(
        group.organization_id != revision.organization_id for group in groups
    ):
        raise HTTPException(status_code=400, detail="invalid target groups")
    selected_ids = set(payload.group_ids)
    current_groups = db.scalars(
        select(DeviceGroup).where(DeviceGroup.schedule_revision_id == revision.id)
    ).all()
    for group in current_groups:
        if group.id not in selected_ids:
            group.schedule_revision_id = None
    for group in groups:
        group.schedule_revision_id = revision.id
    db.commit()
    return {"id": revision.id, "group_ids": payload.group_ids}


@router.put("/schedules/{schedule_id}", status_code=status.HTTP_201_CREATED)
def update_schedule(
    schedule_id: str,
    payload: ScheduleUpdate,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> dict:
    original = _require_schedule_access(schedule_id, principal, db)
    latest = db.scalar(
        select(func.max(ScheduleRevision.revision)).where(
            ScheduleRevision.organization_id == original.organization_id
        )
    )
    revision = ScheduleRevision(
        organization_id=original.organization_id,
        revision=(latest or 0) + 1,
        name=payload.name,
        data=payload.schedule.model_dump(mode="json"),
    )
    db.add(revision)
    db.commit()
    return {"id": revision.id, "revision": revision.revision, "group_ids": []}


@router.post("/schedules/{schedule_id}/clone", status_code=status.HTTP_201_CREATED)
def clone_schedule(
    schedule_id: str,
    payload: ResourceClone,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> dict:
    original = _require_schedule_access(schedule_id, principal, db)
    latest = db.scalar(
        select(func.max(ScheduleRevision.revision)).where(
            ScheduleRevision.organization_id == original.organization_id
        )
    )
    clone = ScheduleRevision(
        organization_id=original.organization_id,
        revision=(latest or 0) + 1,
        name=payload.name,
        data=original.data,
    )
    db.add(clone)
    db.commit()
    return {"id": clone.id, "revision": clone.revision}


@router.post("/policies", status_code=status.HTTP_201_CREATED)
def publish_policy(
    payload: PolicyPublish,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> dict:
    require_organization_access(payload.organization_id, principal, db)
    latest = db.scalar(
        select(func.max(PolicyRevision.revision)).where(
            PolicyRevision.organization_id == payload.organization_id
        )
    )
    revision = PolicyRevision(
        organization_id=payload.organization_id,
        revision=(latest or 0) + 1,
        name=payload.name,
        data=payload.policy.model_dump(mode="json"),
    )
    db.add(revision)
    db.flush()
    groups = db.scalars(select(DeviceGroup).where(DeviceGroup.id.in_(payload.group_ids))).all()
    if len(groups) != len(set(payload.group_ids)):
        raise HTTPException(status_code=400, detail="one or more groups were not found")
    if any(group.organization_id != payload.organization_id for group in groups):
        raise HTTPException(status_code=400, detail="group belongs to another organization")
    for group in groups:
        group.policy_revision_id = revision.id
    db.commit()
    return {"id": revision.id, "revision": revision.revision}


@router.get("/policies")
def list_policies(
    organization_id: str,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> list[dict]:
    require_organization_access(organization_id, principal, db)
    revisions = db.scalars(
        select(PolicyRevision)
        .where(PolicyRevision.organization_id == organization_id)
        .order_by(PolicyRevision.revision.desc())
    ).all()
    groups = db.scalars(
        select(DeviceGroup).where(DeviceGroup.organization_id == organization_id)
    ).all()
    return [
        {
            "id": item.id,
            "name": item.name,
            "revision": item.revision,
            "policy": item.data,
            "group_ids": [group.id for group in groups if group.policy_revision_id == item.id],
            "created_at": utc_iso(item.created_at),
        }
        for item in revisions
    ]


@router.put("/policies/{policy_id}/groups")
def assign_policy(
    policy_id: str,
    payload: ResourceAssignment,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> dict:
    revision = _require_policy_access(policy_id, principal, db)
    groups = db.scalars(select(DeviceGroup).where(DeviceGroup.id.in_(payload.group_ids))).all()
    if len(groups) != len(set(payload.group_ids)) or any(
        group.organization_id != revision.organization_id for group in groups
    ):
        raise HTTPException(status_code=400, detail="invalid target groups")
    selected_ids = set(payload.group_ids)
    current_groups = db.scalars(
        select(DeviceGroup).where(DeviceGroup.policy_revision_id == revision.id)
    ).all()
    for group in current_groups:
        if group.id not in selected_ids:
            group.policy_revision_id = None
    for group in groups:
        group.policy_revision_id = revision.id
    db.commit()
    return {"id": revision.id, "group_ids": payload.group_ids}


@router.put("/policies/{policy_id}", status_code=status.HTTP_201_CREATED)
def update_policy(
    policy_id: str,
    payload: PolicyUpdate,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> dict:
    original = _require_policy_access(policy_id, principal, db)
    latest = db.scalar(
        select(func.max(PolicyRevision.revision)).where(
            PolicyRevision.organization_id == original.organization_id
        )
    )
    revision = PolicyRevision(
        organization_id=original.organization_id,
        revision=(latest or 0) + 1,
        name=payload.name,
        data=payload.policy.model_dump(mode="json"),
    )
    db.add(revision)
    db.commit()
    return {"id": revision.id, "revision": revision.revision, "group_ids": []}


@router.post("/policies/{policy_id}/clone", status_code=status.HTTP_201_CREATED)
def clone_policy(
    policy_id: str,
    payload: ResourceClone,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> dict:
    original = _require_policy_access(policy_id, principal, db)
    latest = db.scalar(
        select(func.max(PolicyRevision.revision)).where(
            PolicyRevision.organization_id == original.organization_id
        )
    )
    clone = PolicyRevision(
        organization_id=original.organization_id,
        revision=(latest or 0) + 1,
        name=payload.name,
        data=original.data,
    )
    db.add(clone)
    db.commit()
    return {"id": clone.id, "revision": clone.revision}


@router.post("/commands", status_code=status.HTTP_201_CREATED)
def create_command(
    payload: CommandCreate,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> dict:
    if payload.group_id:
        _require_group_access(payload.group_id, principal, db)
    if payload.device_id:
        _require_device_access(payload.device_id, principal, db)
    latest_cursor = db.scalar(select(func.max(Command.cursor))) or 0
    command = Command(
        cursor=latest_cursor + 1,
        group_id=payload.group_id,
        device_id=payload.device_id,
        type=payload.type,
        payload=payload.payload,
        rollout_percentage=payload.rollout_percentage,
        expires_at=utc_now() + timedelta(seconds=payload.expires_in_seconds),
    )
    db.add(command)
    db.commit()
    return {"id": command.id, "cursor": command.cursor}


@router.get("/commands")
def list_commands(
    organization_id: str,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> list[dict]:
    require_organization_access(organization_id, principal, db)
    commands = db.scalars(
        select(Command)
        .where(
            or_(
                Command.group_id.in_(
                    select(DeviceGroup.id).where(
                        DeviceGroup.organization_id == organization_id
                    )
                ),
                Command.device_id.in_(
                    select(Device.id)
                    .join(DeviceGroup)
                    .where(DeviceGroup.organization_id == organization_id)
                ),
            )
        )
        .order_by(Command.cursor.desc())
        .limit(100)
    ).all()
    acknowledgements = db.scalars(
        select(CommandAcknowledgement).where(
            CommandAcknowledgement.command_id.in_([command.id for command in commands])
        )
    ).all()
    devices = {
        device.id: device.name
        for device in db.scalars(
            select(Device)
            .join(DeviceGroup)
            .where(DeviceGroup.organization_id == organization_id)
        ).all()
    }
    acknowledgements_by_command: dict[str, list[dict]] = {}
    for acknowledgement in acknowledgements:
        acknowledgements_by_command.setdefault(acknowledgement.command_id, []).append(
            {
                "device_id": acknowledgement.device_id,
                "device_name": devices.get(acknowledgement.device_id, "未知设备"),
                "status": acknowledgement.status,
                "error_code": acknowledgement.error_code,
                "message": acknowledgement.message,
                "updated_at": utc_iso(acknowledgement.updated_at),
            }
        )
    return [
        {
            "id": command.id,
            "cursor": command.cursor,
            "type": command.type,
            "group_id": command.group_id,
            "device_id": command.device_id,
            "created_at": utc_iso(command.created_at),
            "expires_at": utc_iso(command.expires_at),
            "acknowledgements": acknowledgements_by_command.get(command.id, []),
        }
        for command in commands
    ]


@router.get("/diagnostics")
def list_diagnostics(
    organization_id: str,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> list[dict]:
    require_organization_access(organization_id, principal, db)
    reports = db.scalars(
        select(DiagnosticReport)
        .join(Device, DiagnosticReport.device_id == Device.id)
        .join(DeviceGroup, Device.group_id == DeviceGroup.id)
        .where(DeviceGroup.organization_id == organization_id)
        .order_by(DiagnosticReport.created_at.desc())
        .limit(100)
    ).all()
    devices = {
        device.id: device.name
        for device in db.scalars(
            select(Device)
            .join(DeviceGroup)
            .where(DeviceGroup.organization_id == organization_id)
        ).all()
    }
    return [
        {
            "id": report.id,
            "device_id": report.device_id,
            "device_name": devices.get(report.device_id, "未知设备"),
            "app_version": report.app_version,
            "plugin_version": report.plugin_version,
            "created_at": utc_iso(report.created_at),
            "log_count": len(report.payload.get("logs", [])),
        }
        for report in reports
    ]


@router.get("/diagnostics/{report_id}")
def get_diagnostic(
    report_id: str,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> dict:
    report = db.get(DiagnosticReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="diagnostic report not found")
    device = _require_device_access(report.device_id, principal, db)
    return {
        "id": report.id,
        "device_id": report.device_id,
        "device_name": device.name if device else "未知设备",
        "app_version": report.app_version,
        "plugin_version": report.plugin_version,
        "last_error": report.payload.get("last_error", ""),
        "logs": report.payload.get("logs", []),
        "created_at": utc_iso(report.created_at),
    }


@router.get("/devices")
def list_devices(
    organization_id: str,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> list[dict]:
    require_organization_access(organization_id, principal, db)
    devices = db.scalars(
        select(Device)
        .join(DeviceGroup)
        .where(DeviceGroup.organization_id == organization_id)
        .order_by(Device.name)
    ).all()
    return [
        {
            "id": device.id,
            "group_id": device.group_id,
            "name": device.name,
            "last_seen": utc_iso(device.last_seen) if device.last_seen else None,
            "app_version": device.app_version,
            "plugin_version": device.plugin_version,
            "current_status": device.current_status,
            "current_title": device.current_title,
            "schedule_revision": device.schedule_revision,
            "policy_revision": device.policy_revision,
            "revoked": device.revoked,
        }
        for device in devices
    ]
