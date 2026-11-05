"""帖子服务：信息流、详情、发布、删除、点赞、收藏、他人动态。"""
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import BadRequest, Forbidden, NotFound
from app.models.collection import Collection
from app.models.follow import Follow
from app.models.like import Like
from app.models.post import Post, PostImage
from app.models.topic import PostTopic, Topic
from app.models.user import User
from app.repositories.interaction_repo import InteractionRepo
from app.repositories.post_repo import PostRepo, published_stmt, visibility_clause
from app.repositories.user_repo import UserRepo
from app.schemas.post import CreatePostRequest
from app.services.moderation import check_text
from app.services.vo import image_vo, post_vo
from app.utils.text import clean_text
from app.utils.time import fmt_dt, now_cn


async def _load_images(db: AsyncSession, post_ids: list[int]) -> dict[int, list[dict]]:
    if not post_ids:
        return {}
    rows = (
        await db.execute(
            select(PostImage.post_id, PostImage.url, PostImage.width, PostImage.height)
            .where(PostImage.post_id.in_(post_ids))
            .order_by(PostImage.post_id, PostImage.sort, PostImage.id)
        )
    ).all()
    grouped: dict[int, list[dict]] = {}
    for post_id, url, width, height in rows:
        grouped.setdefault(int(post_id), []).append(image_vo(url, width, height))
    return grouped


async def build_posts(db: AsyncSession, posts: list[Post], viewer_id: int | None) -> list[dict]:
    if not posts:
        return []
    post_ids = [int(p.id) for p in posts]
    author_ids = list({int(p.user_id) for p in posts})
    users = await UserRepo(db).list_by_ids(author_ids)
    images = await _load_images(db, post_ids)
    topic_pairs = await PostRepo(db).topics(post_ids)

    repo = InteractionRepo(db)
    liked = await repo.liked_ids(viewer_id, "post", post_ids) if viewer_id else set()
    collected = await repo.collected_ids(viewer_id, "post", post_ids) if viewer_id else set()
    following = await repo.following_ids(viewer_id, author_ids) if viewer_id else set()

    items = []
    for post in posts:
        topics = [
            {"id": str(int(topic_id)), "name": name}
            for topic_id, name in topic_pairs.get(int(post.id), [])
        ]
        images_of_post = images.get(int(post.id), [])
        if not images_of_post and post.cover_image:
            images_of_post = [image_vo(post.cover_image)]
        items.append(
            post_vo(
                post,
                author=users.get(int(post.user_id)),
                images=images_of_post,
                topics=topics,
                followed=int(post.user_id) in following,
                liked=int(post.id) in liked,
                collected=int(post.id) in collected,
                viewer_id=viewer_id,
            )
        )
    return items


def _cursor_id(cursor: str | int | None) -> int:
    try:
        return max(0, int(str(cursor or "0")))
    except (TypeError, ValueError):
        return 0


async def feed(db: AsyncSession, viewer_id: int | None, feed_type: str = "recommend",
               cursor: str | None = None, size: int = 10) -> dict:
    size = min(max(int(size or 10), 1), 30)
    stmt = published_stmt().where(visibility_clause(viewer_id))
    if feed_type == "follow":
        if not viewer_id:
            return {"list": [], "nextCursor": "", "hasMore": False}
        followees = select(Follow.followee_id).where(Follow.follower_id == viewer_id)
        stmt = stmt.where(Post.user_id.in_(followees))
    cursor_value = _cursor_id(cursor)
    if cursor_value:
        stmt = stmt.where(Post.id < cursor_value)
    rows = await PostRepo(db).all(stmt.order_by(Post.id.desc()).limit(size + 1))
    has_more = len(rows) > size
    visible = rows[:size]
    items = await build_posts(db, visible, viewer_id)
    return {
        "list": items,
        "nextCursor": str(int(visible[-1].id)) if has_more and visible else "",
        "hasMore": has_more,
    }


async def get_post_or_404(db: AsyncSession, post_id: int, viewer_id: int | None) -> Post:
    post = await db.get(Post, post_id)
    if not post:
        raise NotFound("内容不存在或已删除")
    # A09：hidden/deleted 对作者仍可读（返回 200 并带 status），对其他人一律 40401
    if int(post.user_id) != int(viewer_id or 0):
        if post.deleted or post.status in ("hidden", "deleted", "reviewing"):
            raise NotFound("内容不存在或已删除")
        if post.visibility == "private":
            raise NotFound("内容不存在或已删除")
        if post.visibility == "followers" and not viewer_id:
            raise Forbidden("仅关注者可见")
    return post


async def detail(db: AsyncSession, post_id: int, viewer_id: int | None) -> dict:
    post = await get_post_or_404(db, post_id, viewer_id)
    items = await build_posts(db, [post], viewer_id)
    return items[0]


async def create_post(db: AsyncSession, user: User, payload: CreatePostRequest) -> dict:
    content = clean_text(payload.content, 500)
    images = [u.strip() for u in (payload.images or []) if u and u.strip()][:9]
    if not content and not images:
        raise BadRequest("文字与图片不能同时为空")
    check_text(content, field_label="正文")

    topic_ids: list[int] = []
    for topic_id in (payload.topic_ids or [])[:3]:
        if await db.get(Topic, int(topic_id)):
            topic_ids.append(int(topic_id))

    post = Post(
        user_id=int(user.id),
        content=content,
        visibility=payload.visibility or "public",
        cover_image=images[0] if images else None,
        image_count=len(images),
        status="published",
        topic_id=topic_ids[0] if topic_ids else None,
        created_at=now_cn(),
    )
    db.add(post)
    await db.flush()

    for index, url in enumerate(images):
        db.add(PostImage(post_id=int(post.id), url=url, sort=index))
    for topic_id in topic_ids:
        db.add(PostTopic(post_id=int(post.id), topic_id=topic_id))
        await db.execute(
            update(Topic).where(Topic.id == topic_id).values(post_count=Topic.post_count + 1)
        )
    await db.flush()
    return {"post": {"id": str(int(post.id)), "status": post.status, "createdAt": fmt_dt(post.created_at) or ""}}


async def delete_post(db: AsyncSession, post_id: int, user: User) -> None:
    post = await db.get(Post, post_id)
    if not post or post.deleted:
        raise NotFound("内容不存在")
    if int(post.user_id) != int(user.id) and (user.role or "user") == "user":
        raise Forbidden("没有权限")
    post.deleted = 1
    post.status = "deleted"
    rows = await db.execute(select(PostTopic.topic_id).where(PostTopic.post_id == post_id))
    topic_ids = [int(topic_id) for (topic_id,) in rows]
    if topic_ids:
        await db.execute(
            update(Topic)
            .where(Topic.id.in_(topic_ids), Topic.post_count > 0)
            .values(post_count=Topic.post_count - 1)
        )
    await db.execute(delete(PostTopic).where(PostTopic.post_id == post_id))
    await db.flush()


async def toggle_like(db: AsyncSession, post_id: int, user_id: int, on: bool) -> dict:
    post = await db.get(Post, post_id)
    if not post or post.deleted:
        raise NotFound("内容不存在")
    repo = InteractionRepo(db)
    existing = await repo.find_like(user_id, "post", post_id)
    if on and not existing:
        db.add(Like(user_id=user_id, target_type="post", target_id=post_id))
        await db.execute(update(Post).where(Post.id == post_id).values(like_count=Post.like_count + 1))
        await db.flush()
        await db.refresh(post)
    elif not on and existing:
        await repo.remove_like(user_id, "post", post_id)
        await db.execute(
            update(Post)
            .where(Post.id == post_id, Post.like_count > 0)
            .values(like_count=Post.like_count - 1)
        )
        await db.flush()
        await db.refresh(post)
    return {"liked": bool(on), "likeCount": int(post.like_count or 0)}


async def toggle_collect(db: AsyncSession, post_id: int, user_id: int, on: bool) -> dict:
    post = await db.get(Post, post_id)
    if not post or post.deleted:
        raise NotFound("内容不存在")
    repo = InteractionRepo(db)
    existing = await repo.find_collection(user_id, "post", post_id)
    if on and not existing:
        db.add(Collection(user_id=user_id, target_type="post", target_id=post_id))
        await db.execute(
            update(Post).where(Post.id == post_id).values(collect_count=Post.collect_count + 1)
        )
        await db.flush()
        await db.refresh(post)
    elif not on and existing:
        await repo.remove_collection(user_id, "post", post_id)
        await db.execute(
            update(Post)
            .where(Post.id == post_id, Post.collect_count > 0)
            .values(collect_count=Post.collect_count - 1)
        )
        await db.flush()
        await db.refresh(post)
    return {"collected": bool(on), "collectCount": int(post.collect_count or 0)}


async def user_posts(db: AsyncSession, target_id: int, viewer_id: int | None,
                     page: int = 1, size: int = 10) -> dict:
    page = max(1, int(page or 1))
    size = min(max(int(size or 10), 1), 30)
    stmt = published_stmt().where(Post.user_id == target_id)
    if int(target_id) != int(viewer_id or 0):
        stmt = stmt.where(Post.visibility == "public")
    total = await PostRepo(db).count(stmt)
    rows = await PostRepo(db).all(
        stmt.order_by(Post.id.desc()).offset((page - 1) * size).limit(size)
    )
    items = [
        {
            "id": str(int(p.id)),
            "coverImage": p.cover_image or "",
            "content": (p.content or "")[:40],
            "imageCount": int(p.image_count or 0),
        }
        for p in rows
    ]
    return {
        "list": items,
        "total": total,
        "hasMore": (page - 1) * size + len(items) < total,
        "nextCursor": "",
    }


__all__ = [
    "build_posts",
    "create_post",
    "delete_post",
    "detail",
    "feed",
    "get_post_or_404",
    "toggle_collect",
    "toggle_like",
    "user_posts",
]
