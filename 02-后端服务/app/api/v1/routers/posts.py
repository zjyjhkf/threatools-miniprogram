from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user, optional_user
from app.core.rate_limit import rate_limit
from app.core.response import ok
from app.db.session import get_db
from app.models.user import User
from app.schemas.comment import CreateCommentRequest
from app.schemas.post import CreatePostRequest
from app.services import comment_service, post_service

router = APIRouter(prefix="/posts", tags=["帖子"])


@router.post(
    "",
    summary="发布帖子",
    dependencies=[Depends(rate_limit("post:create", 5, 3600))],
)
async def create_post(
    payload: CreatePostRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    return ok(await post_service.create_post(db, user, payload))


@router.get("/{post_id}", summary="帖子详情")
async def get_post(
    post_id: int,
    viewer: User | None = Depends(optional_user),
    db: AsyncSession = Depends(get_db),
):
    return ok(await post_service.detail(db, post_id, int(viewer.id) if viewer else None))


@router.delete("/{post_id}", summary="删除帖子")
async def delete_post(
    post_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    await post_service.delete_post(db, post_id, user)
    return ok({"deleted": True})


@router.post("/{post_id}/like", summary="点赞", dependencies=[Depends(rate_limit("like", 120, 3600))])
async def like_post(post_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return ok(await post_service.toggle_like(db, post_id, int(user.id), True))


@router.delete("/{post_id}/like", summary="取消点赞")
async def unlike_post(post_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return ok(await post_service.toggle_like(db, post_id, int(user.id), False))


@router.post("/{post_id}/collect", summary="收藏帖子")
async def collect_post(post_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return ok(await post_service.toggle_collect(db, post_id, int(user.id), True))


@router.delete("/{post_id}/collect", summary="取消收藏帖子")
async def uncollect_post(post_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return ok(await post_service.toggle_collect(db, post_id, int(user.id), False))


@router.get("/{post_id}/comments", summary="评论列表")
async def list_comments(
    post_id: int,
    cursor: str = Query(""),
    size: int = Query(20, ge=1, le=30),
    viewer: User | None = Depends(optional_user),
    db: AsyncSession = Depends(get_db),
):
    return ok(
        await comment_service.list_comments(
            db, post_id, int(viewer.id) if viewer else None, cursor, size
        )
    )


@router.post(
    "/{post_id}/comments",
    summary="发表评论",
    dependencies=[Depends(rate_limit("comment:create", 60, 3600))],
)
async def create_comment(
    post_id: int,
    payload: CreateCommentRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    return ok(await comment_service.create_comment(db, post_id, int(user.id), payload))
