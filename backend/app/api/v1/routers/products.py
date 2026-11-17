from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user, optional_user
from app.core.response import ok
from app.db.session import get_db
from app.models.user import User
from app.services import product_service

router = APIRouter(prefix="/products", tags=["产品"])


@router.get("", summary="产品列表")
async def list_products(
    category: str = Query("all"),
    viewer: User | None = Depends(optional_user),
    db: AsyncSession = Depends(get_db),
):
    return ok(await product_service.list_products(db, int(viewer.id) if viewer else None, category))


@router.get("/{product_id}", summary="产品详情")
async def get_product(
    product_id: int,
    viewer: User | None = Depends(optional_user),
    db: AsyncSession = Depends(get_db),
):
    return ok(await product_service.detail(db, product_id, int(viewer.id) if viewer else None))


@router.post("/{product_id}/collect", summary="收藏产品")
async def collect_product(
    product_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
):
    return ok(await product_service.toggle_collect(db, product_id, int(user.id), True))


@router.delete("/{product_id}/collect", summary="取消收藏产品")
async def uncollect_product(
    product_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
):
    return ok(await product_service.toggle_collect(db, product_id, int(user.id), False))
