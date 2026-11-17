"""图片上传：类型嗅探 + 大小限制 + 头像压缩 + 按日期分目录 + 落库。"""
import io
import os
import uuid

from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import BadRequest
from app.models.upload_file import UploadFile
from app.utils.image import ALLOWED, verify_image
from app.utils.time import now_cn

AVATAR_SIZE = 512


def _compress_avatar(data: bytes, ext: str) -> tuple[bytes, str]:
    """头像压缩到 512x512 以内，统一转 JPEG，减小体积。"""
    try:
        with Image.open(io.BytesIO(data)) as img:
            img = img.convert("RGB")
            img.thumbnail((AVATAR_SIZE, AVATAR_SIZE), Image.LANCZOS)
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=85, optimize=True)
        return buffer.getvalue(), "jpg"
    except Exception:  # noqa: BLE001
        return data, ext


async def save_image(db: AsyncSession, user_id: int, filename: str | None, data: bytes,
                     *, avatar: bool = False) -> dict:
    if not data:
        raise BadRequest("上传文件为空")
    if len(data) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise BadRequest(f"图片不能超过 {settings.MAX_UPLOAD_MB}MB")
    verified = verify_image(data)
    if not verified:
        raise BadRequest("仅支持 jpg / png / webp 格式的图片")
    ext, width, height = verified

    if avatar:
        data, ext = _compress_avatar(data, ext)
        verified = verify_image(data)
        if not verified:
            raise BadRequest("头像处理失败，请更换图片")
        ext, width, height = verified

    stamp = now_cn()
    rel_dir = stamp.strftime("%Y/%m/%d")
    rel_path = f"{rel_dir}/{uuid.uuid4().hex}.{ext}"
    abs_dir = os.path.join(settings.UPLOAD_DIR, rel_dir)
    os.makedirs(abs_dir, exist_ok=True)
    with open(os.path.join(settings.UPLOAD_DIR, rel_path), "wb") as fp:
        fp.write(data)

    url = f"{settings.UPLOAD_URL_PREFIX.rstrip('/')}/uploads/{rel_path}"
    db.add(
        UploadFile(
            user_id=user_id,
            path=rel_path,
            url=url,
            mime=ALLOWED.get(ext, "image/jpeg"),
            size=len(data),
        )
    )
    await db.flush()
    return {
        "url": url,
        "name": (filename or f"image.{ext}")[:120],
        "size": len(data),
        "mime": ALLOWED.get(ext, "image/jpeg"),
        "width": width,
        "height": height,
    }


async def save_images(db: AsyncSession, user_id: int, files: list[tuple[str | None, bytes]]) -> dict:
    if len(files) > settings.MAX_IMAGE_COUNT:
        raise BadRequest(f"单次最多上传 {settings.MAX_IMAGE_COUNT} 张图片")
    urls: list[str] = []
    for filename, data in files:
        result = await save_image(db, user_id, filename, data)
        urls.append(result["url"])
    return {"urls": urls}
