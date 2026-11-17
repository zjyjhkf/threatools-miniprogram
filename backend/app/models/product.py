from datetime import datetime

from sqlalchemy import JSON, Index, SmallInteger, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, datetime_ms, now_default, unsigned_bigint, unsigned_int, unsigned_tinyint


class Product(Base):
    """产品（康复装备）：字段与 01 文档 A25/A26 契约一致。"""

    __tablename__ = "products"
    __table_args__ = (Index("idx_category", "category"), Index("idx_sort", "sort"))

    id: Mapped[int] = mapped_column(unsigned_bigint(), primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    model: Mapped[str] = mapped_column(String(40), nullable=False, server_default=text("''"))
    category: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'rehab'"))
    tagline: Mapped[str | None] = mapped_column(String(120))
    tags: Mapped[list | None] = mapped_column(JSON)
    cover: Mapped[str] = mapped_column(String(512), nullable=False, server_default=text("''"))
    features: Mapped[list | None] = mapped_column(JSON)
    specs: Mapped[list | None] = mapped_column(JSON)
    suitable_for: Mapped[list | None] = mapped_column(JSON)
    video_cover: Mapped[str | None] = mapped_column(String(512))
    video_url: Mapped[str | None] = mapped_column(String(512))
    video_duration: Mapped[int] = mapped_column(unsigned_int(), nullable=False, server_default=text("0"))
    related_ids: Mapped[list | None] = mapped_column(JSON)
    collect_count: Mapped[int] = mapped_column(unsigned_int(), nullable=False, server_default=text("0"))
    sort: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default=text("0"))
    status: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default=text("1"))
    deleted: Mapped[int] = mapped_column(unsigned_tinyint(), nullable=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(datetime_ms(), nullable=False, server_default=now_default())
    updated_at: Mapped[datetime] = mapped_column(
        datetime_ms(), nullable=False, server_default=now_default(), onupdate=func.now()
    )


class ProductImage(Base):
    __tablename__ = "product_images"
    __table_args__ = (Index("idx_product", "product_id", "sort"),)

    id: Mapped[int] = mapped_column(unsigned_bigint(), primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(unsigned_bigint(), nullable=False)
    url: Mapped[str] = mapped_column(String(512), nullable=False)
    sort: Mapped[int] = mapped_column(unsigned_tinyint(), nullable=False, server_default=text("0"))
