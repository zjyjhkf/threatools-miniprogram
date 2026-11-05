"""点赞 / 收藏 / 关注 的数据访问。"""
from sqlalchemy import delete, func, select

from app.models.collection import Collection
from app.models.follow import Follow
from app.models.like import Like
from app.models.post import Post
from app.repositories.base import BaseRepo


class InteractionRepo(BaseRepo):
    async def find_like(self, user_id: int, target_type: str, target_id: int) -> Like | None:
        return await self.scalar(
            select(Like).where(
                Like.user_id == user_id, Like.target_type == target_type, Like.target_id == target_id
            )
        )

    async def remove_like(self, user_id: int, target_type: str, target_id: int) -> bool:
        result = await self.db.execute(
            delete(Like).where(
                Like.user_id == user_id, Like.target_type == target_type, Like.target_id == target_id
            )
        )
        return bool(result.rowcount)

    async def liked_ids(self, user_id: int, target_type: str, ids: list[int]) -> set[int]:
        if not ids:
            return set()
        rows = await self.db.execute(
            select(Like.target_id).where(
                Like.user_id == user_id, Like.target_type == target_type, Like.target_id.in_(ids)
            )
        )
        return {int(x) for x in rows.scalars().all()}

    async def find_collection(self, user_id: int, target_type: str, target_id: int) -> Collection | None:
        return await self.scalar(
            select(Collection).where(
                Collection.user_id == user_id,
                Collection.target_type == target_type,
                Collection.target_id == target_id,
            )
        )

    async def remove_collection(self, user_id: int, target_type: str, target_id: int) -> bool:
        result = await self.db.execute(
            delete(Collection).where(
                Collection.user_id == user_id,
                Collection.target_type == target_type,
                Collection.target_id == target_id,
            )
        )
        return bool(result.rowcount)

    async def collected_ids(self, user_id: int, target_type: str, ids: list[int]) -> set[int]:
        if not ids:
            return set()
        rows = await self.db.execute(
            select(Collection.target_id).where(
                Collection.user_id == user_id,
                Collection.target_type == target_type,
                Collection.target_id.in_(ids),
            )
        )
        return {int(x) for x in rows.scalars().all()}

    async def favorite_posts(self, user_id: int, offset: int, limit: int) -> tuple[list[Post], int]:
        base = (
            select(Post)
            .join(Collection, Collection.target_id == Post.id)
            .where(
                Collection.user_id == user_id,
                Collection.target_type == "post",
                Post.deleted == 0,
                Post.status == "published",
            )
        )
        total = await self.count(base)
        rows = await self.all(base.order_by(Collection.created_at.desc()).offset(offset).limit(limit))
        return rows, total

    async def favorite_course_ids(self, user_id: int, offset: int, limit: int) -> tuple[list[int], int]:
        stmt = select(Collection.target_id).where(
            Collection.user_id == user_id, Collection.target_type == "course"
        )
        total = await self.count(stmt)
        rows = await self.db.execute(stmt.order_by(Collection.created_at.desc()).offset(offset).limit(limit))
        return [int(x) for x in rows.scalars().all()], total

    async def favorite_product_ids(self, user_id: int, offset: int, limit: int) -> tuple[list[int], int]:
        stmt = select(Collection.target_id).where(
            Collection.user_id == user_id, Collection.target_type == "product"
        )
        total = await self.count(stmt)
        rows = await self.db.execute(stmt.order_by(Collection.created_at.desc()).offset(offset).limit(limit))
        return [int(x) for x in rows.scalars().all()], total

    async def is_following(self, follower_id: int, followee_id: int) -> bool:
        if not follower_id or follower_id == followee_id:
            return False
        found = await self.scalar(
            select(Follow.id).where(Follow.follower_id == follower_id, Follow.followee_id == followee_id)
        )
        return found is not None

    async def find_follow(self, follower_id: int, followee_id: int) -> Follow | None:
        return await self.scalar(
            select(Follow).where(Follow.follower_id == follower_id, Follow.followee_id == followee_id)
        )

    async def following_ids(self, follower_id: int, ids: list[int]) -> set[int]:
        if not ids or not follower_id:
            return set()
        rows = await self.db.execute(
            select(Follow.followee_id).where(Follow.follower_id == follower_id, Follow.followee_id.in_(ids))
        )
        return {int(x) for x in rows.scalars().all()}

    async def follower_count(self, user_id: int) -> int:
        value = await self.scalar(
            select(func.count()).select_from(Follow).where(Follow.followee_id == user_id)
        )
        return int(value or 0)

    async def remove_follow(self, follower_id: int, followee_id: int) -> bool:
        result = await self.db.execute(
            delete(Follow).where(Follow.follower_id == follower_id, Follow.followee_id == followee_id)
        )
        return bool(result.rowcount)

    async def follow_list(self, user_id: int, kind: str, offset: int, limit: int) -> tuple[list[int], int]:
        stmt = (
            select(Follow.followee_id).where(Follow.follower_id == user_id)
            if kind == "following"
            else select(Follow.follower_id).where(Follow.followee_id == user_id)
        )
        total = await self.count(stmt)
        rows = await self.db.execute(
            stmt.order_by(Follow.created_at.desc()).offset(offset).limit(limit)
        )
        return [int(x) for x in rows.scalars().all()], total
