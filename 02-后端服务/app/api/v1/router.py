"""v1 路由聚合：与 01 接口文档 A01–A32 一一对应。"""
from fastapi import APIRouter

from app.api.v1.routers import (
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
