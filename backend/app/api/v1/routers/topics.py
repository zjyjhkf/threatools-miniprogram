from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user, optional_user
from app.core.rate_limit import rate_limit
from app.core.response import ok
from app.db.session import get_db
from app.models.user import User
from app.services import topic_service

router = APIRouter(prefix="/topics", tags=["话题"])


class CreateTopicRequest(BaseModel):
    name: str = Field(min_length=2, max_length=20)


@router.get("/hot", summary="热门话题")
async def hot_topics(limit: int = Query(10, ge=1, le=30), db: AsyncSession = Depends(get_db)):
    return ok(await topic_service.hot(db, limit))


@router.get("/search", summary="搜索话题")
async def search_topics(q: str = Query(""), db: AsyncSession = Depends(get_db)):
    return ok(await topic_service.search(db, q))


@router.get("", summary="全部话题")
async def list_topics(
    page: int = Query(1, ge=1),
    size: int = Query(12, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
):
    return ok(await topic_service.list_topics(db, page, size))


@router.post("", summary="创建话题", dependencies=[Depends(rate_limit("topic:create", 10, 3600))])
async def create_topic(
    payload: CreateTopicRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    return ok(await topic_service.create(db, payload.name, int(user.id)))


@router.get("/{topic_id}", summary="话题详情")
async def get_topic(
    topic_id: int,
    viewer: User | None = Depends(optional_user),
    db: AsyncSession = Depends(get_db),
):
    return ok(await topic_service.detail(db, topic_id, int(viewer.id) if viewer else None))


@router.get("/{topic_id}/posts", summary="话题下帖子")
async def get_topic_posts(
    topic_id: int,
    sort: str = Query("new"),
    cursor: str = Query(""),
    size: int = Query(10, ge=1, le=30),
    viewer: User | None = Depends(optional_user),
    db: AsyncSession = Depends(get_db),
):
    return ok(
        await topic_service.posts(
            db, topic_id, int(viewer.id) if viewer else None, sort, cursor, size
        )
    )
