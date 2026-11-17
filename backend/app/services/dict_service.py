"""筛选条目（字典）与标签联想。

产品分类、课程分类、难度、标签候选统一存放在 `dict_items`，管理端可增删改排序；
`/admin/meta/options`、后台表单下拉、标签联想都读同一份数据，避免"分类写死在代码里"。
"""

from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFound, ValidationBiz
from app.models.course import Course
from app.models.dict_item import DictItem
from app.models.product import Product

GROUP_LABELS: dict[str, str] = {
    "product_category": "产品分类",
    "course_category": "课程分类",
    "difficulty": "课程难度",
    "product_tag": "产品标签",
    "course_tag": "课程标签",
}

# 表为空时的兜底，保证老数据仍可正常展示
FALLBACK: dict[str, list[tuple[str, str]]] = {
    "product_category": [("rehab", "运动康复"), ("recovery", "运动恢复"), ("portable", "便携设备")],
    "course_category": [
        ("rehab", "康复训练"),
        ("recovery", "放松恢复"),
        ("posture", "体态改善"),
        ("stretch", "拉伸舒展"),
    ],
    "difficulty": [("beginner", "入门"), ("middle", "进阶"), ("advanced", "高阶")],
}

LIMITS = {
    "pageSizeMax": 100,
    "courseChaptersMax": 30,
    "productImagesMax": 4,
    "productSpecsMax": 12,
    "postReasonMax": 100,
    "uploadMaxMB": 5,
    "uploadMaxCount": 9,
}


def _vo(item: DictItem) -> dict:
    return {
        "id": str(int(item.id)),
        "group": item.group_key,
        "groupLabel": GROUP_LABELS.get(item.group_key, item.group_key),
        "value": item.value,
        "label": item.label,
        "sort": int(item.sort or 0),
        "status": int(item.status or 0),
    }


def _pair(item: DictItem) -> dict:
    return {"label": item.label or item.value, "value": item.value}


async def group_pairs(db: AsyncSession, group: str) -> list[dict]:
    rows = list(
        (
            await db.execute(
                select(DictItem)
                .where(DictItem.group_key == group, DictItem.status == 1)
                .order_by(DictItem.sort.asc(), DictItem.id.asc())
            )
        )
        .scalars()
        .all()
    )
    if rows:
        return [_pair(item) for item in rows]
    return [{"label": label, "value": value} for value, label in FALLBACK.get(group, [])]


async def load_options(db: AsyncSession) -> dict:
    """管理端 A130：枚举与限制。筛选条目全部来自字典表。"""
    return {
        "postStatus": [
            {"label": "已发布", "value": "published"},
            {"label": "已隐藏", "value": "hidden"},
            {"label": "已删除", "value": "deleted"},
        ],
        "reviewStatus": [
            {"label": "待审核", "value": "pending"},
            {"label": "已通过", "value": "approved"},
            {"label": "已驳回", "value": "rejected"},
        ],
        "courseCategories": await group_pairs(db, "course_category"),
        "difficulties": await group_pairs(db, "difficulty"),
        "productCategories": await group_pairs(db, "product_category"),
        "productTags": await group_pairs(db, "product_tag"),
        "courseTags": await group_pairs(db, "course_tag"),
        "roles": [
            {"label": "超级管理员", "value": "super"},
            {"label": "管理员", "value": "admin"},
        ],
        "groups": [
            {"label": label, "value": value} for value, label in GROUP_LABELS.items()
        ],
        "limits": LIMITS,
    }


async def list_items(db: AsyncSession, group: str = "", keyword: str = "") -> list[dict]:
    stmt = select(DictItem)
    if group:
        stmt = stmt.where(DictItem.group_key == group)
    if keyword.strip():
        pattern = f"%{keyword.strip()}%"
        stmt = stmt.where(or_(DictItem.value.like(pattern), DictItem.label.like(pattern)))
    rows = (await db.execute(stmt.order_by(DictItem.group_key.asc(), DictItem.sort.asc(), DictItem.id.asc()))).scalars().all()
    return [_vo(item) for item in rows]


async def _ensure_unique(db: AsyncSession, group: str, value: str, exclude_id: int | None = None) -> None:
    stmt = select(DictItem.id).where(DictItem.group_key == group, DictItem.value == value)
    if exclude_id:
        stmt = stmt.where(DictItem.id != exclude_id)
    if await db.scalar(stmt):
        raise ValidationBiz("该分组下已存在相同的值")


async def create_item(db: AsyncSession, group: str, value: str, label: str, sort: int = 0) -> dict:
    if group not in GROUP_LABELS:
        raise ValidationBiz("未知的字典分组")
    group_value = value.strip()
    if not group_value:
        raise ValidationBiz("请填写值")
    await _ensure_unique(db, group, group_value)
    item = DictItem(
        group_key=group,
        value=group_value,
        label=(label or group_value).strip()[:60],
        sort=int(sort or 0),
        status=1,
    )
    db.add(item)
    await db.flush()
    return _vo(item)


async def update_item(db: AsyncSession, item_id: int, payload: dict) -> dict:
    item = await db.get(DictItem, item_id)
    if not item:
        raise NotFound("条目不存在")
    if "group" in payload and payload["group"]:
        if payload["group"] not in GROUP_LABELS:
            raise ValidationBiz("未知的字典分组")
        item.group_key = payload["group"]
    if "value" in payload and payload["value"] is not None:
        group_value = payload["value"].strip()
        if not group_value:
            raise ValidationBiz("请填写值")
        await _ensure_unique(db, item.group_key, group_value, exclude_id=int(item.id))
        item.value = group_value
    if "label" in payload and payload["label"] is not None:
        item.label = payload["label"].strip()[:60]
    if "sort" in payload and payload["sort"] is not None:
        item.sort = int(payload["sort"])
    if "status" in payload and payload["status"] is not None:
        item.status = 1 if int(payload["status"]) else 0
    await db.flush()
    return _vo(item)


async def delete_item(db: AsyncSession, item_id: int) -> dict:
    item = await db.get(DictItem, item_id)
    if not item:
        raise NotFound("条目不存在")
    # 被在用内容引用时不允许删，避免后台删了分类导致内容无法筛选
    if item.group_key in ("product_category", "course_category", "difficulty"):
        if item.group_key == "product_category":
            used = await db.scalar(
                select(func.count()).select_from(Product).where(
                    Product.deleted == 0, Product.category == item.value
                )
            )
        elif item.group_key == "course_category":
            used = await db.scalar(
                select(func.count()).select_from(Course).where(
                    Course.deleted == 0, Course.category == item.value
                )
            )
        else:
            used = await db.scalar(
                select(func.count()).select_from(Course).where(
                    Course.deleted == 0, Course.difficulty == item.value
                )
            )
        if int(used or 0) > 0:
            raise ValidationBiz(f"仍有 {used} 条内容使用该条目，请先调整内容")
    await db.delete(item)
    await db.flush()
    return {"id": str(item_id), "deleted": True}


async def _used_tags(db: AsyncSession, group: str) -> list[str]:
    if group == "course_tag":
        rows = (await db.execute(select(Course.tags).where(Course.deleted == 0))).scalars().all()
    else:
        rows = (await db.execute(select(Product.tags).where(Product.deleted == 0))).scalars().all()
    values: list[str] = []
    for item in rows:
        if isinstance(item, list):
            values.extend(str(entry).strip() for entry in item if str(entry).strip())
    return values


async def suggest_tags(db: AsyncSession, group: str, keyword: str = "", limit: int = 10) -> list[str]:
    """标签联想：字典候选 + 已上架内容用过的标签，按使用先后去重。"""
    dict_rows = list(
        (
            await db.execute(
                select(DictItem.value)
                .where(DictItem.group_key == group, DictItem.status == 1)
                .order_by(DictItem.sort.asc(), DictItem.id.asc())
            )
        )
        .scalars()
        .all()
    )
    used = await _used_tags(db, group)
    ordered = list(dict.fromkeys([*dict_rows, *used]))
    kw = keyword.strip().lower()
    matched = [item for item in ordered if not kw or kw in item.lower()]
    return matched[: max(1, min(limit, 30))]
