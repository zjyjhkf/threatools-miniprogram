from pydantic import Field, field_validator

from app.core.response import CamelModel


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
    content: str = ""
    images: list[str] = []
    cover: str = ""
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
    content: str = Field(default="", max_length=1000)
    images: list[str] = []
    topic_ids: list[int] = []
    visibility: str = Field(default="public", pattern="^(public|followers|private)$")

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
