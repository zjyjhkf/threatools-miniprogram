# 健衡运动社区后端镜像：Python 3.11 + FastAPI + Uvicorn
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TZ=Asia/Shanghai

WORKDIR /app

# curl 用于 HEALTHCHECK；tzdata 保证容器内时区为 Asia/Shanghai
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl tzdata \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY . .

# 非 root 运行；上传目录与日志目录用挂载点
RUN useradd -m -u 1000 appuser \
    && mkdir -p /data/upload /app/logs \
    && chown -R appuser:appuser /app /data/upload /app/logs
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/healthz || exit 1

# 1.0 并发很低，2 个 worker 足够；注意：限流是进程内计数，扩容后需换 Redis
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers"]
