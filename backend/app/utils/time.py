"""时间统一口径：存储/计算用东八区 naive datetime，出参 YYYY-MM-DD HH:mm:ss。"""
from datetime import datetime, timedelta, timezone

CN_TZ = timezone(timedelta(hours=8))


def now_cn() -> datetime:
    return datetime.now(CN_TZ).replace(tzinfo=None)


def today_cn():
    return now_cn().date()


def to_cn(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=CN_TZ)
    return dt.astimezone(CN_TZ)


def fmt_dt(dt: datetime | None) -> str | None:
    convert = to_cn(dt)
    return convert.strftime("%Y-%m-%d %H:%M:%S") if convert else None


def start_of_day(offset_days: int = 0) -> datetime:
    base = now_cn() + timedelta(days=offset_days)
    return base.replace(hour=0, minute=0, second=0, microsecond=0)


def days_since(dt: datetime | None, fallback: int = 1) -> int:
    if not dt:
        return fallback
    return max(1, (now_cn().date() - to_cn(dt).date()).days + 1)
