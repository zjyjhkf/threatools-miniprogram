"""Repository 基类：只负责数据访问，不做业务判断。"""
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession


class BaseRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, model, pk: int):
        return await self.db.get(model, pk)

    async def scalar(self, stmt: Select) -> Any:
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def all(self, stmt: Select) -> list:
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count(self, stmt: Select) -> int:
        total = await self.db.execute(select(func.count()).select_from(stmt.subquery()))
        return int(total.scalar() or 0)

    async def add(self, obj):
        self.db.add(obj)
        await self.db.flush()
        return obj
