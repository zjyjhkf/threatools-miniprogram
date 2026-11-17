"""内存滑动窗口限流（1.0 单实例足够；多实例需换 Redis）。"""
import asyncio
import time
from collections import defaultdict, deque

from fastapi import Request

from app.core.config import settings
from app.core.errors import RateLimited

_BUCKETS: dict[str, deque[float]] = defaultdict(deque)
_LOCK = asyncio.Lock()


def _identity(request: Request) -> str:
    auth = request.headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1].strip()
        try:
            from app.core.security import decode_token

            return "user:" + str(decode_token(token).get("sub"))
        except Exception:  # noqa: BLE001
            pass
    return "ip:" + client_ip(request)


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For") or ""
    ip = forwarded.split(",")[0].strip() if forwarded else ""
    return ip or (request.client.host if request.client else "unknown")


async def _consume(bucket: str, limit: int, window: int) -> bool:
    """记一次访问；超限返回 False，未超限返回 True。"""
    now = time.monotonic()
    async with _LOCK:
        q = _BUCKETS[bucket]
        while q and now - q[0] > window:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        # 简单防泄漏：桶过多时清理空桶
        if len(_BUCKETS) > 5000:
            for key in [k for k, v in _BUCKETS.items() if not v]:
                _BUCKETS.pop(key, None)
        return True


async def _hit(bucket: str, limit: int, window: int) -> None:
    if not await _consume(bucket, limit, window):
        raise RateLimited()


def rate_limit(name: str, limit: int, window: int = 3600):
    """返回 FastAPI 依赖：同一用户/ip 在 window 秒内最多 limit 次，超出 42901。"""

    async def dependency(request: Request) -> None:
        if not settings.RATE_LIMIT_ENABLE:
            return
        await _hit(f"{name}:{_identity(request)}", limit, window)

    return dependency


async def allow(bucket: str, limit: int, window: int) -> bool:
    """软限流：超限返回 False（不抛错），用于埋点这类「超出丢弃但仍 200」的场景。"""
    if not settings.RATE_LIMIT_ENABLE:
        return True
    return await _consume(bucket, limit, window)


def reset_limits() -> None:
    _BUCKETS.clear()
