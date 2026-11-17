"""评论服务：一级列表 + 最多 3 条子回复、发表、删除、点赞。"""
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import BadRequest, Forbidden, NotFound
from app.models.comment import Comment
from app.models.post import Post
from app.repositories.interaction_repo import InteractionRepo
from app.repositories.user_repo import UserRepo
from app.schemas.comment import CreateCommentRequest
from app.services.moderation import check_text
from app.services.post_service import get_post_or_404
from app.utils.text import clean_text
from app.utils.time import fmt_dt, now_cn

CHILDREN_LIMIT = 3


def _user_vo(user, fallback_id: int) -> dict:
    return {
        "id": str(int(user.id)) if user else str(int(fallback_id)),
        "nickname": (user.nickname if user else "") or "匿名用户",
        "avatar": (user.avatar if user else "") or "",
    }


def comment_vo(comment, users: dict, liked: set[int], viewer_id: int | None = None,
               post_author_id: int = 0, children: list[dict] | None = None) -> dict:
    reply = users.get(int(comment.reply_to_user_id)) if comment.reply_to_user_id else None
    return {
        "id": str(int(comment.id)),
        "user": _user_vo(users.get(int(comment.user_id)), int(comment.user_id)),
        "content": comment.content or "",
        "parentId": str(int(comment.parent_id or 0)),
        "replyToUser": {"id": str(int(reply.id)), "nickname": reply.nickname or ""} if reply else None,
        "likeCount": int(comment.like_count or 0),
        "liked": int(comment.id) in liked,
        "createdAt": fmt_dt(comment.created_at) or "",
        "children": children or [],
        "canDelete": bool(
            viewer_id and (int(comment.user_id) == int(viewer_id) or int(post_author_id) == int(viewer_id))
        ),
    }


async def list_comments(db: AsyncSession, post_id: int, viewer_id: int | None,
                        cursor: str | None = None, size: int = 20) -> dict:
    post = await get_post_or_404(db, post_id, viewer_id)
    size = min(max(int(size or 20), 1), 30)
    stmt = select(Comment).where(
        Comment.post_id == post_id, Comment.parent_id == 0, Comment.status == "normal"
    )
    try:
        cursor_value = max(0, int(str(cursor or "0")))
    except (TypeError, ValueError):
        cursor_value = 0
    if cursor_value:
        stmt = stmt.where(Comment.id < cursor_value)
    rows = list(
        (
            await db.execute(stmt.order_by(Comment.id.desc()).limit(size + 1))
        ).scalars().all()
    )
    has_more = len(rows) > size
    visible = rows[:size]

    children_map: dict[int, list] = {}
    if visible:
        parents = [int(c.id) for c in visible]
        children = list(
            (
                await db.execute(
                    select(Comment)
                    .where(Comment.parent_id.in_(parents), Comment.status == "normal")
                    .order_by(Comment.id.asc())
                )
            ).scalars().all()
        )
        for child in children:
            bucket = children_map.setdefault(int(child.parent_id), [])
            if len(bucket) < CHILDREN_LIMIT:
                bucket.append(child)

    all_comments = visible + [c for bucket in children_map.values() for c in bucket]
    user_ids = list(
        {int(c.user_id) for c in all_comments}
        | {int(c.reply_to_user_id) for c in all_comments if c.reply_to_user_id}
    )
    users = await UserRepo(db).list_by_ids(user_ids)
    liked = (
        await InteractionRepo(db).liked_ids(viewer_id, "comment", [int(c.id) for c in all_comments])
        if viewer_id
        else set()
    )

    items = []
    for comment in visible:
        children_vo = [
            comment_vo(child, users, liked, viewer_id, int(post.user_id))
            for child in children_map.get(int(comment.id), [])
        ]
        items.append(comment_vo(comment, users, liked, viewer_id, int(post.user_id), children_vo))
    return {
        "list": items,
        "nextCursor": str(int(visible[-1].id)) if has_more and visible else "",
        "hasMore": has_more,
    }


async def create_comment(db: AsyncSession, post_id: int, user_id: int,
                         payload: CreateCommentRequest) -> dict:
    post = await get_post_or_404(db, post_id, user_id)
    content = clean_text(payload.content, 200)
    if not content:
        raise BadRequest("评论不能为空")
    check_text(content, field_label="评论")

    parent_id = 0
    reply_to_user_id = None
    if payload.reply_to_id:
        target = await db.get(Comment, int(payload.reply_to_id))
        if not target or int(target.post_id) != int(post_id) or target.status != "normal":
            raise NotFound("回复的评论不存在")
        parent_id = int(target.parent_id or target.id)
        reply_to_user_id = int(target.user_id)

    comment = Comment(
        post_id=post_id,
        user_id=user_id,
        parent_id=parent_id,
        reply_to_user_id=reply_to_user_id,
        content=content,
        like_count=0,
        status="normal",
        created_at=now_cn(),
    )
    db.add(comment)
    await db.execute(
        update(Post).where(Post.id == post_id).values(comment_count=Post.comment_count + 1)
    )
    await db.flush()
    await db.refresh(comment)
    await db.refresh(post)

    users = await UserRepo(db).list_by_ids(
        [user_id] + ([reply_to_user_id] if reply_to_user_id else [])
    )
    vo = comment_vo(comment, users, set(), user_id, int(post.user_id), [])
    return {"comment": vo, "commentCount": int(post.comment_count or 0)}


async def delete_comment(db: AsyncSession, comment_id: int, user_id: int, is_admin: bool = False) -> None:
    comment = await db.get(Comment, comment_id)
    if not comment or comment.status != "normal":
        raise NotFound("评论不存在或已删除")
    post = await db.get(Post, comment.post_id)
    allowed = is_admin or int(comment.user_id) == user_id or (post and int(post.user_id) == user_id)
    if not allowed:
        raise Forbidden("只能删除自己的评论")
    comment.status = "deleted"
    await db.execute(
        update(Post)
        .where(Post.id == comment.post_id, Post.comment_count > 0)
        .values(comment_count=Post.comment_count - 1)
    )
    await db.flush()


async def like_comment(db: AsyncSession, comment_id: int, user_id: int) -> dict:
    comment = await db.get(Comment, comment_id)
    if not comment or comment.status != "normal":
        raise NotFound("评论不存在或已删除")
    repo = InteractionRepo(db)
    if await repo.find_like(user_id, "comment", comment_id):
        return {"liked": True, "likeCount": int(comment.like_count or 0)}
    from app.models.like import Like

    db.add(Like(user_id=user_id, target_type="comment", target_id=comment_id))
    await db.execute(
        update(Comment).where(Comment.id == comment_id).values(like_count=Comment.like_count + 1)
    )
    await db.flush()
    await db.refresh(comment)
    return {"liked": True, "likeCount": int(comment.like_count or 0)}


async def unlike_comment(db: AsyncSession, comment_id: int, user_id: int) -> dict:
    comment = await db.get(Comment, comment_id)
    if not comment or comment.status != "normal":
        raise NotFound("评论不存在或已删除")
    removed = await InteractionRepo(db).remove_like(user_id, "comment", comment_id)
    if removed:
        await db.execute(
            update(Comment)
            .where(Comment.id == comment_id, Comment.like_count > 0)
            .values(like_count=Comment.like_count - 1)
        )
        await db.flush()
        await db.refresh(comment)
    return {"liked": False, "likeCount": int(comment.like_count or 0)}


async def received(db: AsyncSession, user_id: int, page: int = 1, size: int = 10) -> dict:
    """我收到的评论：我发布的帖子下的评论。"""
    page = max(1, int(page or 1))
    size = min(max(int(size or 10), 1), 30)
    post_ids = [
        int(x)
        for x in (
            await db.execute(select(Post.id).where(Post.user_id == user_id, Post.deleted == 0))
        ).scalars().all()
    ]
    if not post_ids:
        return {"list": [], "total": 0, "hasMore": False, "nextCursor": ""}

    stmt = select(Comment).where(Comment.post_id.in_(post_ids), Comment.status == "normal")
    total = int((await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0)
    rows = list(
        (
            await db.execute(
                stmt.order_by(Comment.id.desc()).offset((page - 1) * size).limit(size)
            )
        ).scalars().all()
    )
    users = await UserRepo(db).list_by_ids(list({int(c.user_id) for c in rows}))
    liked = await InteractionRepo(db).liked_ids(user_id, "comment", [int(c.id) for c in rows])
    posts_map = {
        int(p.id): p
        for p in (
            await db.execute(select(Post).where(Post.id.in_([int(c.post_id) for c in rows])))
        ).scalars().all()
    }
    items = []
    for comment in rows:
        post = posts_map.get(int(comment.post_id))
        item = comment_vo(comment, users, liked, user_id, int(post.user_id) if post else 0)
        item["postId"] = str(int(comment.post_id))
        item["postContent"] = (post.content if post else "")[:60]
        items.append(item)
    return {
        "list": items,
        "total": total,
        "hasMore": (page - 1) * size + len(items) < total,
        "nextCursor": "",
    }
