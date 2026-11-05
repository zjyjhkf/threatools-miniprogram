from __future__ import annotations
"""评论数据访问。"""
from sqlalchemy import func, select

from app.models.comment import Comment
from app.repositories.base import BaseRepo


class CommentRepo(BaseRepo):
    async def list(self, post_id: int, offset: int, limit: int) -> tuple[list[Comment], int]:
        stmt = select(Comment).where(Comment.post_id == post_id, Comment.status == "normal")
        total = await self.count(stmt)
        rows = await self.all(stmt.order_by(Comment.created_at.asc(), Comment.id.asc()).offset(offset).limit(limit))
        return rows, total

    async def count_of_post(self, post_id: int) -> int:
        value = await self.scalar(
            select(func.count()).select_from(Comment).where(
                Comment.post_id == post_id, Comment.status == "normal"
            )
        )
        return int(value or 0)

    async def received(self, user_id: int, offset: int, limit: int) -> tuple[list[Comment], int]:
        stmt = select(Comment).where(Comment.status == "normal", Comment.user_id != user_id)
        total = await self.count(stmt)
        rows = await self.all(stmt.order_by(Comment.created_at.desc()).offset(offset).limit(limit))
        return rows, total
