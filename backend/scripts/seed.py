"""种子数据导入：把 0.1 前端 mock 数据写入 MySQL。

用法：
    python -m scripts.seed          # 表内已有用户时跳过
    python -m scripts.seed --force  # 清空业务表后重新导入
"""
import argparse
import asyncio
import json
import os
import sys
from datetime import date, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from sqlalchemy import delete, func, select  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.db.session import async_session_factory, engine  # noqa: E402
from app.models.body_profile import BodyProfile  # noqa: E402
from app.models.collection import Collection  # noqa: E402
from app.models.comment import Comment  # noqa: E402
from app.models.course import Chapter, Course  # noqa: E402
from app.models.follow import Follow  # noqa: E402
from app.models.like import Like  # noqa: E402
from app.models.post import Post, PostImage  # noqa: E402
from app.models.product import Product, ProductImage  # noqa: E402
from app.models.topic import PostTopic, Topic  # noqa: E402
from app.models.user import User  # noqa: E402

DATA_DIR = os.path.join(ROOT, "seeds", "data")
SEED_IMG_DIR = os.path.join(ROOT, "uploads", "seed")
DT_FMT = "%Y-%m-%d %H:%M:%S"


def asset(name: str) -> str:
    """种子占位图的对外 URL（由 scripts/gen_placeholders.py 生成），缺失返回空串。"""
    if not os.path.exists(os.path.join(SEED_IMG_DIR, name)):
        return ""
    return f"{settings.UPLOAD_URL_PREFIX.rstrip('/')}/uploads/seed/{name}"


def load(name: str):
    with open(os.path.join(DATA_DIR, f"{name}.json"), encoding="utf-8") as fp:
        return json.load(fp)


def dt(value: str | None):
    if not value:
        return None
    for fmt in (DT_FMT, "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


async def clear(db) -> None:
    for model in (
        Comment,
        PostTopic,
        PostImage,
        Post,
        Chapter,
        Course,
        ProductImage,
        Product,
        Collection,
        Like,
        Follow,
        BodyProfile,
        Topic,
        User,
    ):
        await db.execute(delete(model))
    await db.commit()


async def has_users(db) -> bool:
    return bool(await db.scalar(select(func.count()).select_from(User)))


async def seed(with_posts: bool = False) -> None:
    users = load("users")
    topics = load("topics")
    courses = load("courses")
    products = load("products")
    # 示例作品默认不导入：社区内容应由运营在后台上架，避免“删了又回来”
    posts = load("posts") if with_posts else []
    comments = load("comments") if with_posts else {}

    async with async_session_factory() as db:
        for raw in users:
            user_id = int(raw["id"])
            birthday = raw.get("birthday")
            db.add(
                User(
                    id=user_id,
                    open_id=f"seed_openid_{user_id}",
                    nickname=raw.get("nickname") or f"运动用户{user_id}",
                    avatar=raw.get("avatar") or asset(f"avatar-{user_id}.jpg"),
                    gender=raw.get("gender") or "secret",
                    birthday=date.fromisoformat(birthday) if birthday else None,
                    city=raw.get("city") or "",
                    bio=raw.get("bio") or "",
                    wechat_id=raw.get("wechatId") or "",
                    profile_visibility=raw.get("profileVisibility") or "self",
                    role="user",
                    status=1,
                    created_at=dt(raw.get("createdAt")),
                )
            )
            profile = raw.get("bodyProfile") or {}
            db.add(
                BodyProfile(
                    user_id=user_id,
                    height=profile.get("height"),
                    weight=profile.get("weight"),
                    goals=profile.get("goals") or [],
                    frequency=profile.get("frequency"),
                    level=profile.get("level"),
                    focus_parts=profile.get("focusParts") or [],
                    injuries=profile.get("injuries") or "",
                    allow_public=bool(profile.get("allowPublic")),
                )
            )

        for raw in topics:
            db.add(
                Topic(
                    id=int(raw["id"]),
                    name=raw["name"],
                    description=raw.get("description") or "",
                    user_count=int(raw.get("userCount") or 0),
                    post_count=int(raw.get("postCount") or 0),
                    is_hot=1 if raw.get("isHot") else 0,
                    sort=int(raw.get("sort") or 0),
                    created_at=dt(raw.get("createdAt")),
                )
            )

        for raw in courses:
            course_id = int(raw["id"])
            db.add(
                Course(
                    id=course_id,
                    title=raw["title"],
                    cover=raw.get("cover") or asset(f"course-{course_id}.jpg"),
                    video_cover=raw.get("videoCover") or asset(f"course-{course_id}.jpg"),
                    duration=int(raw.get("duration") or 0),
                    action_count=int(raw.get("actionCount") or 0),
                    difficulty=raw.get("difficulty") or "beginner",
                    category=raw.get("category") or "rehab",
                    coach_name=raw.get("coachName") or "",
                    coach_avatar=raw.get("coachAvatar") or asset("avatar-100001.jpg"),
                    coach_title=raw.get("coachTitle") or "",
                    intro=raw.get("intro") or "",
                    suitable_for=raw.get("suitableFor") or [],
                    related_ids=[int(x) for x in (raw.get("relatedIds") or [])],
                    learn_count=int(raw.get("learnCount") or 0),
                    collect_count=int(raw.get("collectCount") or 0),
                    is_main=1 if raw.get("isMain") else 0,
                    sort=int(raw.get("sort") or 0),
                    status=1,
                )
            )
            for chapter in raw.get("chapters") or []:
                db.add(
                    Chapter(
                        id=int(chapter["id"]),
                        course_id=course_id,
                        idx=int(chapter.get("idx") or 0),
                        title=chapter.get("title") or "",
                        duration=int(chapter.get("duration") or 0),
                        video_url=chapter.get("videoUrl") or "",
                        locked=1 if chapter.get("locked") else 0,
                    )
                )

        for raw in products:
            product_id = int(raw["id"])
            video = raw.get("video") or {}
            db.add(
                Product(
                    id=product_id,
                    name=raw["name"],
                    model=raw.get("model") or "",
                    category=raw.get("category") or "rehab",
                    tagline=raw.get("tagline") or "",
                    tags=raw.get("tags") or [],
                    cover=raw.get("cover") or asset(f"product-{product_id}-1.jpg"),
                    features=raw.get("features") or [],
                    specs=raw.get("specs") or [],
                    suitable_for=raw.get("suitableFor") or [],
                    video_cover=video.get("cover") or "",
                    video_url=video.get("url") or "",
                    video_duration=int(video.get("duration") or 0),
                    related_ids=[int(x) for x in (raw.get("relatedIds") or [])],
                    collect_count=int(raw.get("collectCount") or 0),
                    sort=int(raw.get("sort") or 0),
                    status=int(raw.get("status") or 1),
                )
            )
            raw_images = [
                (item.get("url") if isinstance(item, dict) else item) or ""
                for item in (raw.get("images") or [])
            ]
            urls = [url for url in raw_images if url] or [
                asset(f"product-{product_id}-{shot}.jpg") for shot in range(1, 5)
            ]
            for index, url in enumerate([url for url in urls if url]):
                db.add(ProductImage(product_id=product_id, url=url, sort=index))

        for raw in posts:
            post_id = int(raw["id"])
            topic_ids = [int(x) for x in (raw.get("topicIds") or [])]
            # 种子里的图只给尺寸、不给 URL：统一回填本地占位图，尺寸必须落库（决定 D01 卡片高度）
            images = []
            for raw_image in (raw.get("images") or []):
                if not isinstance(raw_image, dict):
                    continue
                url = (raw_image.get("url") or "").strip() or asset(f"post-{post_id}.jpg")
                if not url:
                    continue
                images.append(
                    {
                        "url": url,
                        "width": int(raw_image.get("width") or 1200),
                        "height": int(raw_image.get("height") or 900),
                    }
                )
            if not images:
                image_url = asset(f"post-{post_id}.jpg")
                if image_url:
                    images = [{"url": image_url, "width": 900, "height": 900}]
            db.add(
                Post(
                    id=post_id,
                    user_id=int(raw["userId"]),
                    title=(raw.get("title") or "").strip() or None,
                    metric=raw.get("metric") or None,
                    content=raw.get("content") or "",
                    visibility=raw.get("visibility") or "public",
                    cover_image=(images[0].get("url") if images else "") or "",
                    image_count=len(images),
                    like_count=int(raw.get("likeCount") or 0),
                    comment_count=int(raw.get("commentCount") or 0),
                    collect_count=int(raw.get("collectCount") or 0),
                    topic_id=topic_ids[0] if topic_ids else None,
                    status=raw.get("status") or "published",
                    created_at=dt(raw.get("createdAt")),
                )
            )
            for index, image in enumerate(images):
                db.add(
                    PostImage(
                        post_id=post_id,
                        url=image.get("url") or "",
                        width=int(image.get("width") or 1200),
                        height=int(image.get("height") or 900),
                        sort=index,
                    )
                )
            for topic_id in topic_ids:
                db.add(PostTopic(post_id=post_id, topic_id=topic_id))

        for post_id, items in comments.items():
            for raw in items:
                db.add(
                    Comment(
                        id=int(raw["id"]),
                        post_id=int(post_id),
                        user_id=int(raw["userId"]),
                        parent_id=int(raw.get("parentId") or 0),
                        reply_to_user_id=int(raw["replyToUserId"]) if raw.get("replyToUserId") else None,
                        content=raw.get("content") or "",
                        like_count=int(raw.get("likeCount") or 0),
                        status="normal",
                        created_at=dt(raw.get("createdAt")),
                    )
                )
                for child in raw.get("children") or []:
                    db.add(
                        Comment(
                            id=int(child["id"]),
                            post_id=int(post_id),
                            user_id=int(child["userId"]),
                            parent_id=int(child.get("parentId") or raw["id"]),
                            reply_to_user_id=int(child["replyToUserId"])
                            if child.get("replyToUserId")
                            else None,
                            content=child.get("content") or "",
                            like_count=int(child.get("likeCount") or 0),
                            status="normal",
                            created_at=dt(child.get("createdAt")),
                        )
                    )
        await db.commit()

    print(
        f"seed done: users={len(users)} topics={len(topics)} courses={len(courses)} "
        f"products={len(products)} posts={len(posts)}"
    )


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="清空业务表后重新导入")
    parser.add_argument(
        "--with-posts",
        action="store_true",
        help="同时导入示例作品与评论（默认不导入，社区内容由后台上架）",
    )
    args = parser.parse_args()

    async with async_session_factory() as db:
        if await has_users(db):
            if not args.force:
                print("skip: users 表已有数据（加 --force 重新导入）")
                return
            await clear(db)
            print("cleared business tables")
    await seed(with_posts=args.with_posts)


async def _run() -> None:
    try:
        await main()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(_run())
