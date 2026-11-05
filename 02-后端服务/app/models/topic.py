from datetime import datetime

from sqlalchemy import Index, Integer, String, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, datetime_ms, now_default, tiny_bool, unsigned_bigint, unsigned_int


class Topic(Base):
    __tablename__ = "topics"
    __table_args__ = (
        UniqueConstraint("name", name="uk_name"),
        Index("idx_hot", "is_hot", "sort"),
    )

    id: Mapped[int] = mapped_column(unsigned_bigint(), primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[str | None] = mapped_column(String(120))
    post_count: Mapped[int] = mapped_column(unsigned_int(), nullable=False, server_default=text("0"))
    user_count: Mapped[int] = mapped_column(unsigned_int(), nullable=False, server_default=text("0"))
    is_hot: Mapped[int] = mapped_column(tiny_bool(), nullable=False, server_default=text("0"))
    sort: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(datetime_ms(), nullable=False, server_default=now_default())
    updated_at: Mapped[datetime] = mapped_column(
        datetime_ms(), nullable=False, server_default=now_default(), onupdate=func.now()
    )


class PostTopic(Base):
    __tablename__ = "post_topics"
    __table_args__ = (
        UniqueConstraint("post_id", "topic_id", name="uk_post_topic"),
        Index("idx_topic", "topic_id"),
    )

    id: Mapped[int] = mapped_column(unsigned_bigint(), primary_key=True, autoincrement=True)
    post_id: Mapped[int] = mapped_column(unsigned_bigint(), nullable=False)
    topic_id: Mapped[int] = mapped_column(unsigned_bigint(), nullable=False)
