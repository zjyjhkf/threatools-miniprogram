from datetime import datetime

from sqlalchemy import Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, datetime_ms, now_default, unsigned_bigint


class Like(Base):
    __tablename__ = "likes"
    __table_args__ = (
        UniqueConstraint("user_id", "target_type", "target_id", name="uk_user_target"),
        Index("idx_target", "target_type", "target_id"),
    )

    id: Mapped[int] = mapped_column(unsigned_bigint(), primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(unsigned_bigint(), nullable=False)
    target_type: Mapped[str] = mapped_column(String(10), nullable=False)
    target_id: Mapped[int] = mapped_column(unsigned_bigint(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(datetime_ms(), nullable=False, server_default=now_default())
