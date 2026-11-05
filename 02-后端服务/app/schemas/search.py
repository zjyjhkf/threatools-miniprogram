from app.core.response import CamelModel
from app.schemas.comment import CommentItem
from app.schemas.course import CourseItem
from app.schemas.post import PostItem
from app.schemas.product import ProductItem
from app.schemas.user import UserStats
from app.schemas.topic import TopicItem


class HotKeywordsData(CamelModel):
    keywords: list[str]


class SuggestData(CamelModel):
    list: list[str]


class SearchUser(CamelModel):
    id: int
    nickname: str = ""
    avatar: str = ""
    bio: str = ""
    follower_count: int = 0
    following: bool = False


class SearchAllData(CamelModel):
    posts: list[PostItem] = []
    courses: list[CourseItem] = []
    users: list[SearchUser] = []
    topics: list[TopicItem] = []
    products: list[ProductItem] = []


class FavoritesData(CamelModel):
    list: list[dict] = []
    total: int = 0
    page: int = 1
    size: int = 10
    has_more: bool = False


class FollowUser(CamelModel):
    id: int
    nickname: str = ""
    avatar: str = ""
    bio: str = ""
    follower_count: int = 0
    stats: UserStats | None = None


class FollowListData(CamelModel):
    list: list[FollowUser] = []
    total: int = 0
    page: int = 1
    size: int = 10
    has_more: bool = False


class CommentReceivedItem(CommentItem):
    post_id: int = 0
    post_content: str = ""
