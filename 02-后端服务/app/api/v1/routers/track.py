from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import optional_user
from app.core.rate_limit import allow, client_ip
from app.core.response import ok
from app.db.session import get_db
from app.models.user import User
from app.schemas.track import TrackBatch, TrackEventItem
from app.services import track_service

router = APIRouter(prefix="/track", tags=["埋点"])

# 文档 A33：同 IP + event 每秒 ≤20 条，超出丢弃但仍返回 200
TRACK_LIMIT_PER_SECOND = 20


async def _allowed(ip: str, event: str) -> bool:
    return await allow(f"track:{ip}:{event}", TRACK_LIMIT_PER_SECOND, 1)


@router.post("", summary="单条埋点")
async def track_one(
    payload: TrackEventItem,
    request: Request,
    viewer: User | None = Depends(optional_user),
    db: AsyncSession = Depends(get_db),
):
    if await _allowed(client_ip(request), payload.event):
        await track_service.ingest(
            db,
            int(viewer.id) if viewer else None,
            [payload.model_dump()],
            None,
            None,
            None,
        )
    return ok(None)


@router.post("/events", summary="批量上报埋点（前端错误/行为统一入口）")
async def track_events(
    payload: TrackBatch,
    request: Request,
    viewer: User | None = Depends(optional_user),
    db: AsyncSession = Depends(get_db),
):
    ip = client_ip(request)
    events = []
    for item in payload.events:
        if await _allowed(ip, item.event):
            events.append(item.model_dump())
    if events:
        await track_service.ingest(
            db,
            int(viewer.id) if viewer else None,
            events,
            payload.platform,
            payload.version,
            payload.scene,
        )
    return ok(None)
