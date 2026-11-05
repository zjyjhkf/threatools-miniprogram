"""v1 路由聚合：与 前置文档/后端/01-接口文档.md 的 A01–A36 对应。

- A01–A36：小程序端正式接口
- A90–A96：管理端预留（1.0 返回 501）
"""

from fastapi import APIRouter

from app.api.v1.routers import (
    admin,
    auth,
    comments,
    courses,
    feed,
    follows,
    health,
    posts,
    products,
    search,
    topics,
    track,
    upload,
    users,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(feed.router)
api_router.include_router(posts.router)
api_router.include_router(comments.router)
api_router.include_router(topics.router)
api_router.include_router(courses.router)
api_router.include_router(products.router)
api_router.include_router(search.router)
api_router.include_router(follows.router)
api_router.include_router(upload.router)
api_router.include_router(track.router)
api_router.include_router(health.router)
# 管理端预留：1.1 实现业务，1.0 统一 501
api_router.include_router(admin.router)
