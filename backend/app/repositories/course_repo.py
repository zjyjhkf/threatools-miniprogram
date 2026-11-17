from __future__ import annotations
"""课程数据访问。"""
from sqlalchemy import select

from app.models.course import Chapter, Course
from app.repositories.base import BaseRepo


class CourseRepo(BaseRepo):
    async def list(self, *, category: str | None, offset: int, limit: int,
                   only_main: bool = False, sort: str = "hot") -> tuple[list[Course], int]:
        stmt = select(Course).where(Course.status == 1)
        if category and category != "all":
            stmt = stmt.where(Course.category == category)
        if only_main:
            stmt = stmt.where(Course.is_main == 1)
        total = await self.count(stmt)
        order = Course.collect_count.desc() if sort == "hot" else Course.sort.asc()
        rows = await self.all(stmt.order_by(order, Course.id.asc()).offset(offset).limit(limit))
        return rows, total

    async def chapters(self, course_ids: list[int]) -> dict[int, list[Chapter]]:
        if not course_ids:
            return {}
        rows = await self.all(select(Chapter).where(Chapter.course_id.in_(course_ids)).order_by(Chapter.idx.asc()))
        grouped: dict[int, list[Chapter]] = {}
        for row in rows:
            grouped.setdefault(int(row.course_id), []).append(row)
        return grouped

    async def by_ids(self, ids: list[int]) -> dict[int, Course]:
        if not ids:
            return {}
        rows = await self.all(select(Course).where(Course.id.in_(ids), Course.status == 1))
        return {int(c.id): c for c in rows}

    async def search(self, keyword: str, limit: int = 10) -> list[Course]:
        return await self.all(
            select(Course)
            .where(Course.status == 1, Course.title.like(f"%{keyword}%"))
            .order_by(Course.learn_count.desc())
            .limit(limit)
        )
