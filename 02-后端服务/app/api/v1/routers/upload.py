from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user
from app.core.config import settings
from app.core.errors import BadRequest
from app.core.rate_limit import rate_limit
from app.core.response import ok
from app.db.session import get_db
from app.models.user import User
from app.services import upload_service

router = APIRouter(prefix="/upload", tags=["上传"])


def _read_limit() -> int:
    return settings.MAX_UPLOAD_MB * 1024 * 1024


@router.post("/avatar", summary="上传头像", dependencies=[Depends(rate_limit("upload", 30, 3600))])
async def upload_avatar(
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await file.read(_read_limit() + 1)
    result = await upload_service.save_image(db, int(user.id), file.filename, data, avatar=True)
    return ok({"url": result["url"]})


@router.post("/images", summary="上传动态图片", dependencies=[Depends(rate_limit("upload", 30, 3600))])
async def upload_images(
    files: list[UploadFile] = File(...),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    if not files:
        raise BadRequest("请选择要上传的图片")
    if len(files) > settings.MAX_IMAGE_COUNT:
        raise BadRequest(f"单次最多上传 {settings.MAX_IMAGE_COUNT} 张图片")
    payload: list[tuple[str | None, bytes]] = []
    for item in files:
        payload.append((item.filename, await item.read(_read_limit() + 1)))
    return ok(await upload_service.save_images(db, int(user.id), payload))


@router.post("", summary="上传单图（兼容）", dependencies=[Depends(rate_limit("upload", 30, 3600))])
async def upload_one(
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await file.read(_read_limit() + 1)
    return ok(await upload_service.save_image(db, int(user.id), file.filename, data))
