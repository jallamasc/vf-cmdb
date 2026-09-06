"""Phase 5 Task 27: sections table + Rack.section_id

Requirement 22 — an optional Section level within a Room. A Section always
belongs to exactly one Room (room_id NOT NULL); a Rack may belong to a
Floor, a Room, or a Section directly, but at most one of the three
(enforced at the app layer, crud._validate_rack).

Idempotent / guarded, following the style of 0005-0019.

Revision ID: 0020_sections
Revises: 0019_room_blueprints
Create Date: 2026-09-06
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0020_sections"
down_revision = "0019_room_blueprints"
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if not _has_table("sections"):
        op.create_table(
            "sections",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("name", sa.String(128), nullable=False),
            sa.Column("code", sa.String(16), nullable=True),
            sa.Column("room_id", sa.Integer, sa.ForeignKey("rooms.id"), nullable=False),
            sa.Column("theme_name", sa.String(120), nullable=True),
            sa.Column("theme_category", sa.String(40), nullable=True),
            sa.Column(
                "case_enforcement",
                sa.String(length=20),
                nullable=False,
                server_default="mixed",
            ),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("blueprint_url", sa.String(500), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.CheckConstraint(
                "code IS NULL OR code ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'",
                name="ck_sections_code_charset",
            ),
            sa.CheckConstraint(
                "case_enforcement IN ('uppercase', 'lowercase', 'mixed')",
                name="ck_sections_case_enforcement",
            ),
        )
    if not _has_column("racks", "section_id"):
        op.add_column(
            "racks", sa.Column("section_id", sa.Integer, sa.ForeignKey("sections.id"), nullable=True)
        )


def downgrade() -> None:
    if _has_column("racks", "section_id"):
        op.drop_column("racks", "section_id")
    if _has_table("sections"):
        op.drop_table("sections")
