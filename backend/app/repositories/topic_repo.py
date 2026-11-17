from __future__ import annotations
"""话题数据访问。"""
from sqlalchemy import select

from app.models.topic import Topic
from app.repositories.base import BaseRepo


class TopicRepo(BaseRepo):
    async def list(self, hot_only: bool = False, limit: int = 50) -> list[Topic]:
        stmt = select(Topic)
        if hot_only:
            stmt = stmt.where(Topic.is_hot == 1)
        return await self.all(stmt.order_by(Topic.is_hot.desc(), Topic.sort.asc(), Topic.id.asc()).limit(limit))

    async def by_ids(self, ids: list[int]) -> dict[int, Topic]:
        if not ids:
            return {}
        rows = await self.all(select(Topic).where(Topic.id.in_(ids)))
        return {int(t.id): t for t in rows}

    async def search(self, keyword: str, limit: int = 10) -> list[Topic]:
        return await self.all(
            select(Topic).where(Topic.name.like(f"%{keyword}%")).order_by(Topic.post_count.desc()).limit(limit)
        )
