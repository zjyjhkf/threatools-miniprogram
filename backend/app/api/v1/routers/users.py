from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user, optional_user
from app.core.rate_limit import rate_limit
from app.core.response import ok
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import BodyProfileUpdateRequest, UpdateProfileRequest
from app.services import post_service, user_service

router = APIRouter(prefix="/users", tags=["用户"])


@router.get("/me", summary="当前用户资料")
async def get_me(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return ok(await user_service.me(db, user))


@router.put(
    "/me/profile",
    summary="保存基本资料",
    dependencies=[Depends(rate_limit("user:profile", 60, 3600))],
)
async def save_profile(
    payload: UpdateProfileRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    return ok(await user_service.update_profile(db, user, payload))


@router.get("/me/body-profile", summary="身体档案")
async def get_body_profile(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return ok(await user_service.get_body_profile(db, user))


@router.put(
    "/me/body-profile",
    summary="保存身体档案",
    dependencies=[Depends(rate_limit("user:body", 60, 3600))],
)
async def save_body_profile(
    payload: BodyProfileUpdateRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    return ok(await user_service.save_body_profile(db, user, payload))


@router.get("/me/completeness", summary="资料完善度")
async def get_completeness(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return ok(await user_service.completeness(db, user))


@router.get("/me/favorites", summary="我的收藏")
async def my_favorites(
    type: str = Query("post"),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=30),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    return ok(await user_service.favorites(db, int(user.id), type, page, size))


@router.get("/{user_id}", summary="他人主页")
async def get_user(
    user_id: int,
    viewer: User | None = Depends(optional_user),
    db: AsyncSession = Depends(get_db),
):
    return ok(await user_service.user_home(db, user_id, int(viewer.id) if viewer else None))


@router.get("/{user_id}/posts", summary="用户作品（他人动态 / 我的作品）")
async def get_user_posts(
    user_id: int,
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=30),
    viewer: User | None = Depends(optional_user),
    db: AsyncSession = Depends(get_db),
):
    return ok(
        await post_service.user_posts(db, user_id, int(viewer.id) if viewer else None, page, size)
    )
