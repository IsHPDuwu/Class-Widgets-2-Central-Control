from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import require_admin, require_organization_access, require_permission
from ..models import AutomationRule, AutomationRun, Device, DeviceGroup, PolicyRevision, ScheduleRevision, utc_iso, utc_now
from ..schemas import AutomationRuleCreate, AutomationRuleUpdate
from ..services.automation import run_cycle

router = APIRouter(tags=["automation"])


def _target(payload, db: Session, principal: dict, permission: str):
    if payload.group_id:
        target = db.get(DeviceGroup, payload.group_id)
        if target is None:
            raise HTTPException(404, "group not found")
        require_organization_access(target.organization_id, principal, db)
        require_permission(principal, permission, organization_id=target.organization_id, group_id=target.id)
        if target.organization_id != payload.organization_id:
            raise HTTPException(400, "group belongs to another organization")
    else:
        target = db.get(Device, payload.device_id)
        if target is None:
            raise HTTPException(404, "device not found")
        require_organization_access(target.group.organization_id, principal, db)
        require_permission(principal, permission, organization_id=target.group.organization_id, group_id=target.group_id, device_id=target.id)
        if target.group.organization_id != payload.organization_id:
            raise HTTPException(400, "device belongs to another organization")


def _serialize(rule: AutomationRule) -> dict:
    return {
        "id": rule.id,
        "organization_id": rule.organization_id,
        "name": rule.name,
        "enabled": rule.enabled,
        "trigger_type": rule.trigger_type,
        "scheduled_time": rule.scheduled_time,
        "weekdays": rule.weekdays or [],
        "run_date": rule.run_date.isoformat() if rule.run_date else None,
        "condition_operator": rule.condition_operator,
        "conditions": rule.conditions or [],
        "delay_seconds": rule.delay_seconds,
        "group_id": rule.group_id,
        "device_id": rule.device_id,
        "action": {"type": rule.action_type, "payload": rule.action_payload},
        "created_at": utc_iso(rule.created_at),
        "updated_at": utc_iso(rule.updated_at),
    }


def _save(rule: AutomationRule, payload: AutomationRuleCreate, db: Session) -> None:
    action_payload = dict(payload.action.payload)
    if payload.action.type == "schedule":
        schedule = db.get(ScheduleRevision, action_payload.get("schedule_id"))
        if schedule is None or schedule.organization_id != payload.organization_id:
            raise HTTPException(400, "schedule belongs to another organization or does not exist")
    elif payload.action.type == "config":
        policy = db.get(PolicyRevision, action_payload.get("policy_id"))
        if policy is None or policy.organization_id != payload.organization_id:
            raise HTTPException(400, "policy belongs to another organization or does not exist")
    rule.organization_id = payload.organization_id
    rule.name = payload.name
    rule.enabled = payload.enabled
    rule.trigger_type = payload.trigger_type
    rule.scheduled_time = payload.scheduled_time.strftime("%H:%M") if payload.scheduled_time else None
    rule.weekdays = payload.weekdays
    rule.run_date = payload.run_date
    rule.condition_operator = payload.condition_operator
    rule.conditions = payload.conditions
    rule.delay_seconds = payload.delay_seconds
    rule.group_id = payload.group_id
    rule.device_id = payload.device_id
    rule.action_type = payload.action.type
    rule.action_payload = action_payload
    rule.updated_at = utc_now()


@router.get("")
def list_automations(
    organization_id: str,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> list[dict]:
    require_organization_access(organization_id, principal, db)
    require_permission(principal, "organization.automations.view", organization_id=organization_id)
    return [_serialize(rule) for rule in db.scalars(select(AutomationRule).where(AutomationRule.organization_id == organization_id).order_by(AutomationRule.created_at.desc())).all()]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_automation(
    payload: AutomationRuleCreate,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> dict:
    require_organization_access(payload.organization_id, principal, db)
    require_permission(principal, "organization.automations.create", organization_id=payload.organization_id)
    _target(payload, db, principal, "organization.automations.create")
    rule = AutomationRule()
    _save(rule, payload, db)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _serialize(rule)


@router.put("/{rule_id}")
def update_automation(
    rule_id: str,
    payload: AutomationRuleUpdate,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> dict:
    rule = db.get(AutomationRule, rule_id)
    if rule is None:
        raise HTTPException(404, "automation not found")
    require_organization_access(rule.organization_id, principal, db)
    require_permission(principal, "organization.automations.update", organization_id=rule.organization_id, group_id=rule.group_id, device_id=rule.device_id)
    if payload.organization_id != rule.organization_id:
        raise HTTPException(400, "organization cannot be changed")
    _target(payload, db, principal, "organization.automations.update")
    _save(rule, payload, db)
    db.commit()
    return _serialize(rule)


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_automation(
    rule_id: str,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> None:
    rule = db.get(AutomationRule, rule_id)
    if rule is None:
        raise HTTPException(404, "automation not found")
    require_organization_access(rule.organization_id, principal, db)
    require_permission(principal, "organization.automations.delete", organization_id=rule.organization_id, group_id=rule.group_id, device_id=rule.device_id)
    db.query(AutomationRun).filter(AutomationRun.rule_id == rule.id).delete(synchronize_session=False)
    db.delete(rule)
    db.commit()


@router.patch("/{rule_id}/enabled")
def set_automation_enabled(
    rule_id: str,
    enabled: bool,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> dict:
    rule = db.get(AutomationRule, rule_id)
    if rule is None:
        raise HTTPException(404, "automation not found")
    require_organization_access(rule.organization_id, principal, db)
    require_permission(principal, "organization.automations.update", organization_id=rule.organization_id, group_id=rule.group_id, device_id=rule.device_id)
    rule.enabled = enabled
    rule.updated_at = utc_now()
    db.commit()
    return _serialize(rule)


@router.get("/{rule_id}/runs")
def list_automation_runs(
    rule_id: str,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> list[dict]:
    rule = db.get(AutomationRule, rule_id)
    if rule is None:
        raise HTTPException(404, "automation not found")
    require_organization_access(rule.organization_id, principal, db)
    require_permission(principal, "organization.automations.view", organization_id=rule.organization_id, group_id=rule.group_id, device_id=rule.device_id)
    return [{
        "id": run.id, "device_id": run.device_id,
        "scheduled_for": utc_iso(run.scheduled_for), "execute_after": utc_iso(run.execute_after),
        "status": run.status, "reason": run.reason, "command_id": run.command_id,
        "finished_at": utc_iso(run.finished_at) if run.finished_at else None,
    } for run in db.scalars(select(AutomationRun).where(AutomationRun.rule_id == rule.id).order_by(AutomationRun.created_at.desc()).limit(100)).all()]


@router.post("/{rule_id}/run-now")
def run_automation_now(
    rule_id: str,
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[dict, Depends(require_admin)],
) -> dict[str, str]:
    rule = db.get(AutomationRule, rule_id)
    if rule is None:
        raise HTTPException(404, "automation not found")
    require_organization_access(rule.organization_id, principal, db)
    require_permission(principal, "organization.automations.execute", organization_id=rule.organization_id, group_id=rule.group_id, device_id=rule.device_id)
    run_cycle()
    return {"status": "queued"}