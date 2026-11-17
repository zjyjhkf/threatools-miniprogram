"""生成种子占位图（头像 / 动态图 / 课程封面 / 产品图）。

种子数据来自 0.1 版 mock，图片 URL 为空，小程序列表会显示空白。
本脚本在 uploads/seed/ 下生成一组渐变占位图，seed.py 会自动引用。

用法：
    python -m scripts.gen_placeholders          # 缺失才生成
    python -m scripts.gen_placeholders --force  # 全部重绘
"""
import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from PIL import Image, ImageDraw, ImageFont  # noqa: E402

DATA_DIR = os.path.join(ROOT, "seeds", "data")
OUT_DIR = os.path.join(ROOT, "uploads", "seed")

FONT_CANDIDATES = [
    "C:/Windows/Fonts/msyhbd.ttc",
    "C:/Windows/Fonts/msyh.ttc",
    "/System/Library/Fonts/PingFang.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]

# 品牌色系：绿（恢复/健康）+ 橙（运动）两组交替
PALETTES = [
    ((22, 163, 74), (16, 185, 129)),
    ((234, 88, 12), (245, 158, 11)),
    ((13, 148, 136), (56, 189, 248)),
    ((101, 163, 13), (34, 197, 94)),
    ((217, 119, 6), (234, 179, 8)),
]


def _font(size: int):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default(size=size)


def _wrap(text: str, limit: int) -> list[str]:
    text = " ".join((text or "").split())
    if not text:
        return []
    lines: list[str] = []
    current = ""
    for char in text:
        current += char
        if len(current) >= limit:
            lines.append(current)
            current = ""
    if current:
        lines.append(current)
    return lines[:2]


def _gradient(size: tuple[int, int], palette: tuple[tuple[int, int], tuple[int, int]]):
    width, height = size
    top, bottom = palette
    img = Image.new("RGB", size)
    draw = ImageDraw.Draw(img)
    for y in range(height):
        ratio = y / max(height - 1, 1)
        color = tuple(int(top[i] + (bottom[i] - top[i]) * ratio) for i in range(3))
        draw.line([(0, y), (width, y)], fill=color)
    return img


def _decorate(img: Image.Image, title: str, subtitle: str, limit: int, scale: float):
    width, height = img.size
    draw = ImageDraw.Draw(img, "RGBA")
    # 右上角光斑，避免整张纯渐变发闷
    radius = int(width * 0.42)
    draw.ellipse(
        [width - radius, -radius // 2, width + radius // 2, radius],
        fill=(255, 255, 255, 26),
    )
    main_size = int(width * scale)
    title_font = _font(main_size)
    sub_font = _font(max(int(main_size * 0.42), 14))
    pad = int(width * 0.07)
    lines = _wrap(title, limit)
    line_h = int(main_size * 1.24)
    block_h = line_h * len(lines) + (int(sub_font.size * 1.5) if subtitle else 0)
    y = height - pad - block_h
    for line in lines:
        draw.text((pad, y), line, font=title_font, fill=(255, 255, 255, 240))
        y += line_h
    if subtitle:
        draw.text((pad, y + 6), subtitle, font=sub_font, fill=(255, 255, 255, 190))
    draw.text(
        (width - pad, pad),
        "健衡",
        font=_font(max(int(width * 0.05), 12)),
        fill=(255, 255, 255, 170),
        anchor="ra",
    )
    return img


def _save(img: Image.Image, name: str, force: bool) -> None:
    path = os.path.join(OUT_DIR, name)
    if not force and os.path.exists(path):
        return
    img.save(path, "JPEG", quality=84, optimize=True)


def load(name: str):
    with open(os.path.join(DATA_DIR, f"{name}.json"), encoding="utf-8") as fp:
        return json.load(fp)


def build(force: bool = False) -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    count = 0

    def emit(size, palette_index, name, title, subtitle, limit, scale):
        nonlocal count
        path = os.path.join(OUT_DIR, name)
        if not force and os.path.exists(path):
            return
        img = _gradient(size, PALETTES[palette_index % len(PALETTES)])
        _save(_decorate(img, title, subtitle, limit, scale), name, force)
        count += 1

    for index, user in enumerate(load("users")):
        uid = user["id"]
        emit((400, 400), index, f"avatar-{uid}.jpg",
             (user.get("nickname") or "运动用户")[:4], "", 4, 0.17)

    for index, post in enumerate(load("posts")):
        content = (post.get("content") or "").replace("\n", " ")
        emit((900, 900), index, f"post-{post['id']}.jpg",
             content[:16], "健衡运动社区", 10, 0.1)

    for index, course in enumerate(load("courses")):
        emit((960, 540), index, f"course-{course['id']}.jpg",
             course.get("title") or "训练课程", "系统训练 · 随时开练", 12, 0.075)

    for index, product in enumerate(load("products")):
        for shot in range(1, 5):
            emit((800, 800), index, f"product-{product['id']}-{shot}.jpg",
                 product.get("name") or "运动装备", f"细节图 {shot}/4", 8, 0.09)

    return count


def main() -> None:
    parser = argparse.ArgumentParser(description="生成种子占位图")
    parser.add_argument("--force", action="store_true", help="覆盖已有图片")
    args = parser.parse_args()
    count = build(args.force)
    print(f"placeholders ready: generated={count} dir={OUT_DIR}")


if __name__ == "__main__":
    main()
