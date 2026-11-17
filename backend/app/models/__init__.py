"""集中导出所有 ORM 模型，保证 metadata 完整（Alembic 依赖）。"""
from app.models.admin_user import AdminUser
from app.models.body_profile import BodyProfile
from app.models.collection import Collection
from app.models.comment import Comment
from app.models.course import Chapter, Course
from app.models.dict_item import DictItem
from app.models.follow import Follow
from app.models.like import Like
from app.models.post import Post, PostImage
from app.models.product import Product, ProductImage
from app.models.topic import PostTopic, Topic
from app.models.track_event import TrackEvent
from app.models.upload_file import UploadFile
from app.models.user import User

__all__ = [
    "AdminUser",
    "BodyProfile",
    "Chapter",
    "Collection",
    "Comment",
    "Course",
    "DictItem",
    "Follow",
    "Like",
    "Post",
    "PostImage",
    "PostTopic",
    "Product",
    "ProductImage",
    "Topic",
    "TrackEvent",
    "UploadFile",
    "User",
]
