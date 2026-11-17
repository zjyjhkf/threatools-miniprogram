"""微信登录：code → openid → 用户落库 → 签发 JWT。"""
import hashlib
import logging
import random

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ServiceUnavailable, Unauthorized
from app.core.security import create_access_token
from app.models.user import User
from app.repositories.user_repo import UserRepo
from app.services.vo import user_vo
from app.utils.text import clean_text
from app.utils.time import now_cn

logger = logging.getLogger("app.auth")


async def _real_code2session(code: str) -> dict:
    """真实 code2session：任何 code（wx.login 产出的临时凭证）。"""
    try:
        async with httpx.AsyncClient(timeout=6) as client:
            resp = await client.get(
                "https://api.weixin.qq.com/sns/jscode2session",
                params={
                    "appid": settings.WX_APPID,
                    "secret": settings.WX_SECRET,
                    "js_code": code,
                    "grant_type": "authorization_code",
                },
            )
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001
        logger.exception("code2session failed")
        raise ServiceUnavailable("微信登录异常，请稍后重试") from exc

    if payload.get("openid"):
        return payload

    errcode = int(payload.get("errcode") or 0)
    logger.warning("code2session reject errcode=%s errmsg=%s", errcode, payload.get("errmsg"))
    # 服务端配置类错误：明确指出是配置问题，避免误判成用户登录失败
    if errcode in (40013, 40125):
        raise ServiceUnavailable("服务端微信配置有误（AppID/AppSecret），请联系管理员")
    if errcode == 40029:
        raise Unauthorized("登录凭证已失效，请重新点击登录")
    if errcode == 40163:
        raise Unauthorized("登录凭证已被使用，请重试")
    if errcode == 45011:
        raise Unauthorized("登录过于频繁，请稍后再试")
    raise Unauthorized("微信登录失败，请重试")


async def code2session(code: str) -> dict:
    """有 AppSecret 时一律走真实微信登录；否则回退到本地 mock（仅非生产）。"""
    if settings.WX_SECRET:
        return await _real_code2session(code)
    if settings.WX_MOCK_LOGIN and not settings.is_prod:
        # 联调：显式 mock_<id> 按 id 映射；普通 wx.login code 固定落到种子用户
        if code.startswith("mock_"):
            open_id = code
        else:
            open_id = settings.WX_MOCK_OPENID or f"mock_{hashlib.sha256(code.encode()).hexdigest()[:24]}"
        return {"openid": open_id, "session_key": "", "mock": True}
    raise ServiceUnavailable("服务端未配置微信密钥（WX_SECRET），请在 backend/.env 填写小程序 AppSecret")


async def login(db: AsyncSession, payload) -> dict:
    session = await code2session(payload.code)
    open_id = str(session["openid"])
    union_id = session.get("unionid")

    repo = UserRepo(db)
    user = await repo.by_openid(open_id)
    is_new = user is None
    if user is None:
        user = User(
            open_id=open_id,
            union_id=union_id,
            nickname=f"运动用户{random.randint(1000, 9999)}",
            gender="secret",
            profile_visibility="self",
            role="user",
            status=1,
        )
        await repo.add(user)
    else:
        if union_id and not user.union_id:
            user.union_id = union_id
        if user.status != 1:
            raise Unauthorized("账号已被停用，如有疑问请联系客服")

    nickname = clean_text(getattr(payload, "nickname", None), 32)
    if nickname:
        user.nickname = nickname
    avatar = getattr(payload, "avatar", None)
    if avatar:
        user.avatar = str(avatar)[:512]

    user.last_login_at = now_cn()
    await db.flush()
    if is_new:
        await db.refresh(user)

    token, expires_in = create_access_token(int(user.id), open_id, role=user.role or "user")
    profile = await repo.profile(int(user.id))
    stats = await repo.stats(int(user.id))
    logger.info("login ok user_id=%s new=%s", user.id, is_new)
    return {
        "token": token,
        "expiresIn": expires_in,
        "isNewUser": is_new,
        "user": user_vo(
            user,
            self=True,
            profile=profile,
            post_count=stats["post_count"],
            like_count=stats["like_received_count"],
            follow_count=stats["follower_count"],
        ),
    }
