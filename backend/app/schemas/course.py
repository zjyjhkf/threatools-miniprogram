from app.core.response import CamelModel


class CourseItem(CamelModel):
    id: int
    title: str
    cover: str = ""
    video_cover: str = ""
    duration: int = 0
    action_count: int = 0
    difficulty: str = "beginner"
    category: str = "rehab"
    coach_name: str = ""
    coach_avatar: str = ""
    coach_title: str = ""
    learn_count: int = 0
    collect_count: int = 0
    is_main: bool = False
    collected: bool = False
    tags: list[str] = []


class ChapterItem(CamelModel):
    id: int
    idx: int
    title: str
    duration: int = 0
    locked: bool = False


class CourseDetailData(CamelModel):
    course: CourseItem
    intro: str = ""
    suitable_for: list[str] = []
    chapters: list[ChapterItem] = []
    collected: bool = False


class CourseListData(CamelModel):
    list: list[CourseItem]
    total: int
    page: int
    size: int
    has_more: bool
    categories: list[dict] = []


class LearnResult(CamelModel):
    learn_count: int
