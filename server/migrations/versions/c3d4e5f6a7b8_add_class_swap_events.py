"""add client schedule snapshots and class swap sessions

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: str | Sequence[str] | None = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "device_schedule_snapshots",
        sa.Column("device_id", sa.String(length=36), nullable=False),
        sa.Column("request_id", sa.String(length=36), nullable=False),
        sa.Column("schedule_hash", sa.String(length=64), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"]),
        sa.PrimaryKeyConstraint("device_id"),
    )
    op.create_index(
        "ix_device_schedule_snapshots_request_id",
        "device_schedule_snapshots",
        ["request_id"],
    )
    op.create_table(
        "class_swap_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("organization_id", sa.String(length=36), nullable=False),
        sa.Column("group_id", sa.String(length=36), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("operations", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("restored_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["group_id"], ["device_groups.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_class_swap_sessions_organization_id", "class_swap_sessions", ["organization_id"])
    op.create_index("ix_class_swap_sessions_group_id", "class_swap_sessions", ["group_id"])
    op.create_index("ix_class_swap_sessions_effective_date", "class_swap_sessions", ["effective_date"])
    op.create_index("ix_class_swap_sessions_status", "class_swap_sessions", ["status"])


def downgrade() -> None:
    op.drop_index("ix_class_swap_sessions_status", table_name="class_swap_sessions")
    op.drop_index("ix_class_swap_sessions_effective_date", table_name="class_swap_sessions")
    op.drop_index("ix_class_swap_sessions_group_id", table_name="class_swap_sessions")
    op.drop_index("ix_class_swap_sessions_organization_id", table_name="class_swap_sessions")
    op.drop_table("class_swap_sessions")
    op.drop_index("ix_device_schedule_snapshots_request_id", table_name="device_schedule_snapshots")
    op.drop_table("device_schedule_snapshots")