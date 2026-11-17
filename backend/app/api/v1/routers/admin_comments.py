"""管理端评论治理：A108 评论列表、删除评论。

与小程序端共用同一个 MySQL：
- 删除为软删（`status='deleted'`），小程序端评论列表与详情立即不可见；
- 删除父评论时连带删除其全部回复，并同步扣减 `posts.comment_count`，刷新后不会复现。
"""

from __future__ import annotations

from datetime import datetime, time

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, literal, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.routers.admin import current_admin
from app.core.errors import NotFound
from app.core.response import ok
from app.db.session import get_db
from app.models.admin_user import AdminUser
from app.models.comment import Comment
from app.models.post import Post
from app.models.user import User
from app.utils.time import fmt_dt

router = APIRouter(prefix="/admin", tags=["管理端-评论"])

COMMENT_STATUSES = ("normal", "deleted")


def _parse_day(value: str, end_of_day: bool = False) -> datetime | None:
    text = (value or "").strip()
    if not text:
        return None
    try:
        day = datetime.strptime(text[:10], "%Y-%m-%d")
    except ValueError:
        return None
    return datetime.combine(day.date(), time.max if end_of_day else time.min)


def _user_vo(user: User | None, fallback_id: int) -> dict:
    return {
        "id": str(int(user.id)) if user else str(int(fallback_id)),
        "nickname": (user.nickname if user else "") or "匿名用户",
        "avatar": (user.avatar if user else "") or "",
    }


@router.get("/comments", summary="A108 评论列表")
async def admin_comments(
    keyword: str = Query(""),
    status: str = Query(""),
    post_id: str = Query("", alias="postId"),
    user_id: str = Query("", alias="userId"),
    start_date: str = Query("", alias="startDate"),
    end_date: str = Query("", alias="endDate"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Comment)

    status_text = (status or "").strip()
    if status_text in COMMENT_STATUSES:
        stmt = stmt.where(Comment.status == status_text)

    keyword_text = (keyword or "").strip()
    if keyword_text:
        stmt = stmt.where(Comment.content.like(f"%{keyword_text}%"))

    post_text = (post_id or "").strip()
    if post_text.isdigit():
        stmt = stmt.where(Comment.post_id == int(post_text))

    user_text = (user_id or "").strip()
    if user_text.isdigit():
        stmt = stmt.where(Comment.user_id == int(user_text))

    start_at = _parse_day(start_date)
    if start_at:
        stmt = stmt.where(Comment.created_at >= start_at)
    end_at = _parse_day(end_date, end_of_day=True)
    if end_at:
        stmt = stmt.where(Comment.created_at <= end_at)

    total = int((await db.scalar(select(func.count()).select_from(stmt.subquery()))) or 0)
    rows = list(
        (
            await db.execute(
                stmt.order_by(Comment.id.desc()).offset((page - 1) * size).limit(size)
            )
        )
        .scalars()
        .all()
    )

    post_ids = {int(item.post_id) for item in rows}
    user_ids = {int(item.user_id) for item in rows}
    user_ids |= {int(item.reply_to_user_id) for item in rows if item.reply_to_user_id}

    posts = (
        {
            int(item.id): item
            for item in (
                await db.execute(select(Post).where(Post.id.in_(post_ids)))
            )
            .scalars()
            .all()
        }
        if post_ids
        else {}
    )
    users = (
        {
            int(item.id): item
            for item in (
                await db.execute(select(User).where(User.id.in_(user_ids)))
            )
            .scalars()
            .all()
        }
        if user_ids
        else {}
    )

    items = []
    for comment in rows:
        post = posts.get(int(comment.post_id))
        title = (post.title if post else "") or ""
        if not title and post:
            title = " ".join((post.content or "").split())[:40]
        reply_user = users.get(int(comment.reply_to_user_id)) if comment.reply_to_user_id else None
        items.append(
            {
                "id": str(int(comment.id)),
                "postId": str(int(comment.post_id)),
                "postTitle": title or "（作品已删除）",
                "user": _user_vo(users.get(int(comment.user_id)), int(comment.user_id)),
                "content": comment.content or "",
                "parentId": str(int(comment.parent_id or 0)),
                "replyToUser": _user_vo(reply_user, int(comment.reply_to_user_id))
                if reply_user
                else None,
                "likeCount": int(comment.like_count or 0),
                "status": comment.status if comment.status in COMMENT_STATUSES else "normal",
                "createdAt": fmt_dt(comment.created_at) or "",
            }
        )

    return ok({"list": items, "total": total, "page": page, "size": size})


@router.delete("/comments/{comment_id}", summary="A108 删除评论")
async def admin_delete_comment(
    comment_id: int,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    comment = await db.get(Comment, comment_id)
    if not comment or comment.status == "deleted":
        raise NotFound("评论不存在或已删除")

    children = [
        int(item)
        for item in (
            await db.execute(
                select(Comment.id).where(
                    Comment.parent_id == comment_id, Comment.status != "deleted"
                )
            )
        )
        .scalars()
        .all()
    ]
    affected = 1 + len(children)

    await db.execute(
        update(Comment)
        .where(Comment.id.in_([int(comment_id), *children]))
        .values(status="deleted")
    )
    await db.execute(
        update(Post)
        .where(Post.id == comment.post_id)
        .values(
            comment_count=case(
                (Post.comment_count >= affected, Post.comment_count - affected),
                else_=literal(0),
            )
        )
    )
    await db.commit()

    return ok({"commentId": str(int(comment_id)), "deleted": True, "affected": affected})
