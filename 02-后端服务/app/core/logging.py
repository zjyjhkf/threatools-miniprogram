"""结构化日志：JSON 行、按天轮转、自动带 request_id。"""
import json
import logging
import os
from datetime import datetime
from logging.handlers import TimedRotatingFileHandler

from app.core.config import settings

_CONFIGURED = False


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        from app.core.request_id import current_request_id

        payload = {
            "ts": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": current_request_id(),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def setup_logging() -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return
    os.makedirs(settings.LOG_DIR, exist_ok=True)

    root = logging.getLogger()
    root.setLevel(getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))
    formatter = JsonFormatter()

    file_handler = TimedRotatingFileHandler(
        os.path.join(settings.LOG_DIR, "app.log"), when="midnight", backupCount=7, encoding="utf-8"
    )
    file_handler.setFormatter(formatter)
    root.addHandler(file_handler)

    stream = logging.StreamHandler()
    stream.setFormatter(formatter)
    root.addHandler(stream)

    for noisy in ("uvicorn.access", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    _CONFIGURED = True
