"""用户服务：我的资料、身体档案、完善度、他人主页、收藏、关注。"""
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import BadRequest, NotFound
from app.models.body_profile import BodyProfile
from app.models.collection import Collection
from app.models.course import Course
from app.models.follow import Follow
from app.models.post import Post
from app.models.product import Product, ProductImage
from app.models.user import User
from app.repositories.interaction_repo import InteractionRepo
from app.repositories.user_repo import UserRepo
from app.services.vo import completeness_of, profile_vo, user_vo
from app.utils.text import clean_text
from app.utils.time import fmt_dt, now_cn


async def _stats(db: AsyncSession, user_id: int) -> dict:
    return await UserRepo(db).stats(user_id)


async def me(db: AsyncSession, user: User) -> dict:
    repo = UserRepo(db)
    profile = await repo.profile(int(user.id))
    stats = await repo.stats(int(user.id))
    return user_vo(
        user,
        self=True,
        profile=profile,
        post_count=stats["post_count"],
        like_count=stats["like_received_count"],
        follow_count=stats["follower_count"],
    )


async def update_profile(db: AsyncSession, user: User, payload) -> dict:
    data = payload.model_dump(exclude_unset=True) if hasattr(payload, "model_dump") else dict(payload or {})
    for field in ("nickname", "avatar", "gender", "birthday", "city", "bio", "wechat_id", "profile_visibility"):
        if field in data and data[field] is not None:
            value = data[field]
            if field in ("nickname", "city", "bio", "wechat_id"):
                value = clean_text(str(value), {"nickname": 32, "city": 64, "bio": 100, "wechat_id": 64}[field])
            if field == "avatar":
                value = str(value)[:512]
            setattr(user, field, value)
    await db.flush()
    return {"user": await me(db, user)}


async def get_body_profile(db: AsyncSession, user: User) -> dict:
    profile = await UserRepo(db).profile(int(user.id))
    return profile_vo(profile)


async def save_body_profile(db: AsyncSession, user: User, payload) -> dict:
    data = payload.model_dump(exclude_unset=True) if hasattr(payload, "model_dump") else dict(payload or {})
    profile = await UserRepo(db).profile(int(user.id))
    if not profile:
        profile = BodyProfile(user_id=int(user.id))
        db.add(profile)

    mapping = {
        "height": "height",
        "weight": "weight",
        "goals": "goals",
        "frequency": "frequency",
        "level": "level",
        "focus_parts": "focus_parts",
        "injuries": "injuries",
        "allow_public": "allow_public",
    }
    for source, target in mapping.items():
        if source in data and data[source] is not None:
            setattr(profile, target, data[source])
    if profile.height is not None and not (80 <= int(profile.height) <= 250):
        raise BadRequest("身高需在 80–250cm 之间")
    if profile.weight is not None and not (20 <= float(profile.weight) <= 300):
        raise BadRequest("体重需在 20–300kg 之间")
    await db.flush()
    return {
        "bodyProfile": profile_vo(profile),
        "completeness": completeness_of(user, profile),
    }


async def completeness(db: AsyncSession, user: User) -> dict:
    profile = await UserRepo(db).profile(int(user.id))
    return completeness_of(user, profile)


async def user_home(db: AsyncSession, target_id: int, viewer_id: int | None) -> dict:
    target = await db.get(User, target_id)
    if not target or target.status != 1:
        raise NotFound("用户不存在")
    is_self = int(viewer_id or 0) == int(target_id)
    if (target.profile_visibility or "self") == "self" and not is_self:
        raise NotFound("用户不存在")

    repo = UserRepo(db)
    profile = await repo.profile(int(target_id))
    stats = await repo.stats(int(target_id))
    followed = await InteractionRepo(db).is_following(int(viewer_id or 0), int(target_id))
    return user_vo(
        target,
        self=is_self,
        profile=profile,
        post_count=stats["post_count"],
        like_count=stats["like_received_count"],
        follow_count=stats["follower_count"],
        followed=followed,
    )


async def toggle_follow(db: AsyncSession, user: User, target_id: int, on: bool) -> dict:
    if int(user.id) == int(target_id):
        raise BadRequest("不能关注自己")
    target = await db.get(User, target_id)
    if not target or target.status != 1:
        raise NotFound("用户不存在")
    repo = InteractionRepo(db)
    existing = await repo.find_follow(int(user.id), int(target_id))
    if on and not existing:
        db.add(Follow(follower_id=int(user.id), followee_id=int(target_id), created_at=now_cn()))
        await db.flush()
    elif not on and existing:
        await repo.remove_follow(int(user.id), int(target_id))
        await db.flush()
    return {"followed": bool(on), "followCount": await repo.follower_count(int(target_id))}


async def favorites(db: AsyncSession, user_id: int, target_type: str = "post",
                    page: int = 1, size: int = 10) -> dict:
    target_type = (target_type or "post").strip()
    if target_type not in ("post", "course", "product", "topic"):
        target_type = "post"
    page = max(1, int(page or 1))
    size = min(max(int(size or 10), 1), 30)

    stmt = select(Collection).where(
        Collection.user_id == int(user_id), Collection.target_type == target_type
    )
    total = await UserRepo(db).count(stmt)
    rows = await UserRepo(db).all(
        stmt.order_by(Collection.created_at.desc(), Collection.id.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    ids = [int(row.target_id) for row in rows]
    collected_at = {int(row.target_id): fmt_dt(row.created_at) or "" for row in rows}

    items: list[dict] = []
    if target_type == "post" and ids:
        posts = {
            int(p.id): p
            for p in (
                await db.execute(
                    select(Post).where(Post.id.in_(ids), Post.deleted == 0)
                )
            ).scalars().all()
        }
        for target_id in ids:
            post = posts.get(target_id)
            if not post:
                continue
            items.append(
                {
                    "type": "post",
                    "id": str(int(post.id)),
                    "content": (post.content or "")[:40],
                    "coverImage": post.cover_image or "",
                    "likeCount": int(post.like_count or 0),
                    "collectedAt": collected_at.get(target_id, ""),
                }
            )
    elif target_type == "course" and ids:
        courses = {
            int(c.id): c
            for c in (
                await db.execute(select(Course).where(Course.id.in_(ids)))
            ).scalars().all()
        }
        for target_id in ids:
            course = courses.get(target_id)
            if not course:
                continue
            items.append(
                {
                    "type": "course",
                    "id": str(int(course.id)),
                    "title": course.title or "",
                    "cover": course.cover or "",
                    "duration": int(course.duration or 0),
                    "collectedAt": collected_at.get(target_id, ""),
                }
            )
    elif target_type == "product" and ids:
        products = {
            int(p.id): p
            for p in (
                await db.execute(select(Product).where(Product.id.in_(ids)))
            ).scalars().all()
        }
        covers = {
            int(product_id): url
            for product_id, url in (
                await db.execute(
                    select(ProductImage.product_id, ProductImage.url)
                    .where(ProductImage.product_id.in_(ids))
                    .order_by(ProductImage.product_id, ProductImage.sort)
                )
            ).all()
        }
        for target_id in ids:
            product = products.get(target_id)
            if not product:
                continue
            items.append(
                {
                    "type": "product",
                    "id": str(int(product.id)),
                    "name": product.name or "",
                    "cover": covers.get(target_id) or product.cover or "",
                    "tagline": product.tagline or "",
                    "collectedAt": collected_at.get(target_id, ""),
                }
            )

    return {
        "list": items,
        "total": total,
        "hasMore": (page - 1) * size + len(rows) < total,
        "nextCursor": "",
    }


async def like_received(db: AsyncSession, user_id: int) -> int:
    value = await db.scalar(
        select(func.coalesce(func.sum(Post.like_count), 0)).where(
            Post.user_id == user_id, Post.deleted == 0
        )
    )
    return int(value or 0)
