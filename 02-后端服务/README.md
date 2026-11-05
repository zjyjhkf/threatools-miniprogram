# 健衡运动社区 · 后端服务（1.0）

FastAPI + SQLAlchemy 2.0（async）实现，为小程序端提供 A01–A36 全部接口，并为 1.1 管理端预留 A90–A96（当前统一返回 `501 / 50100`）。

## 技术栈

| 维度 | 选型 |
| --- | --- |
| Web 框架 | FastAPI 0.115 |
| ORM | SQLAlchemy 2.0 Async + aiomysql |
| 迁移 | Alembic |
| 校验/序列化 | Pydantic v2（请求体）；出参由 `services/vo.py` 组装 camelCase |
| 鉴权 | JWT（PyJWT），`Authorization: Bearer <token>` |
| 图片处理 | Pillow（头像 512×512 压缩、动态图缩放） |
| 部署 | Docker / docker-compose（api + mysql + 可选 nginx） |

## 目录结构

```
02-后端服务/
├── app/
│   ├── api/            # deps、v1 路由聚合（含 admin 占位）
│   ├── core/           # 配置、统一响应、异常、日志、限流、JWT、requestId
│   ├── db/             # 引擎、会话、Base
│   ├── models/         # 17 张表
│   ├── repositories/   # 数据访问
│   ├── schemas/        # 请求体模型（出参不用 schema，见下方说明）
│   ├── services/       # 业务逻辑 + VO 组装
│   ├── utils/          # 时间、图片、脱敏等
│   └── main.py
├── alembic/            # 迁移脚本（0001 建表 + 0002 对齐契约）
├── seeds/data/         # 种子数据（来自 0.1 版 mock）
├── scripts/            # seed / smoke / gen_placeholders / backup.sh
├── tests/              # pytest：只读契约 + 写路径回归
├── nginx/conf.d/       # 反向代理配置（docker compose --profile nginx 时启用）
├── uploads/            # 本地上传目录（compose 中挂载到 /data/upload）
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── requirements-dev.txt
```

## 快速开始

### 方式 A：本地 venv

```bash
python -m venv .venv
.venv\Scripts\activate                # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
copy .env.example .env                # 修改 DATABASE_URL / JWT_SECRET
python -m alembic upgrade head
python -m scripts.gen_placeholders    # 生成占位图（首次）
python -m scripts.seed                # 导入种子数据（--force 重建）
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 方式 B：Docker（推荐，与生产一致）

```bash
copy .env.example .env
docker compose up -d --build                      # 起 mysql + api
docker compose exec api alembic upgrade head
docker compose exec api python -m scripts.gen_placeholders
docker compose exec api python -m scripts.seed
docker compose --profile nginx up -d              # 需要 80 端口反代时
```

- 容器内 MySQL 映射到 `127.0.0.1:3307`，避免与本机已有 3306 冲突；
- `api` 对外 `8000`，`nginx` 对外 `80`（`/api/` 反代、`/uploads/` 静态、注入 `X-Request-Id`）；
- 上传与日志分别挂载到 `./uploads`、`./logs`，重建容器不丢。

启动后可访问：

- 健康检查 `GET /healthz`（带 DB 探活）、`GET /readyz`
- 接口文档 `GET /docs`（生产环境自动关闭）
- 接口前缀 `/api/v1`

## 前端联调

`01-小程序前端/config/env.js` 中确认：

```js
const DEV_HOST = '127.0.0.1:8000'   // 真机调试改成电脑局域网 IP，如 192.168.1.5:8000
VERSION: '1.0.0'                    // 与后端 APP_VERSION 一致
```

切真机时**两处要一起改**，否则图片会 404：

1. 小程序 `config/env.js` 的 `DEV_HOST`
2. 后端 `.env` 的 `UPLOAD_URL_PREFIX`

后端监听 `0.0.0.0`，并在微信开发者工具勾选「不校验合法域名」。开发态 `WX_MOCK_LOGIN=true` 会把任意 `code` 映射到种子用户 `100001`。

## 接口约定

- 统一响应：`{ "code": 0, "message": "ok", "data": ..., "requestId": "..." }`
- 错误码：`40001` 参数、`40101` 未登录、`40301` 无权限、`40401` 不存在、`40901` 冲突、`42201` 业务校验、`42901` 限流、`50000` 服务异常、`50300` 维护中、`50100` 管理端未实现
- 分页两种：cursor（`{list,nextCursor,hasMore}`）与 page（`{list,total,page,size,hasMore}`）
- 所有 ID 出参为字符串；时间出参为 `YYYY-MM-DD HH:mm:ss`（东八区）
- 产品相关出参**不含价格**（红线，见 ADR-011 与产品契约）

## 安全基线

- `APP_ENV=prod` 时启动会校验：`WX_MOCK_LOGIN=false`、`CORS_ORIGINS` 非 `*`、`JWT_SECRET` ≥32 字节且非默认值，否则拒绝启动；
- 限流为进程内计数，多 worker / 多副本时需换 Redis（1.1）；
- 上传校验真实图片格式（Pillow），拒绝 SVG；单文件 ≤5MB。

## 冒烟与测试

```bash
# 需先启动服务与种子数据
python -m scripts.smoke      # 按 A01–A32 顺序跑主链路（会写入少量数据）

# 契约 + 写路径回归（ASGITransport，直连应用，需 DB）
python -m pytest -q
```

## 与前置文档的已知差异

| 项 | 文档 | 实现 | 说明 |
|---|---|---|---|
| 数据库名 | `jianheng` | `miniprogram` | 历史库名，改动会丢失现有数据；如需统一，按「导出 → 改库名 → 改 `.env` DATABASE_URL」执行，代码无需改动 |
| 静态文件前缀 | `/static` | `/uploads` | 种子与上传 URL 已按 `/uploads` 落库，保持一致即可 |
| 出参校验 | Pydantic `response_model` | `services/vo.py` 手工组装 | 出参以 `tests/test_api.py`、`test_write_flow.py` 的字段断言兜底 |
| 管理端接口 | A90–A96 预留 501 | 同左 | 1.1 实现 |

## 运维

```bash
# 备份（默认保留 7 天，建议 cron 每日 02:00）
bash scripts/backup.sh

# 恢复
gunzip -c backups/jianheng_YYYYmmdd_HHMM.sql.gz | docker compose exec -T mysql mysql -uroot -p miniprogram
```
