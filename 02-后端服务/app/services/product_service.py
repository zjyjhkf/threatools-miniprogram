"""产品服务：列表（含 banner）、详情、收藏。"""
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFound
from app.models.collection import Collection
from app.models.product import Product, ProductImage
from app.repositories.interaction_repo import InteractionRepo
from app.repositories.product_repo import ProductRepo
from app.services.vo import product_vo
from app.utils.time import now_cn

BANNER = {
    "title": "专业康复装备",
    "subtitle": "助力科学运动恢复",
    "action": "了解全部产品",
}


async def _images_map(db: AsyncSession, product_ids: list[int]) -> dict[int, list[str]]:
    if not product_ids:
        return {}
    rows = (
        await db.execute(
            select(ProductImage.product_id, ProductImage.url)
            .where(ProductImage.product_id.in_(product_ids))
            .order_by(ProductImage.product_id, ProductImage.sort, ProductImage.id)
        )
    ).all()
    grouped: dict[int, list[str]] = {}
    for product_id, url in rows:
        grouped.setdefault(int(product_id), []).append(str(url))
    return grouped


async def list_products(db: AsyncSession, viewer_id: int | None, category: str = "all") -> dict:
    category = (category or "all").strip()
    stmt = select(Product).where(Product.status == 1)
    if category and category != "all":
        stmt = stmt.where(Product.category == category)
    rows = await ProductRepo(db).all(stmt.order_by(Product.sort.desc(), Product.id.asc()))
    images = await _images_map(db, [int(p.id) for p in rows])
    items = []
    for product in rows:
        urls = images.get(int(product.id), [])
        vo = product_vo(
            product,
            cover=urls[0] if urls else (product.cover or ""),
            image_count=len(urls),
        )
        items.append(vo)
    return {"banner": dict(BANNER), "list": items}


async def detail(db: AsyncSession, product_id: int, viewer_id: int | None = None) -> dict:
    product = await db.get(Product, product_id)
    if not product or product.status != 1:
        raise NotFound("该产品已下架")

    images = (await _images_map(db, [int(product_id)])).get(int(product_id), [])
    if not images and product.cover:
        images = [product.cover]

    collected = False
    if viewer_id:
        collected = int(product_id) in await InteractionRepo(db).collected_ids(
            viewer_id, "product", [int(product_id)]
        )

    related_ids = [int(x) for x in (product.related_ids or [])][:3]
    if related_ids:
        related = await ProductRepo(db).all(
            select(Product).where(Product.id.in_(related_ids), Product.status == 1)
        )
        order = {value: index for index, value in enumerate(related_ids)}
        related.sort(key=lambda p: order.get(int(p.id), 99))
    else:
        related = await ProductRepo(db).all(
            select(Product)
            .where(
                Product.id != product_id,
                Product.status == 1,
                Product.category == product.category,
            )
            .order_by(Product.sort.desc())
            .limit(2)
        )
    related_images = await _images_map(db, [int(p.id) for p in related])

    return {
        "id": int(product.id),
        "name": product.name or "",
        "model": product.model or "",
        "category": product.category or "rehab",
        "tagline": product.tagline or "",
        "tags": list(product.tags or []),
        "images": images,
        "features": list(product.features or []),
        "specs": list(product.specs or []),
        "suitableFor": list(product.suitable_for or []),
        "video": {
            "cover": product.video_cover or "",
            "url": product.video_url or "",
            "duration": int(product.video_duration or 0),
        },
        "collectCount": int(product.collect_count or 0),
        "collected": collected,
        "related": [
            {
                "id": str(int(p.id)),
                "name": p.name or "",
                "cover": (related_images.get(int(p.id)) or [p.cover or ""])[0],
            }
            for p in related
        ],
    }


async def toggle_collect(db: AsyncSession, product_id: int, user_id: int, on: bool) -> dict:
    product = await db.get(Product, product_id)
    if not product or product.status != 1:
        raise NotFound("产品不存在")
    repo = InteractionRepo(db)
    existing = await repo.find_collection(user_id, "product", product_id)
    if on and not existing:
        db.add(Collection(user_id=user_id, target_type="product", target_id=product_id, created_at=now_cn()))
        await db.execute(
            update(Product)
            .where(Product.id == product_id)
            .values(collect_count=Product.collect_count + 1)
        )
        await db.flush()
        await db.refresh(product)
    elif not on and existing:
        await repo.remove_collection(user_id, "product", product_id)
        await db.execute(
            update(Product)
            .where(Product.id == product_id, Product.collect_count > 0)
            .values(collect_count=Product.collect_count - 1)
        )
        await db.flush()
        await db.refresh(product)
    return {"collected": bool(on), "collectCount": int(product.collect_count or 0)}
