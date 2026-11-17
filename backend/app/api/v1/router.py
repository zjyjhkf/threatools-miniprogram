"""v1 路由聚合：与 前置文档/后端/01-接口文档.md 的 A01–A36 对应。

- A01–A36：小程序端正式接口
- A90–A130：管理端；当前已实装登录、产品、课程、上传、字典、概览，
  其余未实装接口返回 501（见 08-课程产品数据联动实装说明.md）
"""

from fastapi import APIRouter

from app.api.v1.routers import (
    admin,
    admin_comments,
    admin_posts,
    admin_taxonomy,
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
# 管理端：产品/课程/上传等已实装；未实装模块返回 501
api_router.include_router(admin.router)
# 管理端内容：A91 列表/详情、A92 审核、删除（与小程序端同一 MySQL）
api_router.include_router(admin_posts.router)
# 管理端话题 / 筛选条目（字典）/ 标签联想
api_router.include_router(admin_taxonomy.router)
# 管理端评论治理：A108 列表 / 删除
api_router.include_router(admin_comments.router)
