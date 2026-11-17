from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.response import ok
from app.db.session import get_db
from app.services import search_service

router = APIRouter(prefix="/search", tags=["搜索"])


@router.get("", summary="全局搜索")
async def search(
    q: str = Query(""),
    type: str = Query("all"),
    page: int = Query(1, ge=1),
    db: AsyncSession = Depends(get_db),
):
    return ok(await search_service.search(db, q, type))
