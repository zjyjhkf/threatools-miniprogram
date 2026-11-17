from datetime import datetime

from sqlalchemy import JSON, Index, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, datetime_ms, now_default, unsigned_bigint


class TrackEvent(Base):
    __tablename__ = "track_events"
    __table_args__ = (Index("idx_event_time", "event", "created_at"), Index("idx_user_time", "user_id", "created_at"))

    id: Mapped[int] = mapped_column(unsigned_bigint(), primary_key=True, autoincrement=True)
    event: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[int | None] = mapped_column(unsigned_bigint())
    page: Mapped[str | None] = mapped_column(String(128))
    props: Mapped[dict | None] = mapped_column(JSON)
    platform: Mapped[str | None] = mapped_column(String(20))
    app_version: Mapped[str | None] = mapped_column(String(20))
    scene: Mapped[int | None] = mapped_column(SmallInteger)
    request_id: Mapped[str | None] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(datetime_ms(), nullable=False, server_default=now_default())
