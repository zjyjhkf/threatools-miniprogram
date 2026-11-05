from datetime import datetime

from sqlalchemy import JSON, Index, Integer, SmallInteger, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, datetime_ms, now_default, tiny_bool, unsigned_bigint, unsigned_int, unsigned_smallint


class Course(Base):
    __tablename__ = "courses"
    __table_args__ = (Index("idx_category", "category", "sort"), Index("idx_main", "is_main"))

    id: Mapped[int] = mapped_column(unsigned_bigint(), primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(60), nullable=False)
    cover: Mapped[str] = mapped_column(String(512), nullable=False, server_default=text("''"))
    video_cover: Mapped[str | None] = mapped_column(String(512))
    duration: Mapped[int] = mapped_column(unsigned_int(), nullable=False, server_default=text("0"))
    action_count: Mapped[int] = mapped_column(unsigned_smallint(), nullable=False, server_default=text("0"))
    difficulty: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'beginner'"))
    category: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'rehab'"))
    coach_name: Mapped[str | None] = mapped_column(String(32))
    coach_avatar: Mapped[str | None] = mapped_column(String(512))
    coach_title: Mapped[str | None] = mapped_column(String(64))
    intro: Mapped[str | None] = mapped_column(Text)
    suitable_for: Mapped[list | None] = mapped_column(JSON)
    related_ids: Mapped[list | None] = mapped_column(JSON)
    learn_count: Mapped[int] = mapped_column(unsigned_int(), nullable=False, server_default=text("0"))
    collect_count: Mapped[int] = mapped_column(unsigned_int(), nullable=False, server_default=text("0"))
    is_main: Mapped[int] = mapped_column(tiny_bool(), nullable=False, server_default=text("0"))
    sort: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    status: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(datetime_ms(), nullable=False, server_default=now_default())
    updated_at: Mapped[datetime] = mapped_column(
        datetime_ms(), nullable=False, server_default=now_default(), onupdate=func.now()
    )


class Chapter(Base):
    __tablename__ = "chapters"
    __table_args__ = (Index("idx_course", "course_id", "idx"),)

    id: Mapped[int] = mapped_column(unsigned_bigint(), primary_key=True, autoincrement=True)
    course_id: Mapped[int] = mapped_column(unsigned_bigint(), nullable=False)
    idx: Mapped[int] = mapped_column(unsigned_smallint(), nullable=False)
    title: Mapped[str] = mapped_column(String(60), nullable=False)
    duration: Mapped[int] = mapped_column(unsigned_int(), nullable=False, server_default=text("0"))
    video_url: Mapped[str | None] = mapped_column(String(512))
    locked: Mapped[int] = mapped_column(tiny_bool(), nullable=False, server_default=text("0"))
