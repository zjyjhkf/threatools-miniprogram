"""埋点批量落库：单条失败不影响整批，永不阻塞主链路。"""
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.request_id import current_request_id
from app.models.track_event import TrackEvent
from app.utils.text import clean_text

logger = logging.getLogger("app.track")
MAX_BATCH = 50
MAX_PROPS_KEYS = 20


def _safe_props(props) -> dict:
    if not isinstance(props, dict):
        return {}
    safe: dict = {}
    for key, value in list(props.items())[:MAX_PROPS_KEYS]:
        if isinstance(value, (str, int, float, bool)) or value is None:
            safe[str(key)[:32]] = value[:100] if isinstance(value, str) else value
    return safe


async def ingest(db: AsyncSession, user_id: int | None, events: list[dict], platform: str | None,
                 app_version: str | None, scene: int | None) -> int:
    accepted = 0
    for item in events[:MAX_BATCH]:
        try:
            event = clean_text(item.get("event"), 64)
            if not event:
                continue
            db.add(
                TrackEvent(
                    event=event,
                    user_id=user_id,
                    page=clean_text(item.get("page"), 128) or None,
                    props=_safe_props(item.get("props")),
                    platform=clean_text(platform or item.get("platform"), 20) or None,
                    app_version=clean_text(app_version or item.get("version"), 20) or None,
                    scene=scene if isinstance(scene, int) else None,
                    request_id=current_request_id()[:32] or None,
                )
            )
            accepted += 1
        except Exception as exc:  # noqa: BLE001
            logger.warning("track item skipped: %s", exc)
    await db.flush()
    return accepted
