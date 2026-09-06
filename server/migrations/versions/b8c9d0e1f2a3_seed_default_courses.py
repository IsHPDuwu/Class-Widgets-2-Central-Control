"""seed built-in course resources for existing organizations

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from uuid import uuid4

revision: str = "b8c9d0e1f2a3"
down_revision: str | Sequence[str] | None = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None

_DEFAULT_COURSES = (
    ("chinese", "语文", "语", "ic_fluent_book_20_regular", "#FF5722", True),
    ("math", "数学", "数", "ic_fluent_ruler_20_regular", "#3F51B5", True),
    ("english", "英语", "英", "ic_fluent_text_list_abc_uppercase_ltr_20_filled", "#2196F3", True),
    ("politics", "政治", "政", "ic_fluent_book_globe_20_regular", "#9C27B0", True),
    ("history", "历史", "史", "ic_fluent_clock_20_regular", "#795548", True),
    ("physics", "物理", "物", "ic_fluent_lightbulb_filament_20_regular", "#00BCD4", True),
    ("chemistry", "化学", "化", "ic_fluent_hexagon_three_20_regular", "#4CAF50", True),
    ("biology", "生物", "生", "ic_fluent_leaf_three_20_regular", "#8BC34A", True),
    ("geography", "地理", "地", "ic_fluent_earth_20_regular", "#009688", True),
    ("music", "音乐", "音", "ic_fluent_music_note_2_20_regular", "#E91E63", True),
    ("art", "美术", "美", "ic_fluent_draw_shape_20_regular", "#F44336", True),
    ("psychology", "心理", "心", "ic_fluent_brain_sparkle_20_regular", "#FF9800", True),
    ("pe", "体育", "体", "ic_fluent_person_running_20_regular", "#CDDC39", False),
    ("it", "信息技术", "信", "ic_fluent_laptop_20_regular", "#607D8B", True),
    ("generaltech", "通用技术", "通", "ic_fluent_wrench_settings_20_regular", "#FF9800", True),
    ("elective", "选修", "选", "ic_fluent_sign_out_20_regular", "#9E9E9E", False),
    ("selfstudy", "自学", "自", "ic_fluent_notebook_20_regular", "#607D8B", True),
    ("club", "社团", "社", "ic_fluent_people_team_20_regular", "#673AB7", True),
    ("classmeeting", "班会", "班", "ic_fluent_chat_20_regular", "#3F51B5", True),
    ("weeklytest", "周测", "测", "ic_fluent_clipboard_20_regular", "#FF5722", True),
)


def upgrade() -> None:
    bind = op.get_bind()
    organizations = sa.Table("organizations", sa.MetaData(), sa.Column("id", sa.String(length=36)))
    courses = sa.Table(
        "course_resources",
        sa.MetaData(),
        sa.Column("id", sa.String(length=36)),
        sa.Column("organization_id", sa.String(length=36)),
        sa.Column("name", sa.String(length=120)),
        sa.Column("simplified_name", sa.String(length=40)),
        sa.Column("teacher", sa.String(length=120)),
        sa.Column("icon", sa.String(length=200)),
        sa.Column("color", sa.String(length=20)),
        sa.Column("location", sa.String(length=120)),
        sa.Column("is_local_classroom", sa.Boolean()),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    now = sa.func.now()
    organization_ids = [row[0] for row in bind.execute(sa.select(organizations.c.id))]
    for organization_id in organization_ids:
        existing = {row[0] for row in bind.execute(sa.select(courses.c.id).where(courses.c.organization_id == organization_id))}
        rows = [
            {
                "id": str(uuid4()),
                "organization_id": organization_id,
                "name": name,
                "simplified_name": simplified_name,
                "teacher": "",
                "icon": icon,
                "color": color,
                "location": "",
                "is_local_classroom": local,
                "created_at": now,
                "updated_at": now,
            }
            for course_id, name, simplified_name, icon, color, local in _DEFAULT_COURSES
            if course_id not in existing
        ]
        if rows:
            bind.execute(courses.insert(), rows)


def downgrade() -> None:
    bind = op.get_bind()
    names = tuple(item[1] for item in _DEFAULT_COURSES)
    bind.execute(sa.delete(sa.table("course_resources", sa.column("name")).where(sa.column("name").in_(names))))
