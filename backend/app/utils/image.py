"""图片类型嗅探（不信任客户端 Content-Type / 文件名）。"""
import io

from PIL import Image

ALLOWED = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}

_MAGIC: list[tuple[bytes, str]] = [
    (b"\xff\xd8\xff", "jpg"),
    (b"\x89PNG\r\n\x1a\n", "png"),
    (b"RIFF", "webp"),
]


def sniff_ext(data: bytes) -> str | None:
    for magic, ext in _MAGIC:
        if data.startswith(magic):
            if ext == "webp" and data[8:12] != b"WEBP":
                return None
            return ext
    return None


def verify_image(data: bytes) -> tuple[str, int, int] | None:
    """返回 (ext, width, height)；非法或损坏的图片直接判空。"""
    ext = sniff_ext(data)
    if not ext:
        return None
    try:
        with Image.open(io.BytesIO(data)) as img:
            img.verify()
        with Image.open(io.BytesIO(data)) as img:
            width, height = img.size
    except Exception:  # noqa: BLE001
        return None
    if width <= 0 or height <= 0:
        return None
    return ext, width, height
