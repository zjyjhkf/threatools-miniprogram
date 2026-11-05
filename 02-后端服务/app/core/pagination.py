"""分页参数与游标工具。"""
from pydantic import BaseModel

MAX_SIZE = 30


class PageParams(BaseModel):
    page: int = 1
    size: int = 10

    def __init__(self, **data):
        super().__init__(**data)
        self.page = max(1, int(self.page or 1))
        self.size = min(max(1, int(self.size or 10)), MAX_SIZE)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.size


class CursorParams(BaseModel):
    cursor: str = ""
    size: int = 10

    def __init__(self, **data):
        super().__init__(**data)
        self.size = min(max(1, int(self.size or 10)), MAX_SIZE)

    @property
    def cursor_id(self) -> int:
        """非法游标按首页处理，不报错。"""
        try:
            value = int(str(self.cursor or "0"))
        except (TypeError, ValueError):
            return 0
        return max(0, value)


def page_payload(items: list, total: int, params: PageParams) -> dict:
    return {
        "list": items,
        "total": total,
        "page": params.page,
        "size": params.size,
        "hasMore": params.offset + len(items) < total,
    }


def cursor_payload(items: list, params: CursorParams, id_getter=lambda x: x.id) -> dict:
    has_more = len(items) > params.size
    visible = items[: params.size]
    next_cursor = str(id_getter(visible[-1])) if has_more and visible else ""
    return {"list": visible, "nextCursor": next_cursor, "hasMore": has_more}
