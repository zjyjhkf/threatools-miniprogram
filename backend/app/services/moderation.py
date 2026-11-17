"""内容安全：敏感词兜底（微信侧 msgSecCheck 预留接入点）。"""
import re

from app.core.errors import BadRequest

# 1.0 内置最小词表；线上需接入微信内容安全接口或平台词库
_BLOCKED = (
    "赌博", "博彩", "代购", "刷单", "办证", "发票", "枪支", "毒品", "色情",
    "微信加我", "加微信", "私聊加", "二维码", "联系方式",
)

_REPEAT = re.compile(r"(.)\1{9,}")


def check_text(content: str, *, field_label: str = "内容") -> None:
    text = (content or "").lower()
    if not text.strip():
        return
    for word in _BLOCKED:
        if word.lower() in text:
            raise BadRequest(f"{field_label}包含敏感信息，请修改后再试")
    if _REPEAT.search(text):
        raise BadRequest(f"{field_label}存在大量重复字符，请修改后再试")


def needs_review(content: str) -> bool:
    """发布后送审标记：含链接或长文本时进入人工复审队列。"""
    return "http://" in content or "https://" in content or len(content) > 300
