"""add oidc providers and permission grants

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: str | Sequence[str] | None = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("admin_users") as batch_op:
        batch_op.alter_column("password_hash", existing_type=sa.String(length=256), nullable=True)
        batch_op.add_column(sa.Column("display_name", sa.String(length=120), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("email", sa.String(length=320), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("authorization_status", sa.String(length=20), nullable=False, server_default="active"))
        batch_op.create_index("ix_admin_users_authorization_status", ["authorization_status"])

    op.create_table(
        "user_permission_grants",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("organization_id", sa.String(length=36), nullable=True),
        sa.Column("resource_type", sa.String(length=20), nullable=False),
        sa.Column("resource_id", sa.String(length=36), nullable=True),
        sa.Column("permission_key", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["admin_users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "organization_id", "resource_type", "resource_id", "permission_key", name="uq_user_permission_grant"),
    )
    for column in ("user_id", "organization_id", "resource_id", "permission_key"):
        op.create_index(f"ix_user_permission_grants_{column}", "user_permission_grants", [column])

    op.create_table(
        "oauth_providers",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("key", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("issuer_url", sa.String(length=500), nullable=False),
        sa.Column("client_id", sa.String(length=300), nullable=False),
        sa.Column("client_secret_encrypted", sa.Text(), nullable=False),
        sa.Column("scopes", sa.String(length=500), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("allow_signup", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_oauth_providers_key", "oauth_providers", ["key"], unique=True)
    op.create_index("ix_oauth_providers_enabled", "oauth_providers", ["enabled"])

    op.create_table(
        "oauth_identities",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("provider_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("issuer", sa.String(length=500), nullable=False),
        sa.Column("subject", sa.String(length=500), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["provider_id"], ["oauth_providers.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["admin_users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider_id", "subject"),
    )
    op.create_index("ix_oauth_identities_provider_id", "oauth_identities", ["provider_id"])
    op.create_index("ix_oauth_identities_user_id", "oauth_identities", ["user_id"])

    op.create_table(
        "oauth_login_attempts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("provider_id", sa.String(length=36), nullable=False),
        sa.Column("state_hash", sa.String(length=64), nullable=False),
        sa.Column("nonce", sa.String(length=160), nullable=False),
        sa.Column("code_verifier_encrypted", sa.Text(), nullable=False),
        sa.Column("return_path", sa.String(length=300), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["provider_id"], ["oauth_providers.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_oauth_login_attempts_provider_id", "oauth_login_attempts", ["provider_id"])
    op.create_index("ix_oauth_login_attempts_state_hash", "oauth_login_attempts", ["state_hash"], unique=True)
    op.create_index("ix_oauth_login_attempts_expires_at", "oauth_login_attempts", ["expires_at"])

    op.create_table(
        "oauth_exchange_codes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("session_token_encrypted", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_oauth_exchange_codes_code_hash", "oauth_exchange_codes", ["code_hash"], unique=True)
    op.create_index("ix_oauth_exchange_codes_expires_at", "oauth_exchange_codes", ["expires_at"])


def downgrade() -> None:
    op.drop_table("oauth_exchange_codes")
    op.drop_table("oauth_login_attempts")
    op.drop_table("oauth_identities")
    op.drop_table("oauth_providers")
    op.drop_table("user_permission_grants")
    with op.batch_alter_table("admin_users") as batch_op:
        batch_op.drop_index("ix_admin_users_authorization_status")
        batch_op.drop_column("authorization_status")
        batch_op.drop_column("email")
        batch_op.drop_column("display_name")
        batch_op.alter_column("password_hash", existing_type=sa.String(length=256), nullable=False)
