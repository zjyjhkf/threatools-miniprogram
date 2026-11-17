"""用户与身体档案的数据访问。"""
from sqlalchemy import func, select

from app.models.body_profile import BodyProfile
from app.models.collection import Collection
from app.models.follow import Follow
from app.models.like import Like
from app.models.post import Post
from app.models.user import User
from app.repositories.base import BaseRepo


class UserRepo(BaseRepo):
    async def by_openid(self, open_id: str) -> User | None:
        return await self.scalar(select(User).where(User.open_id == open_id))

    async def list_by_ids(self, ids: list[int]) -> dict[int, User]:
        if not ids:
            return {}
        users = await self.all(select(User).where(User.id.in_(ids)))
        return {int(u.id): u for u in users}

    async def profile(self, user_id: int) -> BodyProfile | None:
        return await self.scalar(select(BodyProfile).where(BodyProfile.user_id == user_id))

    async def stats(self, user_id: int) -> dict:
        post_count = await self.scalar(
            select(func.count()).select_from(Post).where(Post.user_id == user_id, Post.deleted == 0)
        )
        following = await self.scalar(
            select(func.count()).select_from(Follow).where(Follow.follower_id == user_id)
        )
        follower = await self.scalar(
            select(func.count()).select_from(Follow).where(Follow.followee_id == user_id)
        )
        collect = await self.scalar(
            select(func.count()).select_from(Collection).where(Collection.user_id == user_id)
        )
        like_received = await self.scalar(
            select(func.coalesce(func.sum(Post.like_count), 0)).where(Post.user_id == user_id, Post.deleted == 0)
        )
        return {
            "post_count": int(post_count or 0),
            "following_count": int(following or 0),
            "follower_count": int(follower or 0),
            "collect_count": int(collect or 0),
            "like_received_count": int(like_received or 0),
        }

    async def search(self, keyword: str, limit: int) -> list[User]:
        return await self.all(
            select(User)
            .where(User.status == 1, User.nickname.like(f"%{keyword}%"))
            .order_by(User.id.desc())
            .limit(limit)
        )

    async def liked_target_ids(self, user_id: int, target_type: str, ids: list[int]) -> set[int]:
        if not ids:
            return set()
        rows = await self.all(
            select(Like.target_id).where(
                Like.user_id == user_id, Like.target_type == target_type, Like.target_id.in_(ids)
            )
        )
        return {int(x) for x in rows}
