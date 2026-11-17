"""管理端接口（最小可用版）。

本文件承接管理端 1.0 的“产品 / 课程 / 图片上传”真实落库链路：
- 账号：admin_users（bcrypt 密码 + aud=admin 的 JWT）
- 产品：A96 / A122–A126
- 课程：A115–A120
- 上传：A127
- 字典：A130
- 概览：A95（最小统计，供登录后首页使用）

管理端写入的是小程序端同一个 MySQL，因此保存后小程序读取即可看到变化。
"""

from __future__ import annotations

from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import BadRequest, Forbidden, NotFound, Unauthorized, ValidationBiz
from app.core.request_id import current_request_id
from app.core.response import envelope, ok
from app.core.security import create_access_token, decode_token, hash_password, verify_password
from app.db.session import get_db
from app.models.admin_user import AdminUser
from app.models.comment import Comment
from app.models.course import Chapter, Course
from app.models.post import Post
from app.models.product import Product, ProductImage
from app.models.topic import Topic
from app.models.user import User
from app.services import dict_service
from app.services.upload_service import save_image
from app.utils.time import fmt_dt, now_cn, start_of_day

router = APIRouter(prefix="/admin", tags=["管理端"])
bearer = HTTPBearer(auto_error=False)

PERMISSIONS = [
    "dashboard:read",
    "post:read",
    "post:review",
    "post:delete",
    "comment:read",
    "comment:delete",
    "user:read",
    "user:manage",
    "topic:manage",
    "course:manage",
    "product:manage",
    "upload:write",
    "audit:read",
]
SUPER_PERMISSIONS = [*PERMISSIONS, "admin:manage"]


class AdminWriteModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        extra="forbid",
    )


class LoginIn(AdminWriteModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=64)


class PasswordIn(AdminWriteModel):
    old_password: str = Field(min_length=1, max_length=64)
    new_password: str = Field(min_length=8, max_length=64)


class FeatureIn(AdminWriteModel):
    icon: str = Field(default="layers", max_length=20)
    title: str = Field(min_length=1, max_length=12)
    desc: str = Field(min_length=1, max_length=80)


class SpecIn(AdminWriteModel):
    label: str = Field(min_length=1, max_length=20)
    value: str = Field(min_length=1, max_length=80)


class ProductCreateIn(AdminWriteModel):
    name: str = Field(min_length=2, max_length=40)
    model: str = Field(default="", max_length=20)
    category: str = Field(default="rehab", max_length=20)
    tagline: str = Field(default="", max_length=60)
    tags: list[str] = Field(default_factory=list, max_length=5)
    features: list[FeatureIn] = Field(default_factory=list, max_length=3)
    specs: list[SpecIn] = Field(default_factory=list, max_length=12)
    suitable_for: list[str] = Field(default_factory=list, max_length=3)
    video_cover: str = ""
    video_url: str = ""
    video_duration: int = Field(default=0, ge=0, le=7200)
    related_ids: list[str] = Field(default_factory=list, max_length=3)
    images: list[str] = Field(min_length=1, max_length=4)
    sort: int = Field(default=0, ge=-999, le=999)
    status: int = Field(default=1, ge=0, le=1)


class ProductUpdateIn(AdminWriteModel):
    name: str | None = Field(default=None, min_length=2, max_length=40)
    model: str | None = Field(default=None, max_length=20)
    category: str | None = Field(default=None, max_length=20)
    tagline: str | None = Field(default=None, max_length=60)
    tags: list[str] | None = Field(default=None, max_length=5)
    features: list[FeatureIn] | None = Field(default=None, max_length=3)
    specs: list[SpecIn] | None = Field(default=None, max_length=12)
    suitable_for: list[str] | None = Field(default=None, max_length=3)
    video_cover: str | None = None
    video_url: str | None = None
    video_duration: int | None = Field(default=None, ge=0, le=7200)
    related_ids: list[str] | None = Field(default=None, max_length=3)
    sort: int | None = Field(default=None, ge=-999, le=999)


class ImagesIn(AdminWriteModel):
    images: list[str] = Field(min_length=1, max_length=4)


class StatusIn(AdminWriteModel):
    status: int = Field(ge=0, le=1)
    reason: str = Field(default="", max_length=100)


class ChapterIn(AdminWriteModel):
    title: str = Field(min_length=1, max_length=30)
    duration: int = Field(ge=1, le=7200)
    video_url: str = ""
    locked: bool = False


class ChaptersIn(AdminWriteModel):
    chapters: list[ChapterIn] = Field(default_factory=list, max_length=30)


class CourseCreateIn(AdminWriteModel):
    title: str = Field(min_length=2, max_length=30)
    cover: str = Field(min_length=1, max_length=512)
    video_cover: str = ""
    category: str = Field(default="rehab", max_length=20)
    difficulty: str = Field(default="beginner", max_length=20)
    tags: list[str] = Field(default_factory=list, max_length=5)
    coach_name: str = Field(default="", max_length=16)
    coach_avatar: str = ""
    coach_title: str = Field(default="", max_length=32)
    intro: str = Field(default="", max_length=2000)
    suitable_for: list[str] = Field(default_factory=list, max_length=3)
    related_ids: list[str] = Field(default_factory=list, max_length=3)
    is_main: bool = False
    sort: int = Field(default=0, ge=-999, le=999)
    status: int = Field(default=1, ge=0, le=1)
    chapters: list[ChapterIn] = Field(default_factory=list, max_length=30)


class CourseUpdateIn(AdminWriteModel):
    title: str | None = Field(default=None, min_length=2, max_length=30)
    cover: str | None = Field(default=None, min_length=1, max_length=512)
    video_cover: str | None = None
    category: str | None = Field(default=None, max_length=20)
    difficulty: str | None = Field(default=None, max_length=20)
    tags: list[str] | None = Field(default=None, max_length=5)
    coach_name: str | None = Field(default=None, max_length=16)
    coach_avatar: str | None = None
    coach_title: str | None = Field(default=None, max_length=32)
    intro: str | None = Field(default=None, max_length=2000)
    suitable_for: list[str] | None = Field(default=None, max_length=3)
    related_ids: list[str] | None = Field(default=None, max_length=3)
    is_main: bool | None = None
    sort: int | None = Field(default=None, ge=-999, le=999)


def _permissions(admin: AdminUser) -> list[str]:
    return SUPER_PERMISSIONS if admin.role == "super" else PERMISSIONS


def _admin_vo(admin: AdminUser) -> dict:
    return {
        "id": str(int(admin.id)),
        "username": admin.username,
        "nickname": admin.nickname or admin.username,
        "role": admin.role,
        "status": int(admin.status),
        "mustChangePassword": False,
        "permissions": _permissions(admin),
        "remark": "",
        "lastLoginAt": fmt_dt(admin.created_at) or "",
        "createdAt": fmt_dt(admin.created_at) or "",
        "lastLoginIp": "",
        "passwordChangedAt": None,
    }


async def current_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> AdminUser:
    if not credentials:
        raise Unauthorized("请先登录")
    payload = decode_token(credentials.credentials, audience="admin")
    try:
        admin_id = int(payload.get("sub") or 0)
    except (TypeError, ValueError) as exc:
        raise Unauthorized("登录已失效") from exc
    admin = await db.get(AdminUser, admin_id)
    if not admin or admin.status != 1:
        raise Unauthorized("登录已失效，请重新登录")
    return admin


def _to_int_ids(values: list[str] | list[int] | None, *, self_id: int | None = None) -> list[int]:
    result: list[int] = []
    for raw in values or []:
        try:
            value = int(raw)
        except (TypeError, ValueError):
            continue
        if value <= 0 or value == self_id or value in result:
            continue
        result.append(value)
    return result[:3]


def _str_ids(values: list[int] | None) -> list[str]:
    return [str(int(value)) for value in (values or [])]


async def _product_images(db: AsyncSession, product_ids: list[int]) -> dict[int, list[str]]:
    if not product_ids:
        return {}
    rows = (
        await db.execute(
            select(ProductImage.product_id, ProductImage.url)
            .where(ProductImage.product_id.in_(product_ids))
            .order_by(ProductImage.product_id, ProductImage.sort, ProductImage.id)
        )
    ).all()
    result: dict[int, list[str]] = {}
    for product_id, url in rows:
        result.setdefault(int(product_id), []).append(url or "")
    return result


def _product_list_vo(product: Product, images: list[str]) -> dict:
    return {
        "id": str(int(product.id)),
        "name": product.name or "",
        "model": product.model or "",
        "category": product.category or "rehab",
        "tagline": product.tagline or "",
        "tags": list(product.tags or []),
        "cover": (images[0] if images else product.cover) or "",
        "imageCount": len(images),
        "collectCount": int(product.collect_count or 0),
        "sort": int(product.sort or 0),
        "status": int(product.status or 0),
        "updatedAt": fmt_dt(product.updated_at) or "",
    }


async def _product_detail(db: AsyncSession, product: Product) -> dict:
    images = (await _product_images(db, [int(product.id)])).get(int(product.id), [])
    related_ids = _to_int_ids(list(product.related_ids or []))
    related: list[dict] = []
    if related_ids:
        rows = (
            await db.execute(select(Product).where(Product.id.in_(related_ids)))
        ).scalars().all()
        order = {value: index for index, value in enumerate(related_ids)}
        rows.sort(key=lambda item: order.get(int(item.id), 99))
        related_images = await _product_images(db, [int(item.id) for item in rows])
        related = [
            {
                "id": str(int(item.id)),
                "name": item.name or "",
                "cover": (related_images.get(int(item.id), []) or [item.cover or ""])[0],
            }
            for item in rows
        ]
    return {
        **_product_list_vo(product, images),
        "images": images,
        "features": list(product.features or []),
        "specs": list(product.specs or []),
        "suitableFor": list(product.suitable_for or []),
        "video": {
            "cover": product.video_cover or "",
            "url": product.video_url or "",
            "duration": int(product.video_duration or 0),
        },
        "relatedIds": _str_ids(related_ids),
        "related": related,
        "createdAt": fmt_dt(product.created_at) or "",
    }


async def _course_chapters(db: AsyncSession, course_id: int) -> list[Chapter]:
    return list(
        (
            await db.execute(
                select(Chapter)
                .where(Chapter.course_id == course_id)
                .order_by(Chapter.idx.asc(), Chapter.id.asc())
            )
        ).scalars().all()
    )


def _chapter_vo(chapter: Chapter) -> dict:
    return {
        "id": str(int(chapter.id)),
        "idx": int(chapter.idx or 0),
        "title": chapter.title or "",
        "duration": int(chapter.duration or 0),
        "videoUrl": chapter.video_url or "",
        "locked": bool(chapter.locked),
    }


def _course_list_vo(course: Course, chapter_count: int = 0) -> dict:
    return {
        "id": str(int(course.id)),
        "title": course.title or "",
        "cover": course.cover or "",
        "duration": int(course.duration or 0),
        "actionCount": int(course.action_count or 0),
        "difficulty": course.difficulty or "beginner",
        "category": course.category or "rehab",
        "tags": list(course.tags or []),
        "coachName": course.coach_name or "",
        "learnCount": int(course.learn_count or 0),
        "collectCount": int(course.collect_count or 0),
        "isMain": bool(course.is_main),
        "sort": int(course.sort or 0),
        "status": int(course.status or 0),
        "chapterCount": int(chapter_count),
        "updatedAt": fmt_dt(course.updated_at) or "",
    }


async def _course_detail(db: AsyncSession, course: Course) -> dict:
    chapters = await _course_chapters(db, int(course.id))
    related_ids = _to_int_ids(list(course.related_ids or []))
    related: list[dict] = []
    if related_ids:
        rows = (
            await db.execute(select(Course).where(Course.id.in_(related_ids)))
        ).scalars().all()
        order = {value: index for index, value in enumerate(related_ids)}
        rows.sort(key=lambda item: order.get(int(item.id), 99))
        related = [
            {
                "id": str(int(item.id)),
                "title": item.title or "",
                "cover": item.cover or "",
                "duration": int(item.duration or 0),
            }
            for item in rows
        ]
    return {
        **_course_list_vo(course, len(chapters)),
        "videoCover": course.video_cover or "",
        "coach": {
            "name": course.coach_name or "",
            "avatar": course.coach_avatar or "",
            "title": course.coach_title or "",
        },
        "intro": course.intro or "",
        "suitableFor": list(course.suitable_for or []),
        "relatedIds": _str_ids(related_ids),
        "related": related,
        "chapters": [_chapter_vo(chapter) for chapter in chapters],
        "createdAt": fmt_dt(course.created_at) or "",
    }


def _chapter_count_map(rows: list) -> dict[int, int]:
    return {int(course_id): int(count) for course_id, count in rows}


# ---------------------------------------------------------------------------
# 认证
# ---------------------------------------------------------------------------


@router.post("/auth/login", summary="A90 管理员登录")
async def admin_login(payload: LoginIn, db: AsyncSession = Depends(get_db)):
    admin = await db.scalar(select(AdminUser).where(AdminUser.username == payload.username.strip()))
    if not admin or not verify_password(payload.password, admin.password_hash):
        raise Unauthorized("用户名或密码错误")
    if admin.status != 1:
        raise Forbidden("账号已停用")
    token, expires_in = create_access_token(
        int(admin.id), "", role=admin.role or "admin", audience="admin"
    )
    return ok(
        {
            "token": token,
            "expiresIn": expires_in,
            "mustChangePassword": False,
            "admin": _admin_vo(admin),
        }
    )


@router.get("/auth/me", summary="A97 当前管理员")
async def admin_me(admin: AdminUser = Depends(current_admin)):
    return ok(_admin_vo(admin))


@router.put("/auth/password", summary="A98 修改自己的密码")
async def admin_change_password(
    payload: PasswordIn,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(payload.old_password, admin.password_hash):
        raise ValidationBiz("原密码不正确")
    if payload.new_password == payload.old_password:
        raise ValidationBiz("新密码不能与旧密码相同")
    admin.password_hash = hash_password(payload.new_password)
    await db.flush()
    token, expires_in = create_access_token(
        int(admin.id), "", role=admin.role or "admin", audience="admin"
    )
    return ok({"token": token, "expiresIn": expires_in})


# ---------------------------------------------------------------------------
# 产品
# ---------------------------------------------------------------------------


@router.get("/products", summary="A122 产品列表")
async def admin_products(
    keyword: str = Query(""),
    category: str = Query(""),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Product).where(Product.deleted == 0)
    if keyword.strip():
        pattern = f"%{keyword.strip()}%"
        stmt = stmt.where(
            or_(Product.name.like(pattern), Product.model.like(pattern), Product.tagline.like(pattern))
        )
    if category.strip():
        stmt = stmt.where(Product.category == category.strip())
    if status in ("0", "1"):
        stmt = stmt.where(Product.status == int(status))

    total = int((await db.scalar(select(func.count()).select_from(stmt.subquery()))) or 0)
    rows = list(
        (
            await db.execute(
                stmt.order_by(Product.sort.desc(), Product.id.asc())
                .offset((page - 1) * size)
                .limit(size)
            )
        ).scalars().all()
    )
    images = await _product_images(db, [int(item.id) for item in rows])
    return ok(
        {
            "list": [_product_list_vo(item, images.get(int(item.id), [])) for item in rows],
            "total": total,
            "page": page,
            "size": size,
            "hasMore": (page - 1) * size + len(rows) < total,
        }
    )


@router.get("/products/{product_id}", summary="A123 产品详情")
async def admin_product_detail(
    product_id: int,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    product = await db.get(Product, product_id)
    if not product or product.deleted:
        raise NotFound("产品不存在")
    return ok(await _product_detail(db, product))


@router.post("/products", summary="A96 新建产品")
async def admin_product_create(
    payload: ProductCreateIn,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    now = now_cn()
    product = Product(
        name=payload.name.strip(),
        model=payload.model.strip(),
        category=payload.category,
        tagline=payload.tagline.strip(),
        tags=payload.tags,
        cover=payload.images[0],
        features=[item.model_dump() for item in payload.features],
        specs=[item.model_dump() for item in payload.specs],
        suitable_for=payload.suitable_for,
        video_cover=payload.video_cover,
        video_url=payload.video_url,
        video_duration=payload.video_duration,
        related_ids=_to_int_ids(payload.related_ids),
        collect_count=0,
        sort=payload.sort,
        status=payload.status,
        created_at=now,
        updated_at=now,
    )
    db.add(product)
    await db.flush()
    for index, url in enumerate(payload.images):
        db.add(ProductImage(product_id=int(product.id), url=url, sort=index))
    await db.flush()
    return ok(
        {
            "product": {
                "id": str(int(product.id)),
                "name": product.name,
                "status": int(product.status),
                "category": product.category,
                "cover": product.cover,
                "imageCount": len(payload.images),
                "createdAt": fmt_dt(product.created_at) or "",
                "updatedAt": fmt_dt(product.updated_at) or "",
            }
        }
    )


@router.patch("/products/{product_id}", summary="A124 编辑产品")
async def admin_product_update(
    product_id: int,
    payload: ProductUpdateIn,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    product = await db.get(Product, product_id)
    if not product:
        raise NotFound("产品不存在")
    fields = payload.model_fields_set
    mapping = {
        "name": "name",
        "model": "model",
        "category": "category",
        "tagline": "tagline",
        "tags": "tags",
        "features": "features",
        "specs": "specs",
        "suitable_for": "suitable_for",
        "video_cover": "video_cover",
        "video_url": "video_url",
        "video_duration": "video_duration",
        "sort": "sort",
    }
    for source, target in mapping.items():
        if source not in fields:
            continue
        value = getattr(payload, source)
        if source in ("features", "specs"):
            value = [item.model_dump() for item in (value or [])]
        setattr(product, target, value)
    if "related_ids" in fields:
        product.related_ids = _to_int_ids(payload.related_ids or [], self_id=product_id)
    product.updated_at = now_cn()
    await db.flush()
    images = (await _product_images(db, [product_id])).get(product_id, [])
    return ok(
        {
            "product": {
                "id": str(int(product.id)),
                "name": product.name,
                "status": int(product.status),
                "category": product.category,
                "cover": product.cover,
                "imageCount": len(images),
                "updatedAt": fmt_dt(product.updated_at) or "",
            }
        }
    )


@router.patch("/products/{product_id}/status", summary="A125 产品上下架")
async def admin_product_status(
    product_id: int,
    payload: StatusIn,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    product = await db.get(Product, product_id)
    if not product:
        raise NotFound("产品不存在")
    changed = int(product.status or 0) != payload.status
    product.status = payload.status
    product.updated_at = now_cn()
    await db.flush()
    return ok({"productId": str(product_id), "status": payload.status, "changed": changed})


@router.put("/products/{product_id}/images", summary="A126 替换产品图集")
async def admin_product_images(
    product_id: int,
    payload: ImagesIn,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    product = await db.get(Product, product_id)
    if not product:
        raise NotFound("产品不存在")
    await db.execute(delete(ProductImage).where(ProductImage.product_id == product_id))
    for index, url in enumerate(payload.images):
        db.add(ProductImage(product_id=product_id, url=url, sort=index))
    product.cover = payload.images[0]
    product.updated_at = now_cn()
    await db.flush()
    return ok(
        {
            "productId": str(product_id),
            "images": payload.images,
            "imageCount": len(payload.images),
            "cover": product.cover,
            "changed": True,
        }
    )


@router.delete("/products/{product_id}", summary="A124b 删除产品（需先下架）")
async def admin_product_delete(
    product_id: int,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    product = await db.get(Product, product_id)
    if not product or product.deleted:
        raise NotFound("产品不存在")
    if int(product.status or 0) == 1:
        raise ValidationBiz("请先下架该产品，再执行删除")
    product.deleted = 1
    product.updated_at = now_cn()
    await db.flush()
    return ok({"productId": str(product_id), "deleted": True})


# ---------------------------------------------------------------------------
# 课程
# ---------------------------------------------------------------------------


@router.get("/courses", summary="A115 课程列表")
async def admin_courses(
    keyword: str = Query(""),
    category: str = Query(""),
    difficulty: str = Query(""),
    status: str | None = Query(None),
    is_main: str | None = Query(None, alias="isMain"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Course).where(Course.deleted == 0)
    if keyword.strip():
        stmt = stmt.where(Course.title.like(f"%{keyword.strip()}%"))
    if category.strip():
        stmt = stmt.where(Course.category == category.strip())
    if difficulty.strip():
        stmt = stmt.where(Course.difficulty == difficulty.strip())
    if status in ("0", "1"):
        stmt = stmt.where(Course.status == int(status))
    if is_main in ("true", "1"):
        stmt = stmt.where(Course.is_main == 1)
    elif is_main in ("false", "0"):
        stmt = stmt.where(Course.is_main == 0)

    total = int((await db.scalar(select(func.count()).select_from(stmt.subquery()))) or 0)
    rows = list(
        (
            await db.execute(
                stmt.order_by(Course.sort.desc(), Course.id.asc())
                .offset((page - 1) * size)
                .limit(size)
            )
        ).scalars().all()
    )
    chapter_counts: dict[int, int] = {}
    if rows:
        chapter_rows = (
            await db.execute(
                select(Chapter.course_id, func.count(Chapter.id))
                .where(Chapter.course_id.in_([int(item.id) for item in rows]))
                .group_by(Chapter.course_id)
            )
        ).all()
        chapter_counts = _chapter_count_map(chapter_rows)
    return ok(
        {
            "list": [_course_list_vo(item, chapter_counts.get(int(item.id), 0)) for item in rows],
            "total": total,
            "page": page,
            "size": size,
            "hasMore": (page - 1) * size + len(rows) < total,
        }
    )


@router.get("/courses/{course_id}", summary="A116 课程详情")
async def admin_course_detail(
    course_id: int,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    course = await db.get(Course, course_id)
    if not course or course.deleted:
        raise NotFound("课程不存在")
    return ok(await _course_detail(db, course))


async def _sync_course_chapters(
    db: AsyncSession, course: Course, chapters: list[ChapterIn]
) -> list[Chapter]:
    await db.execute(delete(Chapter).where(Chapter.course_id == int(course.id)))
    for index, item in enumerate(chapters, start=1):
        db.add(
            Chapter(
                course_id=int(course.id),
                idx=index,
                title=item.title.strip(),
                duration=item.duration,
                video_url=item.video_url or "",
                locked=1 if item.locked else 0,
            )
        )
    course.duration = sum(item.duration for item in chapters)
    course.action_count = len(chapters)
    course.updated_at = now_cn()
    await db.flush()
    return await _course_chapters(db, int(course.id))


@router.post("/courses", summary="A117 新建课程")
async def admin_course_create(
    payload: CourseCreateIn,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    now = now_cn()
    course = Course(
        title=payload.title.strip(),
        cover=payload.cover,
        video_cover=payload.video_cover,
        duration=sum(item.duration for item in payload.chapters),
        action_count=len(payload.chapters),
        difficulty=payload.difficulty,
        category=payload.category,
        coach_name=payload.coach_name.strip(),
        coach_avatar=payload.coach_avatar,
        coach_title=payload.coach_title.strip(),
        intro=payload.intro,
        suitable_for=payload.suitable_for,
        tags=payload.tags,
        related_ids=_to_int_ids(payload.related_ids),
        learn_count=0,
        collect_count=0,
        is_main=1 if payload.is_main else 0,
        sort=payload.sort,
        status=payload.status,
        created_at=now,
        updated_at=now,
    )
    db.add(course)
    await db.flush()
    await _sync_course_chapters(db, course, payload.chapters)
    return ok(
        {
            "course": {
                "id": str(int(course.id)),
                "title": course.title,
                "status": int(course.status),
                "category": course.category,
                "duration": int(course.duration or 0),
                "actionCount": int(course.action_count or 0),
                "createdAt": fmt_dt(course.created_at) or "",
                "updatedAt": fmt_dt(course.updated_at) or "",
            }
        }
    )


@router.patch("/courses/{course_id}", summary="A118 编辑课程")
async def admin_course_update(
    course_id: int,
    payload: CourseUpdateIn,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    course = await db.get(Course, course_id)
    if not course:
        raise NotFound("课程不存在")
    fields = payload.model_fields_set
    mapping = {
        "title": "title",
        "cover": "cover",
        "video_cover": "video_cover",
        "category": "category",
        "difficulty": "difficulty",
        "coach_name": "coach_name",
        "coach_avatar": "coach_avatar",
        "coach_title": "coach_title",
        "intro": "intro",
        "suitable_for": "suitable_for",
        "tags": "tags",
        "is_main": "is_main",
        "sort": "sort",
    }
    for source, target in mapping.items():
        if source not in fields:
            continue
        value = getattr(payload, source)
        if source == "is_main":
            value = 1 if value else 0
        setattr(course, target, value)
    if "related_ids" in fields:
        course.related_ids = _to_int_ids(payload.related_ids or [], self_id=course_id)
    course.updated_at = now_cn()
    await db.flush()
    chapters = await _course_chapters(db, course_id)
    return ok(
        {
            "course": {
                "id": str(int(course.id)),
                "title": course.title,
                "status": int(course.status),
                "category": course.category,
                "duration": int(course.duration or 0),
                "actionCount": int(course.action_count or 0),
                "updatedAt": fmt_dt(course.updated_at) or "",
                "chapterCount": len(chapters),
            }
        }
    )


@router.patch("/courses/{course_id}/status", summary="A119 课程上下架")
async def admin_course_status(
    course_id: int,
    payload: StatusIn,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    course = await db.get(Course, course_id)
    if not course:
        raise NotFound("课程不存在")
    changed = int(course.status or 0) != payload.status
    course.status = payload.status
    course.updated_at = now_cn()
    await db.flush()
    return ok({"courseId": str(course_id), "status": payload.status, "changed": changed})


@router.put("/courses/{course_id}/chapters", summary="A120 批量替换章节")
async def admin_course_chapters(
    course_id: int,
    payload: ChaptersIn,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    course = await db.get(Course, course_id)
    if not course:
        raise NotFound("课程不存在")
    chapters = await _sync_course_chapters(db, course, payload.chapters)
    return ok(
        {
            "chapters": [_chapter_vo(item) for item in chapters],
            "duration": int(course.duration or 0),
            "actionCount": int(course.action_count or 0),
        }
    )


@router.delete("/courses/{course_id}", summary="A120b 删除课程（需先下架）")
async def admin_course_delete(
    course_id: int,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    course = await db.get(Course, course_id)
    if not course or course.deleted:
        raise NotFound("课程不存在")
    if int(course.status or 0) == 1:
        raise ValidationBiz("请先下架该课程，再执行删除")
    course.deleted = 1
    course.updated_at = now_cn()
    await db.flush()
    return ok({"courseId": str(course_id), "deleted": True})


# ---------------------------------------------------------------------------
# 上传 / 字典 / 概览
# ---------------------------------------------------------------------------


@router.post("/upload/images", summary="A127 管理端图片上传")
async def admin_upload_images(
    files: list[UploadFile] = File(...),
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    if not files:
        raise BadRequest("请选择图片")
    if len(files) > 9:
        raise ValidationBiz("单次最多上传 9 张图片")
    items: list[dict] = []
    for file in files:
        raw = await file.read()
        result = await save_image(db, int(admin.id), file.filename, raw)
        items.append(
            {
                "url": result["url"],
                "width": result["width"],
                "height": result["height"],
                "size": result["size"],
                "mime": result["mime"],
            }
        )
    return ok({"items": items})


@router.get("/meta/options", summary="A130 枚举与限制")
async def admin_meta(
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    # 分类、难度、标签候选来自 dict_items，管理端可在「筛选条目」页维护
    return ok(await dict_service.load_options(db))


async def _count(db: AsyncSession, model, *conditions) -> int:
    stmt = select(func.count()).select_from(model)
    for condition in conditions:
        stmt = stmt.where(condition)
    return int((await db.scalar(stmt)) or 0)


@router.get("/stats/overview", summary="A95 运营概览")
async def admin_overview(
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    today = start_of_day(0)
    dates = [today.date() - timedelta(days=offset) for offset in range(6, -1, -1)]
    date_keys = [item.isoformat() for item in dates]

    async def trend(model) -> dict[str, int]:
        rows = (
            await db.execute(
                select(func.date(model.created_at), func.count())
                .where(model.created_at >= start_of_day(-6))
                .group_by(func.date(model.created_at))
            )
        ).all()
        mapping = {str(day): int(count) for day, count in rows}
        return {key: mapping.get(key, 0) for key in date_keys}

    user_trend = await trend(User)
    post_trend = await trend(Post)
    comment_trend = await trend(Comment)

    async def count_where(model, clause) -> int:
        return int((await db.scalar(select(func.count()).select_from(model).where(clause))) or 0)

    return ok(
        {
            "totals": {
                "users": await _count(db, User),
                "posts": await _count(db, Post, Post.deleted == 0),
                "comments": await _count(db, Comment, Comment.status != "deleted"),
                "topics": await _count(db, Topic),
                "courses": await _count(db, Course, Course.deleted == 0),
                "products": await _count(db, Product, Product.deleted == 0),
                "admins": await _count(db, AdminUser),
            },
            "pending": {
                "posts": await count_where(Post, Post.status == "reviewing"),
                "hiddenPosts": await count_where(Post, Post.status == "hidden"),
                "disabledUsers": await count_where(User, User.status == 0),
            },
            "today": {
                "newUsers": await count_where(User, User.created_at >= today),
                "newPosts": await count_where(Post, Post.created_at >= today),
                "newComments": await count_where(Comment, Comment.created_at >= today),
                "reviews": 0,
            },
            "trend": [
                {
                    "date": key,
                    "users": user_trend[key],
                    "posts": post_trend[key],
                    "comments": comment_trend[key],
                }
                for key in date_keys
            ],
        }
    )


# ---------------------------------------------------------------------------
# 未实装模块：返回 501，明确区分“未实现”与“不存在”
# 管理端开发环境这些页面走 Mock；关闭 Mock 后会得到 501。
# ---------------------------------------------------------------------------


def _not_implemented() -> JSONResponse:
    return JSONResponse(
        status_code=501,
        content=envelope(50100, "管理端接口将在 1.1 版本提供", None, current_request_id()),
    )


# A91 / A92（内容列表、详情、审核、删除）已实装，见 admin_posts.py


# A108 评论治理已实装，见 admin_comments.py


@router.get("/users", summary="A93 用户列表（未实装）")
async def admin_users_placeholder():
    return _not_implemented()


@router.patch("/users/{user_id}/status", summary="A94 用户状态（未实装）")
async def admin_user_status_placeholder(user_id: int):
    return _not_implemented()


# A111 话题管理已实装，见 admin_taxonomy.py


@router.get("/admins", summary="A100 管理员列表（未实装）")
async def admin_admins_placeholder():
    return _not_implemented()


@router.get("/audit-logs", summary="A129 审计日志（未实装）")
async def admin_audit_placeholder():
    return _not_implemented()
