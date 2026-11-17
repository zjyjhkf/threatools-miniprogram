from pydantic import Field

from app.core.response import CamelModel


class TrackEventItem(CamelModel):
    event: str = Field(min_length=1, max_length=64)
    page: str | None = Field(default=None, max_length=128)
    props: dict | None = None


class TrackBatch(CamelModel):
    events: list[TrackEventItem] = Field(default_factory=list, max_length=50)
    platform: str | None = Field(default=None, max_length=20)
    version: str | None = Field(default=None, max_length=20)
    scene: int | None = None


class TrackResult(CamelModel):
    accepted: int = 0
