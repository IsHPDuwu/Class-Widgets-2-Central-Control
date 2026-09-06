"""add class groups

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c9d0e1f2a3b4"
down_revision: str | Sequence[str] | None = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "class_groups",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("organization_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "name"),
    )
    op.create_index("ix_class_groups_organization_id", "class_groups", ["organization_id"])
    op.create_table(
        "class_group_members",
        sa.Column("class_group_id", sa.String(length=36), nullable=False),
        sa.Column("device_group_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["class_group_id"], ["class_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["device_group_id"], ["device_groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("class_group_id", "device_group_id"),
    )


def downgrade() -> None:
    op.drop_table("class_group_members")
    op.drop_index("ix_class_groups_organization_id", table_name="class_groups")
    op.drop_table("class_groups")
