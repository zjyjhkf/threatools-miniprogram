from pydantic import Field, field_validator

from app.core.response import CamelModel


class CommentUser(CamelModel):
    id: int
    nickname: str = ""
    avatar: str = ""


class CommentItem(CamelModel):
    id: int
    content: str
    user: CommentUser
    parent_id: int = 0
    reply_to_user: CommentUser | None = None
    like_count: int = 0
    liked: bool = False
    can_delete: bool = False
    created_at: str


class CreateCommentRequest(CamelModel):
    content: str = Field(min_length=1, max_length=400)
    reply_to_id: int | None = None

    @field_validator("reply_to_id", mode="before")
    @classmethod
    def _blank_reply_to_none(cls, value):
        """兼容小程序把"未回复"传成空串/0 的情况，统一按无回复处理。"""
        if value is None:
            return None
        if isinstance(value, str):
            text = value.strip()
            return None if text in ("", "0") else text
        if value == 0:
            return None
        return value


class CreateCommentBody(CreateCommentRequest):
    post_id: int


class CommentListData(CamelModel):
    list: list[CommentItem]
    total: int
    page: int
    size: int
    has_more: bool


class CommentCreatedData(CamelModel):
    id: int
    comment_count: int
