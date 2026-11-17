"""帖子/图片/话题关联的数据访问。"""
from __future__ import annotations

from typing import List

from sqlalchemy import Select, and_, exists, or_, select

from app.models.follow import Follow
from app.models.post import Post, PostImage
from app.models.topic import PostTopic, Topic
from app.repositories.base import BaseRepo


def visibility_clause(viewer_id: int | None):
    """可见性：public 所有人；followers 仅关注者；private 仅作者。"""
    base = [Post.visibility == "public"]
    if viewer_id:
        followed = exists().where(
            and_(Follow.follower_id == viewer_id, Follow.followee_id == Post.user_id)
        )
        return or_(Post.user_id == viewer_id, *base, and_(Post.visibility == "followers", followed))
    return or_(*base)


def published_stmt() -> Select:
    return select(Post).where(Post.deleted == 0, Post.status == "published")


class PostRepo(BaseRepo):
    async def list(self, *, offset: int, limit: int, topic_id: int | None = None,
                   author_ids: list[int] | None = None, keyword: str | None = None,
                   viewer_id: int | None = None) -> tuple[list[Post], int]:
        stmt = published_stmt()
        if topic_id:
            stmt = stmt.where(Post.topic_id == topic_id)
        if author_ids is not None:
            stmt = stmt.where(Post.user_id.in_(author_ids or [-1]))
        stmt = stmt.where(visibility_clause(viewer_id))
        if keyword:
            stmt = stmt.where(Post.content.like(f"%{keyword}%"))
        total = await self.count(stmt)
        rows = await self.all(stmt.order_by(Post.created_at.desc(), Post.id.desc()).offset(offset).limit(limit))
        return rows, total

    async def list_by_author(self, user_id: int, offset: int, limit: int) -> tuple[List[Post], int]:
        stmt = published_stmt().where(Post.user_id == user_id)
        total = await self.count(stmt)
        rows = await self.all(stmt.order_by(Post.created_at.desc(), Post.id.desc()).offset(offset).limit(limit))
        return rows, total

    async def images(self, post_ids: list[int]) -> dict[int, list[str]]:
        if not post_ids:
            return {}
        rows = await self.db.execute(
            select(PostImage.post_id, PostImage.url)
            .where(PostImage.post_id.in_(post_ids))
            .order_by(PostImage.post_id, PostImage.sort, PostImage.id)
        )
        grouped: dict[int, list[str]] = {}
        for post_id, url in rows.all():
            grouped.setdefault(int(post_id), []).append(url)
        return grouped

    async def topics(self, post_ids: list[int]) -> dict[int, list[tuple[int, str]]]:
        if not post_ids:
            return {}
        rows = await self.db.execute(
            select(PostTopic.post_id, Topic.id, Topic.name)
            .join(Topic, Topic.id == PostTopic.topic_id)
            .where(PostTopic.post_id.in_(post_ids))
        )
        grouped: dict[int, list[tuple[int, str]]] = {}
        for post_id, topic_id, name in rows.all():
            grouped.setdefault(int(post_id), []).append((int(topic_id), str(name)))
        return grouped

    async def search(self, keyword: str, limit: int) -> list[Post]:
        return await self.all(
            published_stmt()
            .where(Post.content.like(f"%{keyword}%"))
            .order_by(Post.like_count.desc(), Post.created_at.desc())
            .limit(limit)
        )
