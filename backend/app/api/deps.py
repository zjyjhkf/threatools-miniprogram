"""依赖注入：鉴权、分页参数。"""
from fastapi import Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Forbidden, Unauthorized
from app.core.pagination import PageParams
from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User

bearer = HTTPBearer(auto_error=False)


async def _load_user(credentials: HTTPAuthorizationCredentials, db: AsyncSession) -> User | None:
    payload = decode_token(credentials.credentials)
    try:
        user_id = int(payload.get("sub") or 0)
    except (TypeError, ValueError):
        return None
    user = await db.get(User, user_id)
    if not user or user.status != 1:
        return None
    return user


async def optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """游客可访问接口：token 无效时按游客处理。"""
    if not credentials:
        return None
    try:
        return await _load_user(credentials, db)
    except Exception:  # noqa: BLE001
        return None


async def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials:
        raise Unauthorized("请先登录")
    user = await _load_user(credentials, db)  # 无效 token 抛 Unauthorized
    if not user:
        raise Unauthorized("登录已失效，请重新登录")
    return user


async def admin_user(user: User = Depends(current_user)) -> User:
    if (user.role or "user") not in ("admin", "super"):
        raise Forbidden("需要管理员权限")
    return user


def page_params(page: int = Query(1, ge=1), size: int = Query(10, ge=1, le=30)) -> PageParams:
    return PageParams(page=page, size=size)
