"""健衡运动社区 后端入口（FastAPI）。"""
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.core.logging import setup_logging
from app.core.request_id import RequestIdMiddleware, current_request_id
from app.core.response import envelope, ok
from app.core.security import verify_password  # noqa: F401  保证 bcrypt 依赖在启动期暴露问题
from app.db.session import engine
from app.utils.time import fmt_dt, now_cn

logger = logging.getLogger("app.main")


def assert_prod_safe() -> None:
    """生产环境安全门禁：配置不安全时拒绝启动（比“上线后发现”便宜得多）。"""
    if not settings.is_prod:
        return
    problems: list[str] = []
    if settings.WX_MOCK_LOGIN:
        problems.append("WX_MOCK_LOGIN 必须为 false")
    if "*" in settings.cors_origin_list:
        problems.append("CORS_ORIGINS 不能为 *，需显式配置小程序/管理端域名")
    secret = settings.JWT_SECRET or ""
    if len(secret) < 32 or secret.startswith("dev_only") or secret.startswith("change_me"):
        problems.append("JWT_SECRET 必须为 >=32 字节的随机串（openssl rand -hex 32）")
    if problems:
        raise RuntimeError("生产环境配置不安全：" + "；".join(problems))


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    assert_prod_safe()
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    logger.info(
        "app starting env=%s version=%s mock_login=%s docs=%s",
        settings.APP_ENV,
        settings.APP_VERSION,
        settings.WX_MOCK_LOGIN,
        not settings.is_prod,
    )
    yield
    logger.info("app stopped")


app = FastAPI(
    title="健衡运动社区 API",
    version=settings.APP_VERSION,
    docs_url="/docs" if not settings.is_prod else None,
    redoc_url=None,
    openapi_url="/openapi.json" if not settings.is_prod else None,
    lifespan=lifespan,
)

app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-Id"],
)

register_exception_handlers(app)
app.include_router(api_router, prefix=settings.API_PREFIX)

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


@app.get("/healthz", tags=["健康检查"], summary="存活探针（根路径）")
async def root_healthz():
    db_ok = True
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        db_ok = False
    data = {
        "status": "ok" if db_ok else "degraded",
        "db": "ok" if db_ok else "error",
        "version": settings.APP_VERSION,
        "time": fmt_dt(now_cn()),
    }
    if db_ok:
        return ok(data)
    return JSONResponse(
        status_code=503,
        content=envelope(50000, "degraded", data, current_request_id()),
    )
