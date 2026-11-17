from datetime import datetime

from sqlalchemy import Index, SmallInteger, String, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, datetime_ms, now_default, unsigned_bigint, unsigned_tinyint


class DictItem(Base):
    """可维护的筛选条目（产品分类、课程分类、难度、标签候选）。

    管理端可增删改排序，小程序端筛选条件与后台表单下拉都从这里取，
    避免"分类写死在代码里、后台改不了"。
    """

    __tablename__ = "dict_items"
    __table_args__ = (
        UniqueConstraint("group_key", "value", name="uk_group_value"),
        Index("idx_group_sort", "group_key", "sort"),
    )

    id: Mapped[int] = mapped_column(unsigned_bigint(), primary_key=True, autoincrement=True)
    group_key: Mapped[str] = mapped_column(String(32), nullable=False)
    value: Mapped[str] = mapped_column(String(40), nullable=False)
    label: Mapped[str] = mapped_column(String(60), nullable=False, server_default=text("''"))
    sort: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default=text("0"))
    status: Mapped[int] = mapped_column(unsigned_tinyint(), nullable=False, server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(datetime_ms(), nullable=False, server_default=now_default())
    updated_at: Mapped[datetime] = mapped_column(
        datetime_ms(), nullable=False, server_default=now_default(), onupdate=func.now()
    )
