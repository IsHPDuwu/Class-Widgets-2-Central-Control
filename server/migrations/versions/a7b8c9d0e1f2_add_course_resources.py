"""add organization course resources

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a7b8c9d0e1f2"
down_revision: str | Sequence[str] | None = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "course_resources",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("organization_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("simplified_name", sa.String(length=40), nullable=False),
        sa.Column("teacher", sa.String(length=120), nullable=False),
        sa.Column("icon", sa.String(length=200), nullable=False),
        sa.Column("color", sa.String(length=20), nullable=False),
        sa.Column("location", sa.String(length=120), nullable=False),
        sa.Column("is_local_classroom", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "name"),
    )
    op.create_index("ix_course_resources_organization_id", "course_resources", ["organization_id"])


def downgrade() -> None:
    op.drop_index("ix_course_resources_organization_id", table_name="course_resources")
    op.drop_table("course_resources")