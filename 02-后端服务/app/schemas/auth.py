from pydantic import Field

from app.core.response import CamelModel


class LoginRequest(CamelModel):
    code: str = Field(min_length=1, max_length=128)
    nickname: str | None = Field(default=None, max_length=32)
    avatar: str | None = Field(default=None, max_length=512)


class UserBrief(CamelModel):
    id: int
    nickname: str = ""
    avatar: str = ""
    bio: str = ""
    wechat_id: str = ""
    following: bool = False
    follower_count: int = 0
    post_count: int = 0


class LoginData(CamelModel):
    token: str
    expires_in: int
    is_new_user: bool
    user: UserBrief
