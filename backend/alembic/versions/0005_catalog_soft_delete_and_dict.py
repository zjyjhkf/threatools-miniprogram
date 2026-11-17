"""catalog soft delete + dict items

1. products / courses 增加 deleted 软删标记，支持"先下架再删除"。
2. 新增 dict_items 表，把产品分类、课程分类、难度、标签候选从代码常量搬到可维护的数据表。
3. courses 增加 tags，供后台编辑标签并做联想。

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-16 18:05:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEFAULT_ITEMS: list[tuple[str, str, str, int]] = [
    ("product_category", "rehab", "运动康复", 10),
    ("product_category", "recovery", "运动恢复", 20),
    ("product_category", "portable", "便携设备", 30),
    ("course_category", "rehab", "康复训练", 10),
    ("course_category", "recovery", "放松恢复", 20),
    ("course_category", "posture", "体态改善", 30),
    ("course_category", "stretch", "拉伸舒展", 40),
    ("difficulty", "beginner", "入门", 10),
    ("difficulty", "middle", "进阶", 20),
    ("difficulty", "advanced", "高阶", 30),
    ("product_tag", "按摩放松", "按摩放松", 10),
    ("product_tag", "筋膜放松", "筋膜放松", 20),
    ("product_tag", "便携", "便携", 30),
    ("course_tag", "晨间", "晨间", 10),
    ("course_tag", "睡前", "睡前", 20),
    ("course_tag", "办公室", "办公室", 30),
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    product_cols = {item["name"] for item in inspector.get_columns("products")}
    if "deleted" not in product_cols:
        op.add_column(
            "products",
            sa.Column("deleted", mysql.SMALLINT(unsigned=True), nullable=False, server_default=sa.text("0")),
        )

    course_cols = {item["name"] for item in inspector.get_columns("courses")}
    if "deleted" not in course_cols:
        op.add_column(
            "courses",
            sa.Column("deleted", mysql.SMALLINT(unsigned=True), nullable=False, server_default=sa.text("0")),
        )
    if "tags" not in course_cols:
        op.add_column("courses", sa.Column("tags", mysql.JSON(), nullable=True))

    if "dict_items" not in inspector.get_table_names():
        op.create_table(
            "dict_items",
            sa.Column("id", mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
            sa.Column("group_key", sa.String(length=32), nullable=False),
            sa.Column("value", sa.String(length=40), nullable=False),
            sa.Column("label", sa.String(length=60), nullable=False, server_default=sa.text("''")),
            sa.Column("sort", sa.SmallInteger(), nullable=False, server_default=sa.text("0")),
            sa.Column("status", mysql.SMALLINT(unsigned=True), nullable=False, server_default=sa.text("1")),
            sa.Column(
                "created_at", mysql.DATETIME(fsp=3), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP(3)")
            ),
            sa.Column(
                "updated_at",
                mysql.DATETIME(fsp=3),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)"),
            ),
            sa.UniqueConstraint("group_key", "value", name="uk_group_value"),
            sa.Index("idx_group_sort", "group_key", "sort"),
        )
        op.get_bind().execute(
            sa.text(
                "INSERT INTO dict_items (group_key, value, label, sort, status) "
                "VALUES (:group_key, :value, :label, :sort, 1)"
            ),
            [
                {"group_key": group, "value": value, "label": label, "sort": sort}
                for group, value, label, sort in DEFAULT_ITEMS
            ],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "dict_items" in tables:
        op.drop_table("dict_items")
    if "tags" in {item["name"] for item in inspector.get_columns("courses")}:
        op.drop_column("courses", "tags")
    if "deleted" in {item["name"] for item in inspector.get_columns("courses")}:
        op.drop_column("courses", "deleted")
    if "deleted" in {item["name"] for item in inspector.get_columns("products")}:
        op.drop_column("products", "deleted")
