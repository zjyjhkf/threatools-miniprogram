"""统一响应包：{code, message, data, requestId}；data 永不为裸数组。"""
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

T = TypeVar("T")


class CamelModel(BaseModel):
    """出参基类：snake_case 字段 → camelCase JSON。"""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        protected_namespaces=(),
    )


class Envelope(CamelModel, Generic[T]):
    code: int = 0
    message: str = "ok"
    data: T | None = None
    request_id: str = ""


def to_jsonable(value: Any) -> Any:
    """把 Pydantic 模型/嵌套结构转成 camelCase 的 JSON 友好对象。"""
    if isinstance(value, BaseModel):
        return value.model_dump(by_alias=True, mode="json")
    if isinstance(value, (list, tuple)):
        return [to_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {key: to_jsonable(item) for key, item in value.items()}
    return value


def envelope(code: int, message: str, data: Any, request_id: str) -> dict[str, Any]:
    return {
        "code": code,
        "message": message,
        "data": None if data is None else to_jsonable(data),
        "requestId": request_id,
    }


def ok(data: Any = None) -> dict[str, Any]:
    from app.core.request_id import current_request_id

    return envelope(0, "ok", data, current_request_id())
