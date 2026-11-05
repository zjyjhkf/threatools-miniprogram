"""管理端（Web）接口占位：1.0 只预留路由与状态，1.1 实现。

设计依据：前置文档/后端/01-接口文档.md 第 12 节 A90–A96。
统一返回 501 + `50100`，让管理端联调时能明确区分“未实现”与“不存在”。
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.request_id import current_request_id
from app.core.response import envelope

router = APIRouter(prefix="/admin", tags=["管理端（1.1 预留）"])


def _not_implemented():
    return JSONResponse(
        status_code=501,
        content=envelope(50100, "管理端接口将在 1.1 版本提供", None, current_request_id()),
    )


@router.post("/auth/login", summary="A90 管理员登录（预留）")
async def admin_login():
    return _not_implemented()


@router.get("/posts", summary="A91 内容列表（预留）")
async def admin_posts():
    return _not_implemented()


@router.post("/posts/{post_id}/review", summary="A92 内容审核 / 下架（预留）")
async def admin_review(post_id: int):
    return _not_implemented()


@router.get("/users", summary="A93 用户列表（预留）")
async def admin_users():
    return _not_implemented()


@router.patch("/users/{user_id}/status", summary="A94 用户禁用 / 启用（预留）")
async def admin_user_status(user_id: int):
    return _not_implemented()


@router.get("/stats/overview", summary="A95 运营概览（预留）")
async def admin_stats():
    return _not_implemented()


@router.post("/products", summary="A96 产品维护（预留）")
async def admin_products():
    return _not_implemented()


@router.patch("/products/{product_id}", summary="A96 产品维护（预留）")
async def admin_product_update(product_id: int):
    return _not_implemented()
