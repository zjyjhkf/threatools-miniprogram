from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user, optional_user
from app.core.rate_limit import rate_limit
from app.core.response import ok
from app.db.session import get_db
from app.models.user import User
from app.schemas.comment import CreateCommentBody, CreateCommentRequest
from app.services import comment_service

router = APIRouter(prefix="/comments", tags=["评论"])


@router.get("", summary="评论列表（按 postId）")
async def list_comments(
    post_id: int = Query(..., alias="postId"),
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


@router.post("", summary="发表评论", dependencies=[Depends(rate_limit("comment:create", 20, 3600))])
async def create(
    payload: CreateCommentBody,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    body = CreateCommentRequest(content=payload.content, reply_to_id=payload.reply_to_id)
    return ok(await comment_service.create_comment(db, payload.post_id, int(user.id), body))


@router.delete("/{comment_id}", summary="删除评论")
async def delete(
    comment_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    await comment_service.delete_comment(
        db, comment_id, int(user.id), is_admin=(user.role or "user") != "user"
    )
    return ok({"deleted": True})


@router.post("/{comment_id}/like", summary="点赞评论", dependencies=[Depends(rate_limit("like", 120, 3600))])
async def like(comment_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return ok(await comment_service.like_comment(db, comment_id, int(user.id)))


@router.delete("/{comment_id}/like", summary="取消点赞评论")
async def unlike(comment_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return ok(await comment_service.unlike_comment(db, comment_id, int(user.id)))
