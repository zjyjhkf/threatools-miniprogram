"""文本清洗与脱敏工具。"""
import re

_EMOJI_SAFE = re.compile(r"[\u0000-\u0008\u000b\u000c\u000e-\u001f]")


def clean_text(raw: str | None, max_len: int) -> str:
    if not raw:
        return ""
    text = _EMOJI_SAFE.sub("", str(raw)).replace("\r\n", "\n").strip()
    return text[:max_len]


def is_blank(raw: str | None) -> bool:
    return not (raw or "").strip()


def mask_nickname(nickname: str | None, user_id: int | None = None) -> str:
    name = (nickname or "").strip()
    if not name:
        return f"运动用户{(user_id or 0) % 10000:04d}" if user_id else "运动用户"
    if len(name) <= 2:
        return name[0] + "*"
    return name[0] + "*" * (len(name) - 2) + name[-1]


def mask_phone(phone: str | None) -> str:
    value = (phone or "").strip()
    return value[:3] + "****" + value[-4:] if len(value) >= 7 else value
