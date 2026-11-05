"""通用收藏：仅作为 /favorites 兼容入口，业务主链路走各资源的 /collect。"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import BadRequest, NotFound
from app.models.collection import Collection
from app.models.course import Course
from app.models.post import Post
from app.models.product import Product
from app.repositories.interaction_repo import InteractionRepo
from app.utils.time import now_cn

TARGETS = {
    "post": Post,
    "course": Course,
    "product": Product,
}


async def add(db: AsyncSession, user_id: int, target_type: str, target_id: int) -> dict:
    model = TARGETS.get(target_type)
    if not model:
        raise BadRequest("收藏类型不合法")
    if not await db.get(model, target_id):
        raise NotFound("内容不存在")
    repo = InteractionRepo(db)
    if not await repo.find_collection(user_id, target_type, target_id):
        db.add(
            Collection(
                user_id=user_id,
                target_type=target_type,
                target_id=target_id,
                created_at=now_cn(),
            )
        )
        await db.flush()
    return {"collected": True}


async def remove(db: AsyncSession, user_id: int, target_type: str, target_id: int) -> dict:
    removed = await InteractionRepo(db).remove_collection(user_id, target_type, target_id)
    await db.flush()
    return {"collected": False, "removed": removed}


async def types_of(db: AsyncSession, user_id: int) -> dict:
    rows = (
        await db.execute(
            select(Collection.target_type).where(Collection.user_id == user_id)
        )
    ).scalars().all()
    counts = {"post": 0, "course": 0, "product": 0}
    for value in rows:
        if value in counts:
            counts[value] += 1
    return counts
