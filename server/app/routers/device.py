from datetime import UTC
from hashlib import sha256
import json
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from ..config import Settings, get_settings
from ..database import get_db
from ..dependencies import require_device
from ..models import (
    Command,
    CommandAcknowledgement,
    Device,
    DeviceScheduleSnapshot,
    DeviceGroup,
    DiagnosticReport,
    PairingCode,
    utc_now,
)
from ..schemas import (
    CommandPayload,
    DiagnosticUpload,
    PairRequest,
    PairResponse,
    RevisionPayload,
    SyncRequest,
    SyncResponse,
)
from ..security import generate_secret, hash_secret

router = APIRouter(tags=["device"])


def as_aware(value):
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


@router.post("/pair", response_model=PairResponse)
def pair_device(
    payload: PairRequest,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> PairResponse:
    now = utc_now()
    pairing_code = db.scalar(
        select(PairingCode).where(PairingCode.code_hash == hash_secret(payload.pairing_code))
    )
    if (
        pairing_code is None
        or pairing_code.consumed_at is not None
        or as_aware(pairing_code.expires_at) <= now
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid pairing code")
    existing = db.scalar(select(Device).where(Device.installation_id == payload.installation_id))
    if existing is not None and not existing.revoked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="installation already paired"
        )

    group = db.get(DeviceGroup, pairing_code.group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="group not found")
    token = generate_secret()
    device = existing or Device(
        group_id=group.id,
        installation_id=payload.installation_id,
        name=payload.device_name,
        token_hash=hash_secret(token),
    )
    device.group_id = group.id
    device.name = payload.device_name
    device.token_hash = hash_secret(token)
    device.revoked = False
    device.app_version = payload.app_version
    device.plugin_version = payload.plugin_version
    device.platform = payload.platform
    if device.last_seen is None or (
        now - as_aware(device.last_seen)
    ).total_seconds() > settings.device_online_timeout_seconds:
        device.online_session_id = str(uuid4())
    device.last_seen = now
    consumed = db.execute(
        update(PairingCode)
        .where(PairingCode.id == pairing_code.id, PairingCode.consumed_at.is_(None))
        .values(consumed_at=now)
    )
    if consumed.rowcount != 1:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid pairing code")
    db.add(device)
    db.commit()
    return PairResponse(
        device_id=device.id,
        device_token=token,
        organization_name=group.organization.name,
        group_name=group.name,
        poll_interval_seconds=settings.poll_interval_seconds,
    )


@router.post("/sync", response_model=SyncResponse)
def sync_device(
    payload: SyncRequest,
    device: Annotated[Device, Depends(require_device)],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> SyncResponse:
    now = utc_now()
    device.app_version = payload.app_version
    device.plugin_version = payload.plugin_version
    device.platform = payload.platform
    device.current_status = payload.runtime.status
    device.current_title = payload.runtime.title
    device.schedule_revision = payload.schedule_revision
    device.policy_revision = payload.policy_revision
    device.last_cursor = max(device.last_cursor, payload.cursor)
    device.last_error = payload.last_error
    device.last_seen = now

    if payload.schedule_snapshot is not None:
        snapshot_data = payload.schedule_snapshot.schedule.model_dump(mode="json")
        encoded = json.dumps(snapshot_data, ensure_ascii=False, sort_keys=True).encode("utf-8")
        if len(encoded) > 2_000_000:
            raise HTTPException(status_code=413, detail="schedule snapshot is too large")
        request_command = db.scalar(
            select(Command).where(
                Command.device_id == device.id,
                Command.type == "request_schedule_snapshot",
            ).order_by(Command.cursor.desc())
        )
        if (
            request_command is None
            or request_command.payload.get("request_id") != payload.schedule_snapshot.request_id
        ):
            raise HTTPException(status_code=409, detail="stale schedule snapshot request")
        snapshot = db.get(DeviceScheduleSnapshot, device.id)
        if snapshot is None:
            snapshot = DeviceScheduleSnapshot(device_id=device.id)
            db.add(snapshot)
        snapshot.request_id = payload.schedule_snapshot.request_id
        normalized_snapshot = {
            **snapshot_data,
            "overrides": [
                override
                for override in snapshot_data.get("overrides", [])
                if not str(override.get("id", "")).startswith("swap_cc_")
            ],
        }
        normalized_encoded = json.dumps(
            normalized_snapshot, ensure_ascii=False, sort_keys=True
        ).encode("utf-8")
        snapshot.schedule_hash = sha256(normalized_encoded).hexdigest()
        snapshot.data = snapshot_data
        snapshot.uploaded_at = now

    for ack in payload.acknowledgements:
        command = db.get(Command, ack.command_id)
        if command is None or not (
            command.device_id == device.id or command.group_id == device.group_id
        ):
            continue
        acknowledgement = db.scalar(
            select(CommandAcknowledgement).where(
                CommandAcknowledgement.command_id == ack.command_id,
                CommandAcknowledgement.device_id == device.id,
            )
        )
        if acknowledgement is None:
            acknowledgement = CommandAcknowledgement(
                command_id=ack.command_id,
                device_id=device.id,
                status=ack.status,
            )
            db.add(acknowledgement)
        acknowledgement.status = ack.status
        acknowledgement.error_code = ack.error_code
        acknowledgement.message = ack.message
        acknowledgement.updated_at = now

    group = db.get(DeviceGroup, device.group_id)
    schedule = None
    if (
        group
        and group.schedule_revision
        and group.schedule_revision.revision > payload.schedule_revision
    ):
        schedule = RevisionPayload(
            revision=group.schedule_revision.revision,
            data=group.schedule_revision.data,
        )
    policy = None
    if group and group.policy_revision and group.policy_revision.revision > payload.policy_revision:
        policy = RevisionPayload(
            revision=group.policy_revision.revision,
            data=group.policy_revision.data,
        )

    candidate_commands = db.scalars(
        select(Command)
        .where(
            Command.cursor > payload.cursor,
            Command.expires_at > now,
            or_(Command.device_id == device.id, Command.group_id == device.group_id),
        )
        .order_by(Command.cursor)
        .limit(100)
    ).all()
    commands = [
        command
        for command in candidate_commands
        if command.rollout_percentage >= 100
        or int(sha256(f"{command.id}:{device.id}".encode()).hexdigest()[:8], 16) % 100
        < command.rollout_percentage
    ]
    response_cursor = max([payload.cursor, *(command.cursor for command in candidate_commands)])
    device.last_cursor = max(device.last_cursor, response_cursor)
    db.commit()

    return SyncResponse(
        server_time=now,
        poll_interval_seconds=settings.poll_interval_seconds,
        cursor=response_cursor,
        organization_name=group.organization.name if group else "",
        group_name=group.name if group else "",
        schedule=schedule,
        policy=policy,
        commands=[
            CommandPayload(
                command_id=command.id,
                cursor=command.cursor,
                type=command.type,
                payload=command.payload,
                issued_at=command.created_at,
                expires_at=command.expires_at,
            )
            for command in commands
        ],
    )


@router.post("/unpair", status_code=status.HTTP_204_NO_CONTENT)
def unpair_device(
    device: Annotated[Device, Depends(require_device)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    device.revoked = True
    device.token_hash = hash_secret(generate_secret())
    db.commit()


@router.post("/diagnostics", status_code=status.HTTP_201_CREATED)
def upload_diagnostics(
    payload: DiagnosticUpload,
    device: Annotated[Device, Depends(require_device)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, str]:
    report = DiagnosticReport(
        device_id=device.id,
        app_version=payload.app_version,
        plugin_version=payload.plugin_version,
        payload=payload.model_dump(mode="json"),
    )
    db.add(report)
    db.commit()
    return {"id": report.id}
