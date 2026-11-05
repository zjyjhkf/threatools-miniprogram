from app.core.response import CamelModel
from app.schemas.post import PostItem


class TopicItem(CamelModel):
    id: int
    name: str
    description: str = ""
    post_count: int = 0
    user_count: int = 0
    is_hot: bool = False


class TopicListData(CamelModel):
    list: list[TopicItem]
    hot: list[TopicItem] = []


class TopicDetailData(CamelModel):
    topic: TopicItem
    posts: list[PostItem] = []
    total: int = 0
    page: int = 1
    size: int = 10
    has_more: bool = False
