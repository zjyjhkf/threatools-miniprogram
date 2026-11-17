from typing import Literal

from pydantic import Field, field_validator

from app.core.response import CamelModel


class PostMetric(CamelModel):
    """运动摘要：地点/时长二选一。"""

    icon: Literal["map-pin", "timer"]
    text: str = Field(min_length=1, max_length=24)

    @field_validator("text")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        text = (value or "").strip()
        if not text:
            raise ValueError("运动摘要不能为空")
        return text


class CoverInfo(CamelModel):
    url: str = ""
    width: int = 0
    height: int = 0


class PostAuthor(CamelModel):
    id: int
    nickname: str = ""
    avatar: str = ""
    following: bool = False


class PostTopicBrief(CamelModel):
    id: int
    name: str


class PostItem(CamelModel):
    id: int
    title: str = ""
    metric: PostMetric | None = None
    content: str = ""
    images: list[str] = []
    cover: CoverInfo = CoverInfo()
    author: PostAuthor
    topics: list[PostTopicBrief] = []
    like_count: int = 0
    comment_count: int = 0
    collect_count: int = 0
    liked: bool = False
    collected: bool = False
    created_at: str


class PostDetail(PostItem):
    visibility: str = "public"
    can_delete: bool = False


class CreatePostRequest(CamelModel):
    # 字数与运动摘要按 01 §错误码走业务校验（42201），故此处不做长度/枚举约束
    content: str = ""
    title: str | None = None
    metric: dict | None = None
    images: list[str] = []
    topic_ids: list[int] = []
    visibility: str = Field(default="public", pattern="^(public|followers|private)$")

    @field_validator("title")
    @classmethod
    def _blank_title(cls, value: str | None) -> str | None:
        text = (value or "").strip()
        return text or None

    @field_validator("images")
    @classmethod
    def _check_images(cls, value: list[str]) -> list[str]:
        if len(value) > 9:
            raise ValueError("最多 9 张图片")
        return value

    @field_validator("topic_ids")
    @classmethod
    def _check_topics(cls, value: list[int]) -> list[int]:
        if len(value) > 3:
            raise ValueError("最多 3 个话题")
        return value


class PostCreatedData(CamelModel):
    id: int


class LikeResult(CamelModel):
    liked: bool
    like_count: int


class CollectResult(CamelModel):
    collected: bool
    collect_count: int


class PostListData(CamelModel):
    list: list[PostItem]
    total: int
    page: int
    size: int
    has_more: bool
