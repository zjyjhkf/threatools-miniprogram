from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import rate_limit
from app.core.response import ok
from app.db.session import get_db
from app.schemas.auth import LoginRequest
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["认证"])


@router.post(
    "/wechat-login",
    summary="微信登录",
    dependencies=[Depends(rate_limit("auth:login", 30, 60))],
)
async def wechat_login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    return ok(await auth_service.login(db, payload))
