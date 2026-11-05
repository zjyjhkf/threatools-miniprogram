"""课程服务：列表（含主推）、详情、收藏。"""
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFound
from app.models.collection import Collection
from app.models.course import Chapter, Course
from app.repositories.course_repo import CourseRepo
from app.repositories.interaction_repo import InteractionRepo
from app.services.vo import chapter_vo, course_vo
from app.utils.time import now_cn


async def list_courses(db: AsyncSession, viewer_id: int | None, *, category: str = "all",
                       difficulty: str | None = None, duration: str | None = None,
                       page: int = 1, size: int = 10) -> dict:
    page = max(1, int(page or 1))
    size = min(max(int(size or 10), 1), 30)
    category = (category or "all").strip()

    stmt = select(Course).where(Course.status == 1)
    if category and category != "all":
        stmt = stmt.where(Course.category == category)
    if difficulty:
        values = [x.strip() for x in str(difficulty).split(",") if x.strip()]
        if values:
            stmt = stmt.where(Course.difficulty.in_(values))
    if duration == "lt10":
        stmt = stmt.where(Course.duration < 600)
    elif duration == "10to20":
        stmt = stmt.where(Course.duration >= 600, Course.duration <= 1200)
    elif duration == "gt20":
        stmt = stmt.where(Course.duration > 1200)

    repo = CourseRepo(db)
    total = await repo.count(stmt)
    rows = await repo.all(
        stmt.order_by(Course.sort.desc(), Course.id.asc())
        .offset((page - 1) * size)
        .limit(size)
    )

    main_vo = None
    if page == 1 and category in ("", "all"):
        main = await repo.scalar(
            select(Course)
            .where(Course.status == 1, Course.is_main == 1)
            .order_by(Course.sort.desc())
        )
        if main:
            main_vo = course_vo(main)

    return {
        "main": main_vo,
        "list": [course_vo(c) for c in rows],
        "hasMore": (page - 1) * size + len(rows) < total,
    }


async def detail(db: AsyncSession, course_id: int, viewer_id: int | None = None) -> dict:
    course = await db.get(Course, course_id)
    if not course or course.status != 1:
        raise NotFound("课程不存在")

    vo = course_vo(course)
    vo["videoCover"] = course.video_cover or ""
    vo["coach"] = {
        "name": course.coach_name or "",
        "avatar": course.coach_avatar or "",
        "title": course.coach_title or "",
    }
    vo["intro"] = course.intro or ""
    vo["suitableFor"] = list(course.suitable_for or [])
    vo["collectCount"] = int(course.collect_count or 0)
    collected = False
    if viewer_id:
        collected = int(course_id) in await InteractionRepo(db).collected_ids(
            viewer_id, "course", [int(course_id)]
        )
    vo["collected"] = collected

    chapters = list(
        (
            await db.execute(
                select(Chapter).where(Chapter.course_id == course_id).order_by(Chapter.idx.asc())
            )
        ).scalars().all()
    )
    vo["chapters"] = [chapter_vo(c) for c in chapters]

    related_ids = [int(x) for x in (course.related_ids or [])][:3]
    if related_ids:
        related = await CourseRepo(db).all(
            select(Course).where(Course.id.in_(related_ids), Course.status == 1)
        )
        order = {value: index for index, value in enumerate(related_ids)}
        related.sort(key=lambda c: order.get(int(c.id), 99))
    else:
        related = await CourseRepo(db).all(
            select(Course)
            .where(Course.id != course_id, Course.status == 1, Course.category == course.category)
            .order_by(Course.sort.desc())
            .limit(3)
        )
    vo["related"] = [
        {
            "id": str(int(c.id)),
            "title": c.title or "",
            "cover": c.cover or "",
            "duration": int(c.duration or 0),
        }
        for c in related
    ]
    return vo


async def toggle_collect(db: AsyncSession, course_id: int, user_id: int, on: bool) -> dict:
    course = await db.get(Course, course_id)
    if not course or course.status != 1:
        raise NotFound("课程不存在")
    repo = InteractionRepo(db)
    existing = await repo.find_collection(user_id, "course", course_id)
    if on and not existing:
        db.add(Collection(user_id=user_id, target_type="course", target_id=course_id, created_at=now_cn()))
        await db.execute(
            update(Course).where(Course.id == course_id).values(collect_count=Course.collect_count + 1)
        )
        await db.flush()
        await db.refresh(course)
    elif not on and existing:
        await repo.remove_collection(user_id, "course", course_id)
        await db.execute(
            update(Course)
            .where(Course.id == course_id, Course.collect_count > 0)
            .values(collect_count=Course.collect_count - 1)
        )
        await db.flush()
        await db.refresh(course)
    return {"collected": bool(on), "collectCount": int(course.collect_count or 0)}
