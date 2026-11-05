from datetime import datetime

from sqlalchemy import Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, datetime_ms, now_default, unsigned_bigint, unsigned_int


class Comment(Base):
    __tablename__ = "comments"
    __table_args__ = (
        Index("idx_post", "post_id", "created_at"),
        Index("idx_parent", "parent_id"),
        Index("idx_user", "user_id"),
    )

    id: Mapped[int] = mapped_column(unsigned_bigint(), primary_key=True, autoincrement=True)
    post_id: Mapped[int] = mapped_column(unsigned_bigint(), nullable=False)
    user_id: Mapped[int] = mapped_column(unsigned_bigint(), nullable=False)
    parent_id: Mapped[int] = mapped_column(unsigned_bigint(), nullable=False, server_default=text("0"))
    reply_to_user_id: Mapped[int | None] = mapped_column(unsigned_bigint())
    content: Mapped[str] = mapped_column(String(400), nullable=False)
    like_count: Mapped[int] = mapped_column(unsigned_int(), nullable=False, server_default=text("0"))
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'normal'"))
    created_at: Mapped[datetime] = mapped_column(datetime_ms(), nullable=False, server_default=now_default())
