from datetime import date, datetime

from sqlalchemy import Date, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, datetime_ms, now_default, tiny_bool, unsigned_bigint


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(unsigned_bigint(), primary_key=True, autoincrement=True)
    open_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    union_id: Mapped[str | None] = mapped_column(String(64))
    nickname: Mapped[str | None] = mapped_column(String(32))
    avatar: Mapped[str | None] = mapped_column(String(512))
    gender: Mapped[str] = mapped_column(String(10), nullable=False, server_default=text("'secret'"))
    birthday: Mapped[date | None] = mapped_column(Date)
    city: Mapped[str | None] = mapped_column(String(64))
    bio: Mapped[str | None] = mapped_column(String(100))
    wechat_id: Mapped[str | None] = mapped_column(String(64))
    profile_visibility: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'self'")
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'user'"))
    status: Mapped[int] = mapped_column(tiny_bool(), nullable=False, server_default=text("1"))
    last_login_at: Mapped[datetime | None] = mapped_column(datetime_ms())
    created_at: Mapped[datetime] = mapped_column(datetime_ms(), nullable=False, server_default=now_default())
    updated_at: Mapped[datetime] = mapped_column(
        datetime_ms(), nullable=False, server_default=now_default(), onupdate=func.now()
    )
