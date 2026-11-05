from __future__ import annotations
"""商品数据访问。"""
from sqlalchemy import select

from app.models.product import Product, ProductImage
from app.repositories.base import BaseRepo


class ProductRepo(BaseRepo):
    async def list(self, *, category: str | None, offset: int, limit: int) -> tuple[list[Product], int]:
        stmt = select(Product).where(Product.status == 1)
        if category and category != "all":
            stmt = stmt.where(Product.category == category)
        total = await self.count(stmt)
        rows = await self.all(stmt.order_by(Product.sort.asc(), Product.id.asc()).offset(offset).limit(limit))
        return rows, total

    async def images(self, product_id: int) -> list[str]:
        rows = await self.db.execute(
            select(ProductImage.url)
            .where(ProductImage.product_id == product_id)
            .order_by(ProductImage.sort.asc(), ProductImage.id.asc())
        )
        return [str(x) for x in rows.scalars().all()]

    async def by_ids(self, ids: list[int]) -> dict[int, Product]:
        if not ids:
            return {}
        rows = await self.all(select(Product).where(Product.id.in_(ids), Product.status == 1))
        return {int(p.id): p for p in rows}

    async def search(self, keyword: str, limit: int = 10) -> list[Product]:
        return await self.all(
            select(Product)
            .where(Product.status == 1, Product.title.like(f"%{keyword}%"))
            .order_by(Product.sort.asc())
            .limit(limit)
        )
