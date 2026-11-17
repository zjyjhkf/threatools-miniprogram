"""全局搜索：课程 / 产品 / 帖子（A29）。"""
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.post import Post
from app.models.product import Product, ProductImage
from app.models.user import User
from app.repositories.post_repo import published_stmt
from app.utils.text import clean_text

SEARCH_LIMIT = 20


async def search(db: AsyncSession, keyword: str, search_type: str = "all") -> dict:
    keyword = clean_text(keyword, 40)
    search_type = (search_type or "all").strip()
    like = f"%{keyword}%" if keyword else "%"

    courses = list(
        (
            await db.execute(
                select(Course)
                .where(Course.status == 1, or_(Course.title.like(like), Course.intro.like(like)))
                .order_by(Course.sort.desc())
                .limit(SEARCH_LIMIT)
            )
        ).scalars().all()
    )
    products = list(
        (
            await db.execute(
                select(Product)
                .where(
                    Product.status == 1,
                    or_(Product.name.like(like), Product.tagline.like(like)),
                )
                .order_by(Product.sort.desc())
                .limit(SEARCH_LIMIT)
            )
        ).scalars().all()
    )
    posts = list(
        (
            await db.execute(
                published_stmt()
                .where(Post.content.like(like))
                .order_by(Post.id.desc())
                .limit(SEARCH_LIMIT)
            )
        ).scalars().all()
    )

    authors = {
        int(u.id): u
        for u in (
            await db.execute(
                select(User).where(User.id.in_(list({int(p.user_id) for p in posts}) or [-1]))
            )
        ).scalars().all()
    }
    covers = {
        int(product_id): url
        for product_id, url in (
            await db.execute(
                select(ProductImage.product_id, ProductImage.url)
                .where(ProductImage.product_id.in_([int(p.id) for p in products] or [-1]))
                .order_by(ProductImage.product_id, ProductImage.sort)
            )
        ).all()
    }

    course_items = [
        {
            "id": str(int(c.id)),
            "title": c.title or "",
            "cover": c.cover or "",
            "duration": int(c.duration or 0),
            "difficulty": c.difficulty or "beginner",
        }
        for c in courses
    ]
    product_items = [
        {
            "id": str(int(p.id)),
            "name": p.name or "",
            "cover": covers.get(int(p.id)) or p.cover or "",
            "tagline": p.tagline or "",
        }
        for p in products
    ]
    post_items = [
        {
            "id": str(int(p.id)),
            "content": (p.content or "")[:40],
            "coverImage": p.cover_image or "",
            "author": {
                "id": str(int(p.user_id)),
                "nickname": (authors.get(int(p.user_id)).nickname if authors.get(int(p.user_id)) else "")
                or "匿名用户",
            },
        }
        for p in posts
    ]

    counts = {
        "post": len(post_items),
        "course": len(course_items),
        "product": len(product_items),
    }
    take = (lambda items: items[:2]) if search_type == "all" else (lambda items: items)
    return {
        "courses": [] if search_type in ("post", "product") else take(course_items),
        "products": [] if search_type in ("post", "course") else take(product_items),
        "posts": [] if search_type in ("course", "product") else take(post_items),
        "counts": counts,
    }
