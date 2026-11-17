from datetime import datetime

from sqlalchemy import Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, datetime_ms, now_default, unsigned_bigint, unsigned_int


class UploadFile(Base):
    __tablename__ = "upload_files"
    __table_args__ = (Index("idx_user_time", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(unsigned_bigint(), primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(unsigned_bigint(), nullable=False)
    path: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str] = mapped_column(String(512), nullable=False)
    mime: Mapped[str | None] = mapped_column(String(64))
    size: Mapped[int | None] = mapped_column(unsigned_int())
    created_at: Mapped[datetime] = mapped_column(datetime_ms(), nullable=False, server_default=now_default())
