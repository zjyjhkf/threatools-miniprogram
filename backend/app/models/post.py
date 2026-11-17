from datetime import datetime

from sqlalchemy import JSON, Index, SmallInteger, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, datetime_ms, now_default, tiny_bool, unsigned_bigint, unsigned_int, unsigned_tinyint


class Post(Base):
    __tablename__ = "posts"
    __table_args__ = (
        Index("idx_status_created", "status", "created_at"),
        Index("idx_user", "user_id", "created_at"),
        Index("idx_topic", "topic_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(unsigned_bigint(), primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(unsigned_bigint(), nullable=False)
    content: Mapped[str] = mapped_column(String(1000), nullable=False, server_default=text("''"))
    title: Mapped[str | None] = mapped_column(String(80))
    metric: Mapped[dict | None] = mapped_column(JSON)
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'public'"))
    cover_image: Mapped[str | None] = mapped_column(String(512))
    image_count: Mapped[int] = mapped_column(unsigned_tinyint(), nullable=False, server_default=text("0"))
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'published'"))
    review_status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'approved'"))
    review_reason: Mapped[str] = mapped_column(String(200), nullable=False, server_default=text("''"))
    reviewed_by: Mapped[int | None] = mapped_column(unsigned_bigint())
    reviewed_at: Mapped[datetime | None] = mapped_column(datetime_ms())
    topic_id: Mapped[int | None] = mapped_column(unsigned_bigint())
    like_count: Mapped[int] = mapped_column(unsigned_int(), nullable=False, server_default=text("0"))
    comment_count: Mapped[int] = mapped_column(unsigned_int(), nullable=False, server_default=text("0"))
    collect_count: Mapped[int] = mapped_column(unsigned_int(), nullable=False, server_default=text("0"))
    deleted: Mapped[int] = mapped_column(tiny_bool(), nullable=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(datetime_ms(), nullable=False, server_default=now_default())
    updated_at: Mapped[datetime] = mapped_column(
        datetime_ms(), nullable=False, server_default=now_default(), onupdate=func.now()
    )


class PostImage(Base):
    __tablename__ = "post_images"
    __table_args__ = (Index("idx_post", "post_id", "sort"),)

    id: Mapped[int] = mapped_column(unsigned_bigint(), primary_key=True, autoincrement=True)
    post_id: Mapped[int] = mapped_column(unsigned_bigint(), nullable=False)
    url: Mapped[str] = mapped_column(String(512), nullable=False)
    width: Mapped[int | None] = mapped_column(SmallInteger)
    height: Mapped[int | None] = mapped_column(SmallInteger)
    sort: Mapped[int] = mapped_column(unsigned_tinyint(), nullable=False, server_default=text("0"))
