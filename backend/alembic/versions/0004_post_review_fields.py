"""post review fields

管理端内容审核需要的落库字段：审核状态、驳回原因、审核人、审核时间。
管理端与小程序端共用同一个 MySQL，审核/删除后小程序端立即生效。

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-16 16:20:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMNS = {
    "review_status": sa.Column("review_status", sa.String(length=20), nullable=False, server_default=sa.text("'approved'")),
    "review_reason": sa.Column("review_reason", sa.String(length=200), nullable=False, server_default=sa.text("''")),
    "reviewed_by": sa.Column("reviewed_by", sa.BigInteger(), nullable=True),
    "reviewed_at": sa.Column("reviewed_at", mysql.DATETIME(fsp=3), nullable=True),
}


def upgrade() -> None:
    bind = op.get_bind()
    existing = {item["name"] for item in sa.inspect(bind).get_columns("posts")}
    for name, column in COLUMNS.items():
        if name not in existing:
            op.add_column("posts", column)

    # 历史数据：已下架的统一视为已驳回，其余视为已通过
    op.execute("UPDATE posts SET review_status = 'rejected' WHERE status = 'hidden'")
    op.execute("UPDATE posts SET review_status = 'pending' WHERE status = 'reviewing'")


def downgrade() -> None:
    bind = op.get_bind()
    existing = {item["name"] for item in sa.inspect(bind).get_columns("posts")}
    for name in reversed(list(COLUMNS)):
        if name in existing:
            op.drop_column("posts", name)
