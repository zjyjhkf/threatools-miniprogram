"""JWT 签发/校验 + 管理员密码哈希。"""
import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.core.config import settings
from app.core.errors import Unauthorized


def create_access_token(user_id: int, openid: str = "", role: str = "user", audience: str = "wxmp") -> tuple[str, int]:
    now = datetime.now(UTC)
    exp = now + timedelta(days=settings.JWT_EXPIRE_DAYS)
    payload = {
        "sub": str(user_id),
        "openid": openid,
        "role": role,
        "typ": "access",
        "aud": audience,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "jti": uuid.uuid4().hex,
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return token, settings.JWT_EXPIRE_DAYS * 86400


def decode_token(token: str, audience: str = "wxmp") -> dict:
    try:
        return jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            audience=audience,
            options={"require": ["exp", "sub"]},
        )
    except Exception as exc:  # noqa: BLE001 - 任何失败统一 401，避免探测
        raise Unauthorized() from exc


def hash_password(raw: str) -> str:
    return bcrypt.hashpw(raw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(raw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:  # noqa: BLE001
        return False
