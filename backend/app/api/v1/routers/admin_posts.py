"""管理端内容（作品）管理：A91 列表/详情、A92 审核、删除。

管理端与小程序端共用同一个 MySQL：
- 删除为软删（`status='deleted'`、`deleted=1`），小程序端 feed 与详情立即不可见；
- 审核结果写回 `posts.review_status`，同时记录审核人、时间与驳回原因。
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.routers.admin import current_admin
from app.core.errors import NotFound, ValidationBiz
from app.core.response import ok
from app.db.session import get_db
from app.models.admin_user import AdminUser
from app.models.comment import Comment
from app.models.post import Post, PostImage
from app.models.topic import PostTopic, Topic
from app.models.user import User
from app.utils.time import fmt_dt, now_cn

router = APIRouter(prefix="/admin", tags=["管理端-内容"])

EXCERPT_SIZE = 60
RECENT_COMMENT_SIZE = 5
REVIEW_STATUSES = ("pending", "approved", "rejected")
POST_STATUSES = ("published", "hidden", "deleted")


class ReviewIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    action: Literal["approve", "reject", "restore"]
    reason: str | None = Field(default=None, max_length=100)


class PostImageIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    url: str = Field(min_length=1, max_length=512)
    width: int = Field(default=0, ge=0)
    height: int = Field(default=0, ge=0)


class PostPatchIn(BaseModel):
    """管理端编辑作品：标题、正文、封面、图片、话题、可见性、运动摘要。"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    title: str | None = Field(default=None, max_length=60)
    content: str | None = Field(default=None, max_length=2000)
    cover: str | None = Field(default=None, max_length=512)
    visibility: str | None = None
    topic_ids: list[int] | None = Field(default=None, max_length=5)
    metric: dict | None = None
    images: list[PostImageIn] | None = Field(default=None, max_length=9)


def _excerpt(text: str) -> str:
    flat = " ".join((text or "").split())
    return flat[:EXCERPT_SIZE] + ("…" if len(flat) > EXCERPT_SIZE else "")


def _post_status(post: Post) -> str:
    if post.deleted or post.status == "deleted":
        return "deleted"
    if post.status == "hidden":
        return "hidden"
    return "published"


def _parse_day(value: str) -> datetime | None:
    try:
        return datetime.strptime((value or "").strip(), "%Y-%m-%d")
    except (TypeError, ValueError):
        return None


def _reviewer_vo(admin: AdminUser | None) -> dict | None:
    if not admin:
        return None
    return {"id": str(int(admin.id)), "username": admin.username or ""}


def _list_vo(
    post: Post,
    *,
    author: User | None,
    topics: list[dict],
    image_count: int,
    reviewer: AdminUser | None,
) -> dict:
    return {
        "id": str(int(post.id)),
        "title": (post.title or "").strip() or (post.content or "")[:24],
        "contentExcerpt": _excerpt(post.content),
        "cover": post.cover_image or "",
        "author": {
            "id": str(int(post.user_id)),
            "nickname": (author.nickname if author else "") or "匿名用户",
            "avatar": (author.avatar if author else "") or "",
        },
        "topics": topics,
        "imageCount": int(image_count),
        "likeCount": int(post.like_count or 0),
        "commentCount": int(post.comment_count or 0),
        "collectCount": int(post.collect_count or 0),
        "visibility": post.visibility or "public",
        "status": _post_status(post),
        "reviewStatus": post.review_status or "approved",
        "reviewReason": post.review_reason or "",
        "reviewedBy": _reviewer_vo(reviewer),
        "reviewedAt": fmt_dt(post.reviewed_at),
        "createdAt": fmt_dt(post.created_at) or "",
    }


async def _load_authors(db: AsyncSession, posts: list[Post]) -> dict[int, User]:
    ids = {int(item.user_id) for item in posts}
    if not ids:
        return {}
    rows = (await db.execute(select(User).where(User.id.in_(ids)))).scalars().all()
    return {int(item.id): item for item in rows}


async def _load_topics(db: AsyncSession, post_ids: list[int]) -> dict[int, list[dict]]:
    result: dict[int, list[dict]] = {}
    if not post_ids:
        return result
    rows = (
        await db.execute(
            select(PostTopic.post_id, Topic.id, Topic.name)
            .join(Topic, Topic.id == PostTopic.topic_id)
            .where(PostTopic.post_id.in_(post_ids))
            .order_by(PostTopic.post_id.asc(), Topic.id.asc())
        )
    ).all()
    for post_id, topic_id, name in rows:
        result.setdefault(int(post_id), []).append({"id": str(int(topic_id)), "name": name})
    return result


async def _load_image_counts(db: AsyncSession, post_ids: list[int]) -> dict[int, int]:
    if not post_ids:
        return {}
    rows = (
        await db.execute(
            select(PostImage.post_id, func.count())
            .where(PostImage.post_id.in_(post_ids))
            .group_by(PostImage.post_id)
        )
    ).all()
    return {int(post_id): int(count) for post_id, count in rows}


async def _load_reviewers(db: AsyncSession, posts: list[Post]) -> dict[int, AdminUser]:
    ids = {int(item.reviewed_by) for item in posts if item.reviewed_by}
    if not ids:
        return {}
    rows = (await db.execute(select(AdminUser).where(AdminUser.id.in_(ids)))).scalars().all()
    return {int(item.id): item for item in rows}


@router.get("/posts", summary="A91 内容列表")
async def admin_posts(
    keyword: str = Query(""),
    review_status: str = Query("", alias="reviewStatus"),
    status: str = Query(""),
    visibility: str = Query(""),
    author_id: int | None = Query(None, alias="authorId"),
    topic_id: int | None = Query(None, alias="topicId"),
    start_date: str = Query("", alias="startDate"),
    end_date: str = Query("", alias="endDate"),
    sort: str = Query("newest"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Post)
    if status == "deleted":
        stmt = stmt.where(or_(Post.deleted == 1, Post.status == "deleted"))
    else:
        stmt = stmt.where(Post.deleted == 0, Post.status != "deleted")
        if status in ("published", "hidden"):
            stmt = stmt.where(Post.status == status)

    if review_status in REVIEW_STATUSES:
        stmt = stmt.where(Post.review_status == review_status)
    if visibility in ("public", "followers", "private"):
        stmt = stmt.where(Post.visibility == visibility)
    if keyword.strip():
        pattern = f"%{keyword.strip()}%"
        stmt = stmt.where(or_(Post.title.like(pattern), Post.content.like(pattern)))
    if author_id:
        stmt = stmt.where(Post.user_id == author_id)
    if topic_id:
        stmt = stmt.where(Post.id.in_(select(PostTopic.post_id).where(PostTopic.topic_id == topic_id)))

    start_at = _parse_day(start_date)
    end_at = _parse_day(end_date)
    if start_at:
        stmt = stmt.where(Post.created_at >= start_at)
    if end_at:
        stmt = stmt.where(Post.created_at < end_at + timedelta(days=1))

    total = int((await db.scalar(select(func.count()).select_from(stmt.subquery()))) or 0)
    order = {
        "oldest": (Post.created_at.asc(), Post.id.asc()),
        "hot": (Post.like_count.desc(), Post.id.desc()),
    }.get(sort, (Post.created_at.desc(), Post.id.desc()))
    rows = list((await db.execute(stmt.order_by(*order).offset((page - 1) * size).limit(size))).scalars().all())

    post_ids = [int(item.id) for item in rows]
    authors = await _load_authors(db, rows)
    topics = await _load_topics(db, post_ids)
    images = await _load_image_counts(db, post_ids)
    reviewers = await _load_reviewers(db, rows)

    return ok(
        {
            "list": [
                _list_vo(
                    item,
                    author=authors.get(int(item.user_id)),
                    topics=topics.get(int(item.id), []),
                    image_count=images.get(int(item.id), 0),
                    reviewer=reviewers.get(int(item.reviewed_by)) if item.reviewed_by else None,
                )
                for item in rows
            ],
            "total": total,
            "page": page,
            "size": size,
            "hasMore": (page - 1) * size + len(rows) < total,
        }
    )


@router.get("/posts/{post_id}", summary="A91 内容详情")
async def admin_post_detail(
    post_id: int,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    post = await db.get(Post, post_id)
    if not post:
        raise NotFound("内容不存在")
    author = await db.get(User, int(post.user_id))
    topics = await _load_topics(db, [post_id])
    reviewer = await db.get(AdminUser, int(post.reviewed_by)) if post.reviewed_by else None
    images = list(
        (
            await db.execute(
                select(PostImage).where(PostImage.post_id == post_id).order_by(PostImage.sort.asc(), PostImage.id.asc())
            )
        ).scalars().all()
    )
    comments = (
        await db.execute(
            select(Comment, User)
            .join(User, User.id == Comment.user_id)
            .where(Comment.post_id == post_id, Comment.status != "deleted")
            .order_by(Comment.id.desc())
            .limit(RECENT_COMMENT_SIZE)
        )
    ).all()

    detail = _list_vo(
        post,
        author=author,
        topics=topics.get(post_id, []),
        image_count=len(images),
        reviewer=reviewer,
    )
    detail.update(
        {
            "content": post.content or "",
            "metric": post.metric if isinstance(post.metric, dict) else None,
            "cover": post.cover_image or "",
            "images": [
                {
                    "id": str(int(item.id)),
                    "url": item.url,
                    "width": int(item.width or 0),
                    "height": int(item.height or 0),
                }
                for item in images
            ],
            "recentComments": [
                {
                    "id": str(int(comment.id)),
                    "user": {
                        "id": str(int(comment.user_id)),
                        "nickname": (user.nickname if user else "") or "匿名用户",
                        "avatar": (user.avatar if user else "") or "",
                    },
                    "content": comment.content or "",
                    "createdAt": fmt_dt(comment.created_at) or "",
                }
                for comment, user in comments
            ],
            "auditTrail": [],
        }
    )
    return ok(detail)


@router.post("/posts/{post_id}/review", summary="A92 内容审核")
async def admin_review_post(
    post_id: int,
    payload: ReviewIn,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    post = await db.get(Post, post_id)
    if not post:
        raise NotFound("内容不存在")

    before = (post.status, post.review_status, post.review_reason or "")
    if payload.action == "reject":
        reason = (payload.reason or "").strip()
        if not reason:
            raise ValidationBiz("请填写驳回原因")
        post.status = "hidden"
        post.deleted = 0
        post.review_status = "rejected"
        post.review_reason = reason
    else:
        post.status = "published"
        post.deleted = 0
        post.review_status = "approved"
        post.review_reason = ""

    post.reviewed_by = int(admin.id)
    post.reviewed_at = now_cn()
    await db.commit()

    after = (post.status, post.review_status, post.review_reason or "")
    return ok(
        {
            "post": {
                "id": str(int(post.id)),
                "status": _post_status(post),
                "reviewStatus": post.review_status,
                "reviewReason": post.review_reason or "",
                "reviewedBy": _reviewer_vo(admin),
                "reviewedAt": fmt_dt(post.reviewed_at),
            },
            "changed": before != after,
        }
    )


async def _recount_topics(db: AsyncSession, topic_ids: list[int]) -> None:
    """按数据库实时重算话题作品数与作者数，避免小程序端与后台计数不一致。"""
    for topic_id in {int(item) for item in topic_ids}:
        posts, users = (
            await db.execute(
                select(func.count(Post.id), func.count(func.distinct(Post.user_id)))
                .select_from(PostTopic)
                .join(Post, Post.id == PostTopic.post_id)
                .where(PostTopic.topic_id == topic_id, Post.deleted == 0, Post.status == "published")
            )
        ).one()
        await db.execute(
            update(Topic)
            .where(Topic.id == topic_id)
            .values(post_count=int(posts or 0), user_count=int(users or 0))
        )


@router.patch("/posts/{post_id}", summary="A92 编辑内容")
async def admin_update_post(
    post_id: int,
    payload: PostPatchIn,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    post = await db.get(Post, post_id)
    if not post or post.deleted:
        raise NotFound("内容不存在")

    fields = payload.model_dump(exclude_unset=True)
    if "title" in fields and fields["title"] is not None:
        post.title = fields["title"].strip()[:80]
    if "content" in fields and fields["content"] is not None:
        post.content = fields["content"].strip()[:1000]
    if "visibility" in fields and fields["visibility"] is not None:
        if fields["visibility"] not in ("public", "followers", "private"):
            raise ValidationBiz("可见范围不合法")
        post.visibility = fields["visibility"]
    if "metric" in fields and isinstance(fields["metric"], dict):
        post.metric = fields["metric"]

    old_topic_ids = [
        int(item)
        for item in (await db.execute(select(PostTopic.topic_id).where(PostTopic.post_id == post_id))).scalars().all()
    ]
    topic_ids = fields.get("topic_ids")
    if topic_ids is not None:
        wanted = [int(item) for item in topic_ids][:5]
        valid: set[int] = set()
        if wanted:
            valid = {
                int(item) for item in (await db.execute(select(Topic.id).where(Topic.id.in_(wanted)))).scalars().all()
            }
        wanted = [item for item in wanted if item in valid]
        await db.execute(delete(PostTopic).where(PostTopic.post_id == post_id))
        for sort, topic_id in enumerate(wanted):
            db.add(PostTopic(post_id=post_id, topic_id=topic_id))
        post.topic_id = wanted[0] if wanted else None
        topic_ids = wanted

    images = fields.get("images")
    if images is not None:
        await db.execute(delete(PostImage).where(PostImage.post_id == post_id))
        for sort, item in enumerate(images):
            db.add(
                PostImage(
                    post_id=post_id,
                    url=item["url"],
                    width=int(item["width"] or 0) or None,
                    height=int(item["height"] or 0) or None,
                    sort=sort,
                )
            )
        post.image_count = len(images)
        if images and not (fields.get("cover") or "").strip():
            post.cover_image = images[0]["url"]

    if "cover" in fields and fields["cover"] is not None:
        post.cover_image = fields["cover"].strip()

    post.updated_at = now_cn()
    await db.flush()
    await _recount_topics(db, [*old_topic_ids, *(topic_ids or [])])

    author = await db.get(User, int(post.user_id))
    topics = await _load_topics(db, [post_id])
    image_count = int(
        await db.scalar(select(func.count()).select_from(PostImage).where(PostImage.post_id == post_id)) or 0
    )
    reviewer = await db.get(AdminUser, int(post.reviewed_by)) if post.reviewed_by else None
    await db.commit()
    return ok(
        {
            "post": _list_vo(
                post,
                author=author,
                topics=topics.get(post_id, []),
                image_count=image_count,
                reviewer=reviewer,
            )
        }
    )


@router.delete("/posts/{post_id}", summary="A92 删除内容")
async def admin_delete_post(
    post_id: int,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    post = await db.get(Post, post_id)
    if not post:
        raise NotFound("内容不存在")

    if not post.deleted:
        post.deleted = 1
        post.status = "deleted"
        post.reviewed_by = int(admin.id)
        post.reviewed_at = now_cn()

    result = await db.execute(
        update(Comment).where(Comment.post_id == post_id, Comment.status != "deleted").values(status="deleted")
    )
    affected = int(result.rowcount or 0)

    topic_ids = [
        int(item)
        for item in (await db.execute(select(PostTopic.topic_id).where(PostTopic.post_id == post_id))).scalars().all()
    ]
    await _recount_topics(db, topic_ids)

    await db.commit()
    return ok({"deleted": True, "affectedComments": affected})
