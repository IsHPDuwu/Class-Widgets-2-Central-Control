from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, select
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utc_now() -> datetime:
    return datetime.now(UTC)


def utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def new_id() -> str:
    return str(uuid4())


# 与桌面端 src/core/utils/subjects.py 保持一致。课程资源主键由数据库生成，
# 因为同一课程会存在于多个组织中。
DEFAULT_COURSES: tuple[dict[str, Any], ...] = (
    {"id": "chinese", "name": "语文", "simplified_name": "语", "icon": "ic_fluent_book_20_regular", "color": "#FF5722", "is_local_classroom": True},
    {"id": "math", "name": "数学", "simplified_name": "数", "icon": "ic_fluent_ruler_20_regular", "color": "#3F51B5", "is_local_classroom": True},
    {"id": "english", "name": "英语", "simplified_name": "英", "icon": "ic_fluent_text_list_abc_uppercase_ltr_20_filled", "color": "#2196F3", "is_local_classroom": True},
    {"id": "politics", "name": "政治", "simplified_name": "政", "icon": "ic_fluent_book_globe_20_regular", "color": "#9C27B0", "is_local_classroom": True},
    {"id": "history", "name": "历史", "simplified_name": "史", "icon": "ic_fluent_clock_20_regular", "color": "#795548", "is_local_classroom": True},
    {"id": "physics", "name": "物理", "simplified_name": "物", "icon": "ic_fluent_lightbulb_filament_20_regular", "color": "#00BCD4", "is_local_classroom": True},
    {"id": "chemistry", "name": "化学", "simplified_name": "化", "icon": "ic_fluent_hexagon_three_20_regular", "color": "#4CAF50", "is_local_classroom": True},
    {"id": "biology", "name": "生物", "simplified_name": "生", "icon": "ic_fluent_leaf_three_20_regular", "color": "#8BC34A", "is_local_classroom": True},
    {"id": "geography", "name": "地理", "simplified_name": "地", "icon": "ic_fluent_earth_20_regular", "color": "#009688", "is_local_classroom": True},
    {"id": "music", "name": "音乐", "simplified_name": "音", "icon": "ic_fluent_music_note_2_20_regular", "color": "#E91E63", "is_local_classroom": True},
    {"id": "art", "name": "美术", "simplified_name": "美", "icon": "ic_fluent_draw_shape_20_regular", "color": "#F44336", "is_local_classroom": True},
    {"id": "psychology", "name": "心理", "simplified_name": "心", "icon": "ic_fluent_brain_sparkle_20_regular", "color": "#FF9800", "is_local_classroom": True},
    {"id": "pe", "name": "体育", "simplified_name": "体", "icon": "ic_fluent_person_running_20_regular", "color": "#CDDC39", "is_local_classroom": False},
    {"id": "it", "name": "信息技术", "simplified_name": "信", "icon": "ic_fluent_laptop_20_regular", "color": "#607D8B", "is_local_classroom": True},
    {"id": "generaltech", "name": "通用技术", "simplified_name": "通", "icon": "ic_fluent_wrench_settings_20_regular", "color": "#FF9800", "is_local_classroom": True},
    {"id": "elective", "name": "选修", "simplified_name": "选", "icon": "ic_fluent_sign_out_20_regular", "color": "#9E9E9E", "is_local_classroom": False},
    {"id": "selfstudy", "name": "自学", "simplified_name": "自", "icon": "ic_fluent_notebook_20_regular", "color": "#607D8B", "is_local_classroom": True},
    {"id": "club", "name": "社团", "simplified_name": "社", "icon": "ic_fluent_people_team_20_regular", "color": "#673AB7", "is_local_classroom": True},
    {"id": "classmeeting", "name": "班会", "simplified_name": "班", "icon": "ic_fluent_chat_20_regular", "color": "#3F51B5", "is_local_classroom": True},
    {"id": "weeklytest", "name": "周测", "simplified_name": "测", "icon": "ic_fluent_clipboard_20_regular", "color": "#FF5722", "is_local_classroom": True},
)


def seed_default_courses(db: Any, organization_id: str) -> None:
    """幂等补齐一个组织的内置课程。调用方负责最终 commit。"""
    existing = {name for name in db.scalars(select(CourseResource.name).where(CourseResource.organization_id == organization_id)).all()}
    for course in DEFAULT_COURSES:
        if course["name"] in existing:
            continue
        db.add(CourseResource(organization_id=organization_id, **{key: value for key, value in course.items() if key != "id"}))


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    groups: Mapped[list[DeviceGroup]] = relationship(back_populates="organization")
    memberships: Mapped[list[OrganizationMembership]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )


class DeviceGroup(Base):
    __tablename__ = "device_groups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    schedule_revision_id: Mapped[str | None] = mapped_column(
        ForeignKey("schedule_revisions.id"), nullable=True
    )
    policy_revision_id: Mapped[str | None] = mapped_column(
        ForeignKey("policy_revisions.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    organization: Mapped[Organization] = relationship(back_populates="groups")
    devices: Mapped[list[Device]] = relationship(back_populates="group")
    schedule_revision: Mapped[ScheduleRevision | None] = relationship(
        foreign_keys=[schedule_revision_id]
    )
    policy_revision: Mapped[PolicyRevision | None] = relationship(
        foreign_keys=[policy_revision_id]
    )

    __table_args__ = (UniqueConstraint("organization_id", "name"),)


class ClassGroup(Base):
    """仅用于管理端批量选择班级，不影响设备、课表或策略下发逻辑。"""

    __tablename__ = "class_groups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    members: Mapped[list[ClassGroupMember]] = relationship(cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("organization_id", "name"),)


class ClassGroupMember(Base):
    __tablename__ = "class_group_members"

    class_group_id: Mapped[str] = mapped_column(ForeignKey("class_groups.id", ondelete="CASCADE"), primary_key=True)
    device_group_id: Mapped[str] = mapped_column(ForeignKey("device_groups.id", ondelete="CASCADE"), primary_key=True)


class PairingCode(Base):
    __tablename__ = "pairing_codes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    group_id: Mapped[str] = mapped_column(ForeignKey("device_groups.id"), index=True)
    code_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    group_id: Mapped[str] = mapped_column(ForeignKey("device_groups.id"), index=True)
    installation_id: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    app_version: Mapped[str] = mapped_column(String(40), default="")
    plugin_version: Mapped[str] = mapped_column(String(40), default="")
    platform: Mapped[str] = mapped_column(String(80), default="")
    current_status: Mapped[str] = mapped_column(String(40), default="unknown")
    current_title: Mapped[str] = mapped_column(String(200), default="")
    schedule_revision: Mapped[int] = mapped_column(Integer, default=0)
    policy_revision: Mapped[int] = mapped_column(Integer, default=0)
    last_cursor: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str] = mapped_column(Text, default="")
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    online_session_id: Mapped[str] = mapped_column(String(36), default=new_id)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    group: Mapped[DeviceGroup] = relationship(back_populates="devices")
    acknowledgements: Mapped[list[CommandAcknowledgement]] = relationship(back_populates="device")
    schedule_snapshot: Mapped[DeviceScheduleSnapshot | None] = relationship(
        back_populates="device", cascade="all, delete-orphan", uselist=False
    )


class DeviceScheduleSnapshot(Base):
    __tablename__ = "device_schedule_snapshots"

    device_id: Mapped[str] = mapped_column(
        ForeignKey("devices.id"), primary_key=True
    )
    request_id: Mapped[str] = mapped_column(String(36), index=True)
    schedule_hash: Mapped[str] = mapped_column(String(64))
    data: Mapped[dict[str, Any]] = mapped_column(JSON)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    device: Mapped[Device] = relationship(back_populates="schedule_snapshot")


class ClassSwapSession(Base):
    __tablename__ = "class_swap_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id"), index=True)
    effective_date: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    operations: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    restored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AutomationRule(Base):
    __tablename__ = "automation_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    trigger_type: Mapped[str] = mapped_column(String(20))
    scheduled_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    weekdays: Mapped[list[int]] = mapped_column(JSON, default=list)
    run_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    condition_operator: Mapped[str] = mapped_column(String(3), default="and")
    conditions: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    condition_type: Mapped[str] = mapped_column(String(20), default="always")
    condition_value: Mapped[str] = mapped_column(String(80), default="")
    delay_seconds: Mapped[int] = mapped_column(Integer, default=0)
    group_id: Mapped[str | None] = mapped_column(ForeignKey("device_groups.id"), nullable=True)
    device_id: Mapped[str | None] = mapped_column(ForeignKey("devices.id"), nullable=True)
    action_type: Mapped[str] = mapped_column(String(20))
    action_payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AutomationRun(Base):
    __tablename__ = "automation_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    rule_id: Mapped[str] = mapped_column(ForeignKey("automation_rules.id"), index=True)
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id"), index=True)
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    session_key: Mapped[str] = mapped_column(String(120), default="")
    execute_after: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    reason: Mapped[str] = mapped_column(String(500), default="")
    command_id: Mapped[str | None] = mapped_column(ForeignKey("commands.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (UniqueConstraint("rule_id", "device_id", "session_key"),)


class ScheduleRevision(Base):
    __tablename__ = "schedule_revisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(120))
    data: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    __table_args__ = (UniqueConstraint("organization_id", "revision"),)


class TimelineResource(Base):
    """组织级可复用时间线；时间段只描述时间，不绑定课程。"""

    __tablename__ = "timeline_resources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    data: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    __table_args__ = (UniqueConstraint("organization_id", "name"),)


class CourseResource(Base):
    """组织级课表课程配置；课表只在排课引用课程时下发它。"""

    __tablename__ = "course_resources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    simplified_name: Mapped[str] = mapped_column(String(40), default="")
    teacher: Mapped[str] = mapped_column(String(120), default="")
    icon: Mapped[str] = mapped_column(String(200), default="")
    color: Mapped[str] = mapped_column(String(20), default="")
    location: Mapped[str] = mapped_column(String(120), default="")
    is_local_classroom: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    __table_args__ = (UniqueConstraint("organization_id", "name"),)


class PolicyRevision(Base):
    __tablename__ = "policy_revisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(120), default="未命名配置")
    data: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    __table_args__ = (UniqueConstraint("organization_id", "revision"),)


class Command(Base):
    __tablename__ = "commands"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    cursor: Mapped[int] = mapped_column(Integer, unique=True, index=True, autoincrement=True)
    group_id: Mapped[str | None] = mapped_column(ForeignKey("device_groups.id"), nullable=True)
    device_id: Mapped[str | None] = mapped_column(ForeignKey("devices.id"), nullable=True)
    type: Mapped[str] = mapped_column(String(40))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    rollout_percentage: Mapped[int] = mapped_column(Integer, default=100)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class CommandAcknowledgement(Base):
    __tablename__ = "command_acknowledgements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    command_id: Mapped[str] = mapped_column(ForeignKey("commands.id"), index=True)
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id"), index=True)
    status: Mapped[str] = mapped_column(String(20))
    error_code: Mapped[str] = mapped_column(String(80), default="")
    message: Mapped[str] = mapped_column(String(500), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    device: Mapped[Device] = relationship(back_populates="acknowledgements")

    __table_args__ = (UniqueConstraint("command_id", "device_id"),)


class DiagnosticReport(Base):
    __tablename__ = "diagnostic_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id"), index=True)
    app_version: Mapped[str] = mapped_column(String(40), default="")
    plugin_version: Mapped[str] = mapped_column(String(40), default="")
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AdminUser(Base):
    __tablename__ = "admin_users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(256), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="viewer")
    display_name: Mapped[str] = mapped_column(String(120), default="")
    email: Mapped[str] = mapped_column(String(320), default="")
    authorization_status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    disabled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    memberships: Mapped[list[OrganizationMembership]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    permission_grants: Mapped[list[UserPermissionGrant]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    oauth_identities: Mapped[list[OAuthIdentity]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class OrganizationMembership(Base):
    __tablename__ = "organization_memberships"

    user_id: Mapped[str] = mapped_column(ForeignKey("admin_users.id"), primary_key=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    user: Mapped[AdminUser] = relationship(back_populates="memberships")
    organization: Mapped[Organization] = relationship(back_populates="memberships")


class AdminSession(Base):
    __tablename__ = "admin_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("admin_users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class UserPermissionGrant(Base):
    __tablename__ = "user_permission_grants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("admin_users.id"), index=True)
    organization_id: Mapped[str | None] = mapped_column(
        ForeignKey("organizations.id"), nullable=True, index=True
    )
    resource_type: Mapped[str] = mapped_column(String(20), default="organization")
    resource_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    permission_key: Mapped[str] = mapped_column(String(100), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    user: Mapped[AdminUser] = relationship(back_populates="permission_grants")

    __table_args__ = (
        UniqueConstraint(
            "user_id", "organization_id", "resource_type", "resource_id", "permission_key",
            name="uq_user_permission_grant",
        ),
    )


class OAuthProvider(Base):
    __tablename__ = "oauth_providers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    key: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    issuer_url: Mapped[str] = mapped_column(String(500))
    client_id: Mapped[str] = mapped_column(String(300))
    client_secret_encrypted: Mapped[str] = mapped_column(Text)
    scopes: Mapped[str] = mapped_column(String(500), default="openid profile email")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    allow_signup: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    identities: Mapped[list[OAuthIdentity]] = relationship(back_populates="provider")


class OAuthIdentity(Base):
    __tablename__ = "oauth_identities"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    provider_id: Mapped[str] = mapped_column(ForeignKey("oauth_providers.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("admin_users.id"), index=True)
    issuer: Mapped[str] = mapped_column(String(500))
    subject: Mapped[str] = mapped_column(String(500))
    email: Mapped[str] = mapped_column(String(320), default="")
    display_name: Mapped[str] = mapped_column(String(120), default="")
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    provider: Mapped[OAuthProvider] = relationship(back_populates="identities")
    user: Mapped[AdminUser] = relationship(back_populates="oauth_identities")

    __table_args__ = (UniqueConstraint("provider_id", "subject"),)


class OAuthLoginAttempt(Base):
    __tablename__ = "oauth_login_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    provider_id: Mapped[str] = mapped_column(ForeignKey("oauth_providers.id"), index=True)
    state_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    nonce: Mapped[str] = mapped_column(String(160))
    code_verifier_encrypted: Mapped[str] = mapped_column(Text)
    return_path: Mapped[str] = mapped_column(String(300), default="/")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class OAuthExchangeCode(Base):
    __tablename__ = "oauth_exchange_codes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    code_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    session_token_encrypted: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    actor: Mapped[str] = mapped_column(String(120), index=True)
    action: Mapped[str] = mapped_column(String(40))
    resource: Mapped[str] = mapped_column(String(240))
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
