"""话题服务：热门、全部、详情、话题下帖子、搜索、创建。"""
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import BadRequest, NotFound
from app.models.post import Post
from app.models.topic import PostTopic, Topic
from app.repositories.interaction_repo import InteractionRepo
from app.repositories.post_repo import published_stmt, visibility_clause
from app.repositories.topic_repo import TopicRepo
from app.services.post_service import build_posts
from app.services.vo import topic_vo
from app.utils.text import clean_text
from app.utils.time import now_cn


async def hot(db: AsyncSession, limit: int = 10) -> dict:
    limit = min(max(int(limit or 10), 1), 30)
    rows = await TopicRepo(db).all(
        select(Topic)
        .where(Topic.is_hot == 1)
        .order_by(Topic.sort.desc(), Topic.id.asc())
        .limit(limit)
    )
    return {"list": [topic_vo(t) for t in rows]}


async def list_topics(db: AsyncSession, page: int = 1, size: int = 12) -> dict:
    page = max(1, int(page or 1))
    size = min(max(int(size or 12), 1), 30)
    total = await TopicRepo(db).count(select(Topic))
    rows = await TopicRepo(db).all(
        select(Topic)
        .order_by(Topic.user_count.desc(), Topic.id.asc())
        .offset((page - 1) * size)
        .limit(size)
    )
    return {
        "list": [topic_vo(t) for t in rows],
        "total": total,
        "hasMore": (page - 1) * size + len(rows) < total,
        "nextCursor": "",
    }


async def detail(db: AsyncSession, topic_id: int, viewer_id: int | None = None) -> dict:
    topic = await db.get(Topic, topic_id)
    if not topic:
        raise NotFound("话题不存在")
    collected = False
    if viewer_id:
        collected = int(topic_id) in await InteractionRepo(db).collected_ids(
            viewer_id, "topic", [int(topic_id)]
        )
    return topic_vo(topic, collected=collected)


async def posts(db: AsyncSession, topic_id: int, viewer_id: int | None, sort: str = "new",
                cursor: str | None = None, size: int = 10) -> dict:
    if not await db.get(Topic, topic_id):
        raise NotFound("话题不存在")
    size = min(max(int(size or 10), 1), 30)
    stmt = (
        published_stmt()
        .join(PostTopic, PostTopic.post_id == Post.id)
        .where(PostTopic.topic_id == topic_id, visibility_clause(viewer_id))
    )
    total = await TopicRepo(db).count(stmt)
    try:
        cursor_value = max(0, int(str(cursor or "0")))
    except (TypeError, ValueError):
        cursor_value = 0
    if cursor_value:
        stmt = stmt.where(Post.id < cursor_value)
    order = Post.like_count.desc() if sort == "hot" else Post.id.desc()
    rows = await TopicRepo(db).all(stmt.order_by(order).limit(size + 1))
    has_more = len(rows) > size
    visible = rows[:size]
    items = await build_posts(db, visible, viewer_id)
    return {
        "list": items,
        "total": total,
        "nextCursor": str(int(visible[-1].id)) if has_more and visible else "",
        "hasMore": has_more,
    }


async def search(db: AsyncSession, keyword: str) -> dict:
    keyword = clean_text(keyword, 40)
    stmt = select(Topic)
    if keyword:
        stmt = stmt.where(Topic.name.like(f"%{keyword}%"))
    rows = await TopicRepo(db).all(stmt.order_by(Topic.post_count.desc()).limit(20))
    return {"list": [topic_vo(t) for t in rows]}


async def create(db: AsyncSession, name: str, user_id: int) -> dict:
    name = clean_text(name, 20)
    if len(name) < 2:
        raise BadRequest("话题名需 2–20 个字")
    existed = await TopicRepo(db).scalar(select(Topic).where(Topic.name == name))
    if existed:
        return {"topic": topic_vo(existed), "existed": True}
    topic = Topic(
        name=name,
        description="",
        user_count=1,
        post_count=0,
        is_hot=0,
        sort=0,
        created_at=now_cn(),
    )
    db.add(topic)
    await db.flush()
    return {"topic": topic_vo(topic), "existed": False}


async def count_posts(db: AsyncSession, topic_id: int) -> int:
    total = await db.execute(
        select(func.count()).select_from(PostTopic).where(PostTopic.topic_id == topic_id)
    )
    return int(total.scalar() or 0)
