from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from ..config import get_settings
from ..database import SessionLocal
from ..models import (
    AutomationRule,
    AutomationRun,
    ClassSwapSession,
    Command,
    Device,
    DeviceGroup,
    PolicyRevision,
    ScheduleRevision,
    utc_now,
)


def _online(device: Device, now: datetime) -> bool:
    last_seen = device.last_seen
    if last_seen is None:
        return False
    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=UTC)
    return (now - last_seen).total_seconds() <= get_settings().device_online_timeout_seconds


def _conditions_match(rule: AutomationRule, device: Device, now: datetime) -> bool:
    conditions = rule.conditions or []
    if not conditions:
        return True
    results = []
    for condition in conditions:
        if condition.get("type") == "online":
            results.append(_online(device, now))
        elif condition.get("type") == "status":
            results.append(device.current_status == str(condition.get("value", "")))
        else:
            results.append(False)
    return all(results) if rule.condition_operator == "and" else any(results)


def _scheduled_for(rule: AutomationRule, now: datetime) -> datetime | None:
    local_now = now.astimezone()
    if rule.trigger_type == "online":
        return None
    if not rule.scheduled_time:
        return None
    if rule.trigger_type == "date":
        if rule.run_date != local_now.date() or local_now.strftime("%H:%M") != rule.scheduled_time:
            return None
    elif rule.trigger_type == "weekly":
        if local_now.isoweekday() not in (rule.weekdays or []) or local_now.strftime("%H:%M") != rule.scheduled_time:
            return None
    elif local_now.strftime("%H:%M") != rule.scheduled_time:
        return None
    return local_now.replace(second=0, microsecond=0).astimezone(UTC)


def _targets(db, rule: AutomationRule) -> list[Device]:
    if rule.device_id:
        device = db.get(Device, rule.device_id)
        return [device] if device and not device.revoked else []
    return db.scalars(select(Device).where(Device.group_id == rule.group_id, Device.revoked.is_(False))).all()


def _claim(db, rule: AutomationRule, device: Device, scheduled_for: datetime, session_key: str, now: datetime) -> AutomationRun | None:
    run = AutomationRun(
        rule_id=rule.id,
        device_id=device.id,
        scheduled_for=scheduled_for,
        session_key=session_key,
        execute_after=now + timedelta(seconds=rule.delay_seconds),
    )
    db.add(run)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return None
    return run


def _create_command(db, device: Device, command_type: str, payload: dict[str, Any], expires_at: datetime) -> Command:
    cursor = (db.scalar(select(func.max(Command.cursor))) or 0) + 1
    command = Command(cursor=cursor, device_id=device.id, type=command_type, payload=payload, expires_at=expires_at)
    db.add(command)
    db.flush()
    return command


def _execute_action(db, rule: AutomationRule, device: Device, now: datetime) -> str:
    action = rule.action_payload
    if rule.action_type == "command":
        command_type = str(action["command_type"])
        payload = {key: value for key, value in action.items() if key != "command_type"}
        return _create_command(db, device, command_type, payload, now + timedelta(minutes=5)).id
    if rule.group_id is None:
        raise ValueError("配置或课表自动化必须以分组为目标")
    group = db.get(DeviceGroup, rule.group_id)
    if group is None:
        raise ValueError("目标分组不存在")
    if rule.action_type == "schedule":
        schedule_id = action.get("schedule_id")
        schedule = db.get(ScheduleRevision, schedule_id) if schedule_id else None
        if schedule is None or schedule.organization_id != rule.organization_id:
            raise ValueError("保存的课表不存在或不属于当前组织")
        group.schedule_revision_id = schedule.id
    elif rule.action_type == "config":
        policy_id = action.get("policy_id")
        policy = db.get(PolicyRevision, policy_id) if policy_id else None
        if policy is None or policy.organization_id != rule.organization_id:
            raise ValueError("保存的配置策略不存在或不属于当前组织")
        group.policy_revision_id = policy.id
    else:
        raise ValueError(f"不支持的自动化动作: {rule.action_type}")
    return ""

def _claim_targets(db, rule: AutomationRule, targets: list[Device], scheduled_for: datetime, session_key: str, now: datetime) -> None:
    if rule.action_type in {"config", "schedule"}:
        target = targets[0] if targets else None
        if target is None:
            return
        _claim(db, rule, target, scheduled_for, session_key, now)
        return
    for device in targets:
        _claim(db, rule, device, scheduled_for, session_key, now)


def run_cycle() -> None:
    now = utc_now()
    with SessionLocal() as db:
        local_today = now.astimezone().date()
        expired_swaps = db.scalars(
            select(ClassSwapSession).where(
                ClassSwapSession.status == "active",
                ClassSwapSession.effective_date < local_today,
            )
        ).all()
        for session in expired_swaps:
            device = db.get(Device, session.device_id)
            if device and not device.revoked:
                _create_command(
                    db,
                    device,
                    "restore_class_swap",
                    {"session_id": session.id},
                    now + timedelta(days=1),
                )
            session.status = "expired"
            session.restored_at = now
        rules = db.scalars(select(AutomationRule).where(AutomationRule.enabled.is_(True))).all()
        for rule in rules:
            targets = _targets(db, rule)
            if rule.trigger_type == "online":
                eligible = [
                    device for device in targets
                    if _online(device, now) and _conditions_match(rule, device, now)
                ]
                if rule.action_type in {"config", "schedule"}:
                    if eligible:
                        _claim(db, rule, eligible[0], now.replace(second=0, microsecond=0), eligible[0].online_session_id, now)
                else:
                    for device in eligible:
                        _claim(db, rule, device, now.replace(second=0, microsecond=0), device.online_session_id, now)
                continue
            scheduled_for = _scheduled_for(rule, now)
            if scheduled_for is None:
                continue
            _claim_targets(db, rule, targets, scheduled_for, scheduled_for.isoformat(), now)
        pending = db.scalars(select(AutomationRun).where(AutomationRun.status == "pending", AutomationRun.execute_after <= now)).all()
        for run in pending:
            rule = db.get(AutomationRule, run.rule_id)
            device = db.get(Device, run.device_id)
            if not rule or not device or not rule.enabled or not _conditions_match(rule, device, now):
                run.status, run.reason, run.finished_at = "skipped", "条件不满足或设备已离线", now
                continue
            try:
                run.command_id = _execute_action(db, rule, device, now) or None
                run.status = "created"
            except Exception as exc:
                run.status, run.reason = "failed", str(exc)[:500]
            run.finished_at = now
        db.commit()


async def worker(stop_event: asyncio.Event) -> None:
    interval = get_settings().automation_poll_interval_seconds
    while not stop_event.is_set():
        await asyncio.to_thread(run_cycle)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            pass