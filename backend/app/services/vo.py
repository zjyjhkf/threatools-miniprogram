"""VO 构造：输出字段与 0.1 前端 mock 契约严格一致（camelCase dict）。"""
import json

from app.utils.text import mask_nickname
from app.utils.time import days_since, fmt_dt

COMPLETENESS_TOTAL = 7


def _num(value):
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def profile_vo(profile) -> dict:
    """未建档也返回完整字段集，保证 A04 的 GET→PUT 往返结构稳定（前端不用判空）。"""
    if not profile:
        return {
            "height": None,
            "weight": None,
            "goals": [],
            "frequency": None,
            "level": None,
            "focusParts": [],
            "injuries": "",
            "allowPublic": False,
        }
    return {
        "height": int(profile.height) if profile.height else None,
        "weight": _num(profile.weight),
        "goals": list(profile.goals or []),
        "frequency": profile.frequency or None,
        "level": profile.level or None,
        "focusParts": list(profile.focus_parts or []),
        "injuries": profile.injuries or "",
        "allowPublic": bool(profile.allow_public),
    }


def completeness_of(user, profile) -> dict:
    missing = []
    if not user.avatar:
        missing.append("avatar")
    if not user.nickname:
        missing.append("nickname")
    if not user.gender or user.gender == "secret":
        missing.append("gender")
    if not profile or not profile.height:
        missing.append("height")
    if not profile or profile.weight is None:
        missing.append("weight")
    if not profile or not profile.goals:
        missing.append("goals")
    if not user.bio:
        missing.append("bio")
    return {
        "filled": COMPLETENESS_TOTAL - len(missing),
        "total": COMPLETENESS_TOTAL,
        "missing": missing,
    }


def user_vo(
    user,
    *,
    self: bool = False,
    profile=None,
    post_count: int = 0,
    like_count: int = 0,
    follow_count: int = 0,
    followed: bool = False,
) -> dict:
    visible = self or (user.profile_visibility or "self") == "public"
    vo = {
        "id": str(int(user.id)),
        "nickname": user.nickname or mask_nickname(None, int(user.id)),
        "avatar": user.avatar or "",
        "gender": user.gender or "secret",
        "bio": (user.bio or "") if visible else "",
        "city": (user.city or "") if visible else "",
        "birthday": user.birthday.isoformat() if (self and user.birthday) else None,
        "wechatId": user.wechat_id or "",
        "profileVisibility": user.profile_visibility or "self",
        "createdAt": fmt_dt(user.created_at) or "",
        "postCount": int(post_count or 0),
        "likeCount": int(like_count or 0),
        "followCount": int(follow_count or 0),
        "followed": bool(followed),
        "joinedDays": days_since(user.created_at, 1),
        "completeness": completeness_of(user, profile),
    }
    if self:
        vo["bodyProfile"] = profile_vo(profile)
        vo["isSelf"] = True
    return vo


def image_vo(url: str, width: int | None = None, height: int | None = None) -> dict:
    return {"url": url or "", "width": int(width or 1200), "height": int(height or 900)}


def post_vo(
    post,
    *,
    author,
    images: list[dict],
    topics: list[dict],
    followed: bool = False,
    liked: bool = False,
    collected: bool = False,
    viewer_id: int | None = None,
    cover_url: str | None = None,
    cover_width: int | None = None,
    cover_height: int | None = None,
) -> dict:
    author_vo = {
        "id": str(int(author.id)) if author else str(int(post.user_id)),
        "nickname": (author.nickname if author else "") or "匿名用户",
        "avatar": (author.avatar if author else "") or "",
    }
    first_image = images[0] if images else {}
    cover_image_url = cover_url if cover_url is not None else (first_image.get("url") or post.cover_image or "")
    cover = {
        "url": cover_image_url or "",
        "width": int(cover_width if cover_width is not None else (first_image.get("width") or 0)),
        "height": int(cover_height if cover_height is not None else (first_image.get("height") or 0)),
    }
    metric = post.metric
    if isinstance(metric, str):
        try:
            metric = json.loads(metric)
        except (TypeError, ValueError):
            metric = None
    return {
        "id": str(int(post.id)),
        "author": author_vo,
        "followed": bool(followed),
        "title": (post.title or "").strip() or (post.content or "")[:24],
        "cover": cover,
        "metric": metric if isinstance(metric, dict) else None,
        "content": post.content or "",
        "images": images,
        "imageCount": len(images),
        "coverImage": cover["url"],
        "topics": topics,
        "likeCount": int(post.like_count or 0),
        "commentCount": int(post.comment_count or 0),
        "collectCount": int(post.collect_count or 0),
        "liked": bool(liked),
        "collected": bool(collected),
        "status": post.status or "published",
        "visibility": post.visibility or "public",
        "createdAt": fmt_dt(post.created_at) or "",
        "isAuthor": bool(viewer_id and int(post.user_id) == int(viewer_id)),
    }


def topic_vo(topic, *, collected: bool | None = None) -> dict:
    vo = {
        "id": str(int(topic.id)),
        "name": topic.name or "",
        "description": topic.description or "",
        "userCount": int(topic.user_count or 0),
        "postCount": int(topic.post_count or 0),
        "isHot": bool(topic.is_hot),
    }
    if collected is not None:
        vo["collected"] = bool(collected)
    return vo


def course_vo(course) -> dict:
    return {
        "id": str(int(course.id)),
        "title": course.title or "",
        "cover": course.cover or "",
        "duration": int(course.duration or 0),
        "actionCount": int(course.action_count or 0),
        "difficulty": course.difficulty or "beginner",
        "category": course.category or "rehab",
        "coachName": course.coach_name or "",
        "learnCount": int(course.learn_count or 0),
        "isMain": bool(course.is_main),
    }


def chapter_vo(chapter) -> dict:
    return {
        "id": str(int(chapter.id)),
        "idx": int(chapter.idx or 0),
        "title": chapter.title or "",
        "duration": int(chapter.duration or 0),
        "videoUrl": chapter.video_url or "",
        "locked": bool(chapter.locked),
    }


def product_vo(product, cover: str = "", image_count: int = 0) -> dict:
    return {
        "id": str(int(product.id)),
        "name": product.name or "",
        "model": product.model or "",
        "category": product.category or "rehab",
        "tagline": product.tagline or "",
        "tags": list(product.tags or []),
        "cover": cover or product.cover or "",
        "imageCount": int(image_count or 0),
    }
