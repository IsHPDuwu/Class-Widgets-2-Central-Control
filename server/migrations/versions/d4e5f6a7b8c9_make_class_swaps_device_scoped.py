"""make class swap sessions device scoped

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
"""

from collections.abc import Sequence
import json

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: str | Sequence[str] | None = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "class_swap_sessions",
        sa.Column("device_id", sa.String(length=36), nullable=True),
    )
    connection = op.get_bind()
    sessions = connection.execute(
        sa.text("SELECT id, operations FROM class_swap_sessions")
    ).mappings()
    for session in sessions:
        operations = session["operations"] or []
        if isinstance(operations, str):
            operations = json.loads(operations)
        device_id = next(
            (
                device_id
                for operation in operations
                for device_id in operation.get("device_ids", [])
                if device_id
            ),
            None,
        )
        if device_id:
            connection.execute(
                sa.text(
                    "UPDATE class_swap_sessions SET device_id = :device_id WHERE id = :id"
                ),
                {"device_id": device_id, "id": session["id"]},
            )
        else:
            connection.execute(
                sa.text("DELETE FROM class_swap_sessions WHERE id = :id"),
                {"id": session["id"]},
            )

    op.drop_index("ix_class_swap_sessions_group_id", table_name="class_swap_sessions")
    with op.batch_alter_table("class_swap_sessions") as batch_op:
        batch_op.alter_column("device_id", existing_type=sa.String(length=36), nullable=False)
        batch_op.create_foreign_key(
            "fk_class_swap_sessions_device_id_devices", "devices", ["device_id"], ["id"]
        )
        batch_op.drop_column("group_id")
    op.create_index(
        "ix_class_swap_sessions_device_id", "class_swap_sessions", ["device_id"]
    )


def downgrade() -> None:
    op.add_column(
        "class_swap_sessions",
        sa.Column("group_id", sa.String(length=36), nullable=True),
    )
    connection = op.get_bind()
    connection.execute(
        sa.text(
            "UPDATE class_swap_sessions "
            "SET group_id = (SELECT group_id FROM devices "
            "WHERE devices.id = class_swap_sessions.device_id)"
        )
    )
    with op.batch_alter_table("class_swap_sessions") as batch_op:
        batch_op.alter_column("group_id", existing_type=sa.String(length=36), nullable=False)
        batch_op.create_foreign_key(
            "fk_class_swap_sessions_group_id_device_groups",
            "device_groups",
            ["group_id"],
            ["id"],
        )
    op.create_index("ix_class_swap_sessions_group_id", "class_swap_sessions", ["group_id"])
    op.drop_index("ix_class_swap_sessions_device_id", table_name="class_swap_sessions")
    with op.batch_alter_table("class_swap_sessions") as batch_op:
        batch_op.drop_constraint(
            "fk_class_swap_sessions_device_id_devices", type_="foreignkey"
        )
        batch_op.drop_column("device_id")
