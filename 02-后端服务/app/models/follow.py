from datetime import datetime

from sqlalchemy import Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, datetime_ms, now_default, unsigned_bigint


class Follow(Base):
    __tablename__ = "follows"
    __table_args__ = (
        UniqueConstraint("follower_id", "followee_id", name="uk_follow"),
        Index("idx_followee", "followee_id"),
    )

    id: Mapped[int] = mapped_column(unsigned_bigint(), primary_key=True, autoincrement=True)
    follower_id: Mapped[int] = mapped_column(unsigned_bigint(), nullable=False)
    followee_id: Mapped[int] = mapped_column(unsigned_bigint(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(datetime_ms(), nullable=False, server_default=now_default())
