from datetime import date

from pydantic import Field

from app.core.response import CamelModel


class MeData(CamelModel):
    id: int
    nickname: str = ""
    avatar: str = ""
    gender: str = "secret"
    birthday: str | None = None
    city: str = ""
    bio: str = ""
    wechat_id: str = ""
    profile_visibility: str = "self"
    created_at: str | None = None


class UpdateProfileRequest(CamelModel):
    nickname: str | None = Field(default=None, max_length=32)
    avatar: str | None = Field(default=None, max_length=512)
    gender: str | None = Field(default=None, pattern="^(male|female|secret)$")
    birthday: date | None = None
    city: str | None = Field(default=None, max_length=64)
    bio: str | None = Field(default=None, max_length=100)
    wechat_id: str | None = Field(default=None, max_length=64)
    profile_visibility: str | None = Field(default=None, pattern="^(self|followers|public)$")


class UserStats(CamelModel):
    following_count: int = 0
    follower_count: int = 0
    post_count: int = 0
    like_received_count: int = 0
    collect_count: int = 0


class BodyProfileData(CamelModel):
    height: int | None = None
    weight: float | None = None
    goals: list[str] = []
    frequency: str | None = None
    level: str | None = None
    focus_parts: list[str] = []
    injuries: str | None = None
    allow_public: bool = False
    weight_history: list[dict] = []


class BodyProfileUpdateRequest(CamelModel):
    height: int | None = Field(default=None, ge=80, le=250)
    weight: float | None = Field(default=None, ge=20, le=300)
    goals: list[str] | None = None
    frequency: str | None = Field(default=None, max_length=20)
    level: str | None = Field(default=None, max_length=20)
    focus_parts: list[str] | None = None
    injuries: str | None = Field(default=None, max_length=200)
    allow_public: bool | None = None


class UserHomeData(CamelModel):
    user: dict
    stats: UserStats
    posts: list[dict] = []
    has_more: bool = False
    next_cursor: str = ""


class RelationData(CamelModel):
    following: bool = False
    follower_count: int = 0
