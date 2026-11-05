"""request_id 中间件：贯穿日志、响应头、响应体。"""
import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware

request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")


def current_request_id() -> str:
    return request_id_ctx.get()


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        rid = (request.headers.get("X-Request-Id") or uuid.uuid4().hex[:16])[:32]
        token = request_id_ctx.set(rid)
        try:
            response = await call_next(request)
        finally:
            # 响应体里需要读取，故在 reset 之前读取已在路由层完成
            request_id_ctx.reset(token)
        response.headers["X-Request-Id"] = rid
        return response
