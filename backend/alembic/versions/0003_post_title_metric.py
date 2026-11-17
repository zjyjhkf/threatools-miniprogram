"""post title and metric

1.0 设计变更：posts 增 title / metric（ADR-014），老数据标题回填 content 前 24 字。

Revision ID: 0003
Revises: 07240616aee3
Create Date: 2026-11-05 10:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "07240616aee3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("title", sa.String(length=80), nullable=True))
    op.add_column("posts", sa.Column("metric", sa.JSON(), nullable=True))
    # 老数据回填：标题取正文前 24 字，便于 D01 立刻有标题可显示
    op.execute("UPDATE posts SET title = LEFT(content, 24) WHERE title IS NULL AND content <> ''")


def downgrade() -> None:
    op.drop_column("posts", "metric")
    op.drop_column("posts", "title")
