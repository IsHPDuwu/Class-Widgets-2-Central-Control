from __future__ import annotations

from datetime import date, datetime, time
from enum import StrEnum
from typing import Annotated, Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator


class EntryType(StrEnum):
    CLASS = "class"
    BREAK = "break"
    ACTIVITY = "activity"
    FREE = "free"
    PREPARATION = "preparation"


TimeText = Annotated[str, Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")]


class SubjectPayload(BaseModel):
    id: str
    name: str
    simplifiedName: str | None = None
    teacher: str | None = None
    icon: str | None = None
    color: str | None = None
    location: str | None = None
    isLocalClassroom: bool = True


class EntryPayload(BaseModel):
    id: str
    type: EntryType
    startTime: TimeText
    endTime: TimeText
    subjectId: str | None = None
    title: str | None = None

    @model_validator(mode="after")
    def validate_time_range(self) -> EntryPayload:
        if self.subjectId == "":
            self.subjectId = None
        if self.title is not None and not self.title.strip():
            self.title = None
        if self.endTime <= self.startTime:
            raise ValueError("endTime must be later than startTime")
        return self


WeekSelector = Literal["all"] | int | list[int] | None


class TimelinePayload(BaseModel):
    id: str
    entries: list[EntryPayload] = Field(default_factory=list)
    dayOfWeek: list[Annotated[int, Field(ge=1, le=7)]] | None = None
    weeks: WeekSelector = None
    date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class TimetablePayload(BaseModel):
    id: str
    entryId: str
    dayOfWeek: list[Annotated[int, Field(ge=1, le=7)]] | None = None
    weeks: WeekSelector = None
    subjectId: str | None = None
    title: str | None = None
    startTime: TimeText | None = None
    endTime: TimeText | None = None


class ScheduleMetaPayload(BaseModel):
    id: str
    version: Literal[1] = 1
    maxWeekCycle: Annotated[int, Field(ge=1, le=52)]
    startDate: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")


class SchedulePayload(BaseModel):
    meta: ScheduleMetaPayload
    subjects: list[SubjectPayload] = Field(default_factory=list)
    days: list[TimelinePayload] = Field(default_factory=list)
    overrides: list[TimetablePayload] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_references(self) -> SchedulePayload:
        subject_ids = [subject.id for subject in self.subjects]
        if len(subject_ids) != len(set(subject_ids)):
            raise ValueError("subject ids must be unique")
        entry_ids = [entry.id for day in self.days for entry in day.entries]
        if len(entry_ids) != len(set(entry_ids)):
            raise ValueError("entry ids must be unique")
        known_subjects = set(subject_ids)
        for day in self.days:
            for entry in day.entries:
                if entry.subjectId and entry.subjectId not in known_subjects:
                    raise ValueError(f"unknown subjectId: {entry.subjectId}")
        known_entries = set(entry_ids)
        for override in self.overrides:
            if override.entryId not in known_entries:
                raise ValueError(f"unknown override entryId: {override.entryId}")
            if override.subjectId and override.subjectId not in known_subjects:
                raise ValueError(f"unknown override subjectId: {override.subjectId}")
        override_subject_entry_ids = {
            override.entryId for override in self.overrides if override.subjectId
        }
        for day in self.days:
            for entry in day.entries:
                if not entry.title and not entry.subjectId and entry.id not in override_subject_entry_ids:
                    entry.title = uuid4().hex
        return self


class PolicyPayload(BaseModel):
    overrides: dict[str, Any] = Field(default_factory=dict)
    locked_keys: set[str] = Field(default_factory=set)
    schedule_readonly: bool = True

    @model_validator(mode="after")
    def validate_keys(self) -> PolicyPayload:
        keys = set(self.overrides) | self.locked_keys
        invalid = [
            key
            for key in keys
            if not key
            or len(key) > 240
            or any(not part or not part.replace("_", "").isalnum() for part in key.split("."))
        ]
        if invalid:
            raise ValueError(f"invalid config keys: {', '.join(sorted(invalid))}")
        return self


class OrganizationCreate(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=120)]


class GroupCreate(BaseModel):
    organization_id: str
    name: Annotated[str, Field(min_length=1, max_length=120)]


class GroupAssignment(BaseModel):
    group_id: str


class ResourceAssignment(BaseModel):
    group_ids: list[str] = Field(default_factory=list)


class ResourceClone(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ScheduleUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    schedule: SchedulePayload


class PolicyUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    policy: PolicyPayload


class PairingCodeCreate(BaseModel):
    expires_in_minutes: Annotated[int, Field(default=15, ge=1, le=1440)] = 15


class PairRequest(BaseModel):
    protocol_version: Literal[1] = 1
    pairing_code: str = Field(min_length=6, max_length=64)
    installation_id: str = Field(min_length=8, max_length=120)
    device_name: str = Field(min_length=1, max_length=120)
    app_version: str = ""
    plugin_version: str = ""
    platform: str = ""
    capabilities: set[str] = Field(default_factory=set)


class PairResponse(BaseModel):
    protocol_version: Literal[1] = 1
    device_id: str
    device_token: str
    organization_name: str
    group_name: str
    poll_interval_seconds: int


class CommandAckPayload(BaseModel):
    command_id: str
    status: Literal["accepted", "running", "succeeded", "failed"]
    error_code: str = ""
    message: str = Field(default="", max_length=500)


class RuntimeStatePayload(BaseModel):
    status: str = "unknown"
    title: str = ""
    remaining_seconds: int | None = Field(default=None, ge=0)


class ScheduleSnapshotUpload(BaseModel):
    request_id: str = Field(min_length=1, max_length=36)
    schedule: SchedulePayload


class SyncRequest(BaseModel):
    protocol_version: Literal[1] = 1
    cursor: int = Field(default=0, ge=0)
    schedule_revision: int = Field(default=0, ge=0)
    policy_revision: int = Field(default=0, ge=0)
    app_version: str = ""
    plugin_version: str = ""
    platform: str = ""
    runtime: RuntimeStatePayload = Field(default_factory=RuntimeStatePayload)
    acknowledgements: list[CommandAckPayload] = Field(default_factory=list, max_length=100)
    last_error: str = Field(default="", max_length=1000)
    schedule_snapshot: ScheduleSnapshotUpload | None = None


class RevisionPayload(BaseModel):
    revision: int
    data: dict[str, Any]


class CommandPayload(BaseModel):
    command_id: str
    cursor: int
    type: str
    payload: dict[str, Any]
    issued_at: datetime
    expires_at: datetime


class SyncResponse(BaseModel):
    protocol_version: Literal[1] = 1
    server_time: datetime
    poll_interval_seconds: int
    cursor: int
    organization_name: str = ""
    group_name: str = ""
    schedule: RevisionPayload | None = None
    policy: RevisionPayload | None = None
    commands: list[CommandPayload] = Field(default_factory=list)


class DiagnosticLogPayload(BaseModel):
    time: str = Field(max_length=32)
    level: str = Field(max_length=20)
    message: str = Field(max_length=2000)


class DiagnosticUpload(BaseModel):
    app_version: str = Field(default="", max_length=40)
    plugin_version: str = Field(default="", max_length=40)
    last_error: str = Field(default="", max_length=1000)
    logs: list[DiagnosticLogPayload] = Field(default_factory=list, max_length=200)


class SchedulePublish(BaseModel):
    organization_id: str
    name: str = Field(min_length=1, max_length=120)
    schedule: SchedulePayload
    group_ids: list[str] = Field(default_factory=list)


class PolicyPublish(BaseModel):
    organization_id: str
    name: str = Field(min_length=1, max_length=120)
    policy: PolicyPayload
    group_ids: list[str] = Field(default_factory=list)


class CommandCreate(BaseModel):
    type: Literal[
        "refresh_status",
        "restart_app",
        "upload_diagnostics",
        "show_notification",
        "trigger_action",
        "apply_config",
        "switch_schedule",
        "request_schedule_snapshot",
        "apply_class_swap",
        "restore_class_swap",
    ]
    group_id: str | None = None
    device_id: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    expires_in_seconds: int = Field(default=300, ge=10, le=86400)
    rollout_percentage: int = Field(default=100, ge=1, le=100)

    @model_validator(mode="after")
    def validate_target(self) -> CommandCreate:
        if bool(self.group_id) == bool(self.device_id):
            raise ValueError("exactly one of group_id or device_id is required")
        if self.type == "trigger_action":
            action_id = self.payload.get("action_id")
            if not isinstance(action_id, str) or not action_id.strip() or len(action_id) > 240:
                raise ValueError("trigger_action requires a non-empty action_id up to 240 characters")
            self.payload["action_id"] = action_id.strip()
        if self.type == "switch_schedule":
            name = self.payload.get("name")
            if not isinstance(name, str) or not name.strip():
                raise ValueError("switch_schedule requires name")
            self.payload["name"] = name.strip()
        if self.type == "apply_config":
            overrides = self.payload.get("overrides")
            if not isinstance(overrides, dict) or not overrides:
                raise ValueError("apply_config requires non-empty overrides")
        return self


class ClassSwapPrepare(BaseModel):
    group_id: str


class ClassSwapCreate(BaseModel):
    group_id: str
    request_id: str = Field(min_length=1, max_length=36)
    device_ids: list[str] = Field(default_factory=list, min_length=1)
    operation: Literal["apply_today", "swap", "replace"]
    day_of_week: Annotated[int, Field(ge=1, le=7)]
    week_of_cycle: Annotated[int, Field(ge=1, le=52)]
    entry_id_a: str = Field(default="", max_length=160)
    entry_id_b: str = Field(default="", max_length=160)
    entry_id: str = Field(default="", max_length=160)
    subject_id: str = Field(default="", max_length=160)

    @model_validator(mode="after")
    def validate_operation(self) -> ClassSwapCreate:
        if len(self.device_ids) != len(set(self.device_ids)):
            raise ValueError("device_ids must be unique")
        if self.operation == "swap" and (not self.entry_id_a or not self.entry_id_b):
            raise ValueError("swap requires entry_id_a and entry_id_b")
        if self.operation == "replace" and (not self.entry_id or not self.subject_id):
            raise ValueError("replace requires entry_id and subject_id")
        return self


class AutomationAction(BaseModel):
    type: Literal["command", "config", "schedule"]
    payload: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_action(self) -> AutomationAction:
        if self.type == "command":
            command_type = self.payload.get("command_type")
            if command_type not in {
                "refresh_status", "restart_app", "upload_diagnostics",
                "show_notification", "trigger_action", "apply_config",
                "switch_schedule",
            }:
                raise ValueError("invalid automation command_type")
            if command_type == "trigger_action":
                action_id = self.payload.get("action_id")
                if not isinstance(action_id, str) or not action_id.strip():
                    raise ValueError("trigger_action requires action_id")
                self.payload["action_id"] = action_id.strip()
        elif self.type == "config":
            policy_id = self.payload.get("policy_id")
            if not isinstance(policy_id, str) or not policy_id.strip():
                raise ValueError("config action requires policy_id")
            self.payload["policy_id"] = policy_id.strip()
        elif self.type == "schedule":
            schedule_id = self.payload.get("schedule_id")
            if not isinstance(schedule_id, str) or not schedule_id.strip():
                raise ValueError("schedule action requires schedule_id")
            self.payload["schedule_id"] = schedule_id.strip()
        return self


class AutomationRuleCreate(BaseModel):
    organization_id: str
    name: str = Field(min_length=1, max_length=120)
    enabled: bool = True
    trigger_type: Literal["daily", "weekly", "date", "online"]
    scheduled_time: time | None = None
    weekdays: list[int] = Field(default_factory=list)
    run_date: date | None = None
    condition_operator: Literal["and", "or"] = "and"
    conditions: list[dict[str, Any]] = Field(default_factory=list)
    delay_seconds: int = Field(default=0, ge=0, le=86400)
    group_id: str | None = None
    device_id: str | None = None
    action: AutomationAction

    @model_validator(mode="after")
    def validate_rule(self) -> AutomationRuleCreate:
        if bool(self.group_id) == bool(self.device_id):
            raise ValueError("exactly one of group_id or device_id is required")
        if self.trigger_type in {"daily", "weekly", "date"} and self.scheduled_time is None:
            raise ValueError("scheduled_time is required for scheduled rules")
        if self.trigger_type == "weekly" and not self.weekdays:
            raise ValueError("weekly rules require weekdays")
        if any(day < 1 or day > 7 for day in self.weekdays):
            raise ValueError("weekdays must be between 1 and 7")
        if self.trigger_type == "date" and self.run_date is None:
            raise ValueError("date rules require run_date")
        if self.trigger_type != "date" and self.run_date is not None:
            raise ValueError("run_date is only valid for date rules")
        for condition in self.conditions:
            condition_type = condition.get("type")
            if condition_type not in {"online", "status"}:
                raise ValueError("condition type must be online or status")
            if condition_type == "status" and not str(condition.get("value", "")).strip():
                raise ValueError("status condition requires value")
        return self


class AutomationRuleUpdate(AutomationRuleCreate):
    pass


class AutomationRunResponse(BaseModel):
    id: str
    device_id: str
    scheduled_for: datetime
    execute_after: datetime
    status: str
    reason: str
    command_id: str | None
    finished_at: datetime | None


class ModelResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=12, max_length=200)


class RegistrationRequest(BaseModel):
    organization_name: str = Field(min_length=1, max_length=120)
    username: str = Field(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=12, max_length=200)


class RegistrationSetting(BaseModel):
    allow_registration: bool


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=12, max_length=200)
    role: Literal["viewer", "operator", "admin"] = "viewer"
    organization_ids: set[str] = Field(default_factory=set)


class UserOrganizationAssignment(BaseModel):
    organization_ids: set[str] = Field(default_factory=set)
