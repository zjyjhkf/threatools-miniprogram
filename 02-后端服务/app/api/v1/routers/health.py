from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import settings
from app.core.response import ok
from app.db.session import engine

router = APIRouter(tags=["健康检查"])


@router.get("/healthz", summary="存活探针")
async def healthz():
    return ok({"status": "ok", "version": settings.APP_VERSION, "env": settings.APP_ENV})


@router.get("/readyz", summary="就绪探针")
async def readyz():
    db_ok = False
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:  # noqa: BLE001
        db_ok = False
    return ok({"status": "ok" if db_ok else "degraded", "db": db_ok, "version": settings.APP_VERSION})
