from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import optional_user
from app.core.errors import BadRequest, Unauthorized
from app.core.response import ok
from app.db.session import get_db
from app.models.user import User
from app.services import post_service

router = APIRouter(prefix="/feed", tags=["信息流"])

FEED_TYPES = ("recommend", "follow", "latest")


@router.get("", summary="信息流（推荐/关注/最新）")
async def feed(
    type: str = Query("recommend"),
    cursor: str = Query(""),
    size: int = Query(10, ge=1, le=30),
    viewer: User | None = Depends(optional_user),
    db: AsyncSession = Depends(get_db),
):
    if type not in FEED_TYPES:
        raise BadRequest("type 仅支持 recommend / follow / latest")
    if type == "follow" and not viewer:
        raise Unauthorized("请先登录")
    return ok(
        await post_service.feed(
            db,
            int(viewer.id) if viewer else None,
            feed_type=type,
            cursor=cursor,
            size=size,
        )
    )
