"""业务异常体系 + 全局异常处理器：绝不让 FastAPI 默认 detail 泄漏。"""
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.request_id import current_request_id
from app.core.response import envelope

logger = logging.getLogger("app.error")

FIELD_LABELS = {
    "code": "登录凭证",
    "content": "内容",
    "name": "名称",
    "nickname": "昵称",
    "avatar": "头像",
    "gender": "性别",
    "birthday": "生日",
    "city": "城市",
    "bio": "简介",
    "height": "身高",
    "weight": "体重",
    "goals": "运动目标",
    "frequency": "运动频次",
    "level": "运动水平",
    "focus_parts": "关注部位",
    "injuries": "旧伤情况",
    "allow_public": "隐私开关",
    "images": "图片",
    "topic_ids": "话题",
    "visibility": "可见范围",
    "reply_to_id": "回复对象",
    "q": "搜索词",
    "page": "页码",
    "size": "分页大小",
    "type": "类型",
}


class BizError(Exception):
    code: int = 40001
    http_status: int = 200
    message: str = "请求失败"

    def __init__(self, message: str | None = None, code: int | None = None):
        if message:
            self.message = message
        if code:
            self.code = code
        super().__init__(self.message)


class BadRequest(BizError):
    code, http_status, message = 40001, 400, "参数不合法"


class Unauthorized(BizError):
    code, http_status, message = 40101, 401, "登录已失效"


class Forbidden(BizError):
    code, http_status, message = 40301, 403, "没有权限"


class NotFound(BizError):
    code, http_status, message = 40401, 404, "内容不存在或已删除"


class Conflict(BizError):
    code, http_status, message = 40901, 409, "请勿重复操作"


class ValidationBiz(BizError):
    code, http_status, message = 42201, 422, "参数不合法"


class RateLimited(BizError):
    code, http_status, message = 42901, 429, "操作太频繁，请稍后再试"


class ServerError(BizError):
    code, http_status, message = 50000, 500, "服务异常，请稍后重试"


class ServiceUnavailable(BizError):
    code, http_status, message = 50300, 503, "服务维护中，请稍后重试"


def _json(code: int, message: str, status: int, request_id: str) -> JSONResponse:
    return JSONResponse(status_code=status, content=envelope(code, message, None, request_id))


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(BizError)
    async def _biz(_: Request, exc: BizError) -> JSONResponse:
        return _json(exc.code, exc.message, exc.http_status, current_request_id())

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        message = "参数不合法"
        errors = exc.errors()
        if errors:
            first = errors[0]
            loc = [str(x) for x in first.get("loc", []) if x not in ("body", "query", "path")]
            field = loc[-1] if loc else ""
            label = FIELD_LABELS.get(field, field or "参数")
            message = f"{label}格式不正确"
        return _json(40001, message, 400, current_request_id())

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        mapping = {401: 40101, 403: 40301, 404: 40401, 405: 40001, 429: 42901}
        code = mapping.get(exc.status_code, 50000 if exc.status_code >= 500 else 40001)
        message = str(exc.detail) if exc.detail and exc.status_code < 500 else "请求失败"
        if exc.status_code == 404:
            message = "接口不存在"
        return _json(code, message, exc.status_code, current_request_id())

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error: %s", exc)
        return _json(50000, "服务异常，请稍后重试", 500, current_request_id())
