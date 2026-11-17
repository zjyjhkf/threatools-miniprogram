"""管理端：话题管理、筛选条目（字典）维护、标签联想。

话题的作品数一律实时统计并回写 `topics.post_count/user_count`，
不会出现"小程序端已无作品、话题里还挂着旧计数却删不掉"的情况。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.routers.admin import current_admin
from app.core.errors import NotFound, ValidationBiz
from app.core.response import ok
from app.db.session import get_db
from app.models.admin_user import AdminUser
from app.models.post import Post
from app.models.topic import PostTopic, Topic
from app.services import dict_service
from app.utils.time import fmt_dt, now_cn

router = APIRouter(prefix="/admin", tags=["管理端-话题与字典"])


class TopicIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    name: str = Field(min_length=1, max_length=40)
    description: str = Field(default="", max_length=120)
    is_hot: bool = False
    sort: int = Field(default=0, ge=0, le=9999)


class TopicPatchIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=40)
    description: str | None = Field(default=None, max_length=120)
    is_hot: bool | None = None
    sort: int | None = Field(default=None, ge=0, le=9999)


class DictItemIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    group: str = Field(min_length=1, max_length=32)
    value: str = Field(min_length=1, max_length=40)
    label: str = Field(default="", max_length=60)
    sort: int = Field(default=0, ge=0, le=9999)


class DictItemPatchIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    group: str | None = Field(default=None, max_length=32)
    value: str | None = Field(default=None, max_length=40)
    label: str | None = Field(default=None, max_length=60)
    sort: int | None = Field(default=None, ge=0, le=9999)
    status: int | None = Field(default=None, ge=0, le=1)


async def _counts(db: AsyncSession, topic_ids: list[int]) -> dict[int, tuple[int, int]]:
    """实时统计话题下有效作品数与作者数（只算已发布且未删除）。"""
    if not topic_ids:
        return {}
    rows = (
        await db.execute(
            select(
                PostTopic.topic_id,
                func.count(Post.id),
                func.count(func.distinct(Post.user_id)),
            )
            .join(Post, Post.id == PostTopic.post_id)
            .where(PostTopic.topic_id.in_(topic_ids), Post.deleted == 0, Post.status == "published")
            .group_by(PostTopic.topic_id)
        )
    ).all()
    return {int(topic_id): (int(posts), int(users)) for topic_id, posts, users in rows}


def _topic_vo(topic: Topic, counts: tuple[int, int] | None) -> dict:
    posts, users = counts or (0, 0)
    return {
        "id": str(int(topic.id)),
        "name": topic.name,
        "description": topic.description or "",
        "isHot": bool(topic.is_hot),
        "sort": int(topic.sort or 0),
        "postCount": posts,
        "userCount": users,
        "createdAt": fmt_dt(topic.created_at) or "",
        "updatedAt": fmt_dt(topic.updated_at) or fmt_dt(topic.created_at) or "",
    }


def _sync_counts(topic: Topic, counts: tuple[int, int] | None) -> None:
    posts, users = counts or (0, 0)
    topic.post_count = posts
    topic.user_count = users


@router.get("/topics", summary="A131 话题列表（实时作品数）")
async def admin_topics(
    keyword: str = Query(""),
    has_posts: str = Query("", alias="hasPosts"),
    is_hot: str = Query("", alias="isHot"),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Topic)
    if keyword.strip():
        stmt = stmt.where(or_(Topic.name.like(f"%{keyword.strip()}%"), Topic.description.like(f"%{keyword.strip()}%")))
    if is_hot in ("1", "true"):
        stmt = stmt.where(Topic.is_hot == 1)

    # 用子查询过滤，保证 total 与分页同时正确
    active_topic_ids = (
        select(PostTopic.topic_id)
        .join(Post, Post.id == PostTopic.post_id)
        .where(Post.deleted == 0, Post.status == "published")
    )
    if has_posts in ("1", "true"):
        stmt = stmt.where(Topic.id.in_(active_topic_ids))
    elif has_posts in ("0", "false"):
        stmt = stmt.where(Topic.id.not_in(active_topic_ids))

    total = int((await db.scalar(select(func.count()).select_from(stmt.subquery()))) or 0)
    rows = list(
        (
            await db.execute(
                stmt.order_by(Topic.sort.desc(), Topic.id.asc()).offset((page - 1) * size).limit(size)
            )
        )
        .scalars()
        .all()
    )
    counts = await _counts(db, [int(item.id) for item in rows])

    for item in rows:
        _sync_counts(item, counts.get(int(item.id)))
    await db.flush()

    return ok(
        {
            "list": [_topic_vo(item, counts.get(int(item.id))) for item in rows],
            "total": total,
            "page": page,
            "size": size,
            "hasMore": (page - 1) * size + len(rows) < total,
        }
    )


@router.post("/topics", summary="A131 新建话题")
async def admin_create_topic(
    payload: TopicIn,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    name = payload.name.strip().lstrip("#")
    if not name:
        raise ValidationBiz("请填写话题名称")
    if await db.scalar(select(Topic.id).where(Topic.name == name)):
        raise ValidationBiz("话题名称已存在")
    now = now_cn()
    topic = Topic(
        name=name,
        description=payload.description.strip(),
        post_count=0,
        user_count=0,
        is_hot=1 if payload.is_hot else 0,
        sort=int(payload.sort),
        created_at=now,
        updated_at=now,
    )
    db.add(topic)
    await db.flush()
    return ok(_topic_vo(topic, (0, 0)))


async def _get_topic(db: AsyncSession, topic_id: int) -> Topic:
    topic = await db.get(Topic, topic_id)
    if not topic:
        raise NotFound("话题不存在")
    return topic


@router.patch("/topics/{topic_id}", summary="A131 编辑话题")
async def admin_update_topic(
    topic_id: int,
    payload: TopicPatchIn,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    topic = await _get_topic(db, topic_id)
    fields = payload.model_dump(exclude_unset=True)
    if "name" in fields and fields["name"] is not None:
        name = fields["name"].strip().lstrip("#")
        if not name:
            raise ValidationBiz("请填写话题名称")
        if await db.scalar(select(Topic.id).where(Topic.name == name, Topic.id != topic_id)):
            raise ValidationBiz("话题名称已存在")
        topic.name = name
    if "description" in fields and fields["description"] is not None:
        topic.description = fields["description"].strip()
    if "is_hot" in fields and fields["is_hot"] is not None:
        topic.is_hot = 1 if fields["is_hot"] else 0
    if "sort" in fields and fields["sort"] is not None:
        topic.sort = int(fields["sort"])
    topic.updated_at = now_cn()
    await db.flush()
    counts = await _counts(db, [topic_id])
    _sync_counts(topic, counts.get(topic_id))
    return ok(_topic_vo(topic, counts.get(topic_id)))


@router.delete("/topics/{topic_id}", summary="A131 删除话题（有作品时禁止）")
async def admin_delete_topic(
    topic_id: int,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    topic = await _get_topic(db, topic_id)
    counts = await _counts(db, [topic_id])
    posts = counts.get(topic_id, (0, 0))[0]
    if posts > 0:
        raise ValidationBiz(f"话题下仍有 {posts} 条作品，请先把作品移出该话题再删除")
    await db.execute(delete(PostTopic).where(PostTopic.topic_id == topic_id))
    await db.delete(topic)
    await db.flush()
    return ok({"id": str(topic_id), "deleted": True})


@router.get("/meta/items", summary="A132 筛选条目列表")
async def admin_dict_items(
    group: str = Query(""),
    keyword: str = Query(""),
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    return ok({"list": await dict_service.list_items(db, group, keyword)})


@router.post("/meta/items", summary="A132 新增筛选条目")
async def admin_create_dict_item(
    payload: DictItemIn,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    item = await dict_service.create_item(db, payload.group, payload.value, payload.label, payload.sort)
    return ok(item)


@router.patch("/meta/items/{item_id}", summary="A132 编辑筛选条目")
async def admin_update_dict_item(
    item_id: int,
    payload: DictItemPatchIn,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    return ok(await dict_service.update_item(db, item_id, payload.model_dump(exclude_unset=True)))


@router.delete("/meta/items/{item_id}", summary="A132 删除筛选条目")
async def admin_delete_dict_item(
    item_id: int,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    return ok(await dict_service.delete_item(db, item_id))


@router.get("/tags/suggest", summary="A133 标签联想")
async def admin_tag_suggest(
    group: str = Query("product_tag"),
    keyword: str = Query("", alias="q"),
    limit: int = Query(10, ge=1, le=30),
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    if group not in ("product_tag", "course_tag"):
        raise ValidationBiz("仅支持 product_tag / course_tag")
    return ok({"tags": await dict_service.suggest_tags(db, group, keyword, limit)})
