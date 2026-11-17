from datetime import datetime
from decimal import Decimal

from sqlalchemy import JSON, Numeric, SmallInteger, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, datetime_ms, now_default, tiny_bool, unsigned_bigint


class BodyProfile(Base):
    __tablename__ = "body_profiles"

    id: Mapped[int] = mapped_column(unsigned_bigint(), primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(unsigned_bigint(), nullable=False, unique=True)
    height: Mapped[int | None] = mapped_column(SmallInteger)
    weight: Mapped[Decimal | None] = mapped_column(Numeric(5, 1))
    goals: Mapped[list | None] = mapped_column(JSON)
    frequency: Mapped[str | None] = mapped_column(String(20))
    level: Mapped[str | None] = mapped_column(String(20))
    focus_parts: Mapped[list | None] = mapped_column(JSON)
    injuries: Mapped[str | None] = mapped_column(String(200))
    allow_public: Mapped[int] = mapped_column(tiny_bool(), nullable=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(datetime_ms(), nullable=False, server_default=now_default())
    updated_at: Mapped[datetime] = mapped_column(
        datetime_ms(), nullable=False, server_default=now_default(), onupdate=func.now()
    )
