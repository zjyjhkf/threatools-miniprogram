"""收藏兼容入口；我的收藏请使用 GET /users/me/favorites（A28）。"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user
from app.core.response import ok
from app.db.session import get_db
from app.models.user import User
from app.services import favorite_service

router = APIRouter(prefix="/favorites", tags=["收藏"])


@router.get("/types", summary="收藏分类计数")
async def favorite_types(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return ok(await favorite_service.types_of(db, int(user.id)))


@router.post("", summary="收藏")
async def add_favorite(
    target_type: str = Query("post", alias="targetType"),
    target_id: int = Query(..., alias="targetId"),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    return ok(await favorite_service.add(db, int(user.id), target_type, target_id))


@router.delete("", summary="取消收藏")
async def remove_favorite(
    target_type: str = Query("post", alias="targetType"),
    target_id: int = Query(..., alias="targetId"),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    return ok(await favorite_service.remove(db, int(user.id), target_type, target_id))
