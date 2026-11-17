from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user, optional_user
from app.core.response import ok
from app.db.session import get_db
from app.models.user import User
from app.services import course_service

router = APIRouter(prefix="/courses", tags=["课程"])


@router.get("", summary="课程列表")
async def list_courses(
    category: str = Query("all"),
    difficulty: str | None = Query(None),
    duration: str | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=30),
    viewer: User | None = Depends(optional_user),
    db: AsyncSession = Depends(get_db),
):
    return ok(
        await course_service.list_courses(
            db,
            int(viewer.id) if viewer else None,
            category=category,
            difficulty=difficulty,
            duration=duration,
            page=page,
            size=size,
        )
    )


@router.get("/{course_id}", summary="课程详情")
async def get_course(
    course_id: int,
    viewer: User | None = Depends(optional_user),
    db: AsyncSession = Depends(get_db),
):
    return ok(await course_service.detail(db, course_id, int(viewer.id) if viewer else None))


@router.post("/{course_id}/collect", summary="收藏课程")
async def collect_course(
    course_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
):
    return ok(await course_service.toggle_collect(db, course_id, int(user.id), True))


@router.delete("/{course_id}/collect", summary="取消收藏课程")
async def uncollect_course(
    course_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
):
    return ok(await course_service.toggle_collect(db, course_id, int(user.id), False))
