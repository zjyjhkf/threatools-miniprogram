# 健衡运动社区 · 后端服务

FastAPI + SQLAlchemy 2.0（async）实现，服务 0.1 版小程序端全部接口（A01–A36）。

## 技术栈

| 维度 | 选型 |
| --- | --- |
| Web 框架 | FastAPI 0.115 |
| ORM | SQLAlchemy 2.0 Async + aiomysql |
| 迁移 | Alembic |
| 校验/序列化 | Pydantic v2（camelCase 输出） |
| 鉴权 | JWT（PyJWT），`Authorization: Bearer <token>` |
| 图片处理 | Pillow（头像压缩、九宫格图片缩放） |

## 目录结构

```
backend/
├── app/
│   ├── api/            # deps、v1 路由聚合
│   ├── core/           # 配置、统一响应、异常、日志、限流、安全
│   ├── db/             # 引擎、会话、Base
│   ├── models/         # 14 张表
│   ├── repositories/   # 数据访问
│   ├── schemas/        # 请求体模型
│   ├── services/       # 业务逻辑 + VO 组装
│   ├── utils/          # 时间、图片、脱敏等
│   └── main.py
├── alembic/            # 迁移脚本
├── seeds/data/         # 种子数据（来自 0.1 版 mock）
├── scripts/            # seed.py / gen_placeholders.py / smoke.py / probe_db.py
├── tests/              # pytest 接口契约回归
├── uploads/            # 本地上传目录（静态挂载 /uploads）
├── requirements.txt
└── requirements-dev.txt
```

## 快速开始

```bash
# 1. 依赖（Windows 建议使用虚拟环境，DB 驱动为纯 Python 的 aiomysql）
python -m venv .venv
.venv\Scripts\activate           # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt

# 2. 配置：复制 .env.example 为 .env，按本机情况修改
#    DATABASE_URL=mysql+aiomysql://root:123456@127.0.0.1:3306/miniprogram?charset=utf8mb4
#    JWT_SECRET 用 openssl rand -hex 32 生成

# 3. 建表
python -m alembic upgrade head

# 4. 生成占位图（头像/动态图/课程封面/产品图，输出 uploads/seed/）
python -m scripts.gen_placeholders

# 5. 导入种子数据（从 0.1 版 mock 迁移的 3 位用户/6 个话题/6 门课程/5 个产品/6 条动态）
python -m scripts.seed            # 已有数据会跳过
python -m scripts.seed --force    # 清空业务表后重新导入

# 6. 启动
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

启动后可访问：

- 健康检查 `GET http://127.0.0.1:8000/healthz`、`GET /readyz`
- 接口文档 `http://127.0.0.1:8000/docs`（生产环境自动关闭）
- 接口前缀 `/api/v1`

## 前端联调

`健衡运动社区0.1版本源码/config/env.js` 中确认：

```js
const DEV_HOST = '127.0.0.1:8000'   // 真机调试改成电脑局域网 IP，如 192.168.1.5:8000
VERSION: '1.0.0'                    // 与后端 APP_VERSION 一致
```

前端已不内置本地假数据（`request.js` / `upload.js` 只走真实接口），接口不通即为联调问题，不存在“静默降级”掩盖。

切真机时**两处要一起改**，否则图片会 404：

1. 小程序 `config/env.js` 的 `DEV_HOST`
2. 后端 `.env` 的 `UPLOAD_URL_PREFIX`（种子数据与上传返回的图片地址都由它生成）

启动参数同理要监听 `0.0.0.0`：`uvicorn app.main:app --host 0.0.0.0 --port 8000`，并在微信开发者工具中勾选「不校验合法域名」。

开发态登录（`WX_MOCK_LOGIN=true`）会把任意 `code` 映射到种子用户 `100001`，无需真实 `WX_SECRET`。

## 接口约定

- 统一响应：`{ "code": 0, "message": "ok", "data": ..., "requestId": "..." }`
- 错误码：`40000` 参数、`40101` 未登录、`40301` 无权限、`40400` 不存在、`40901` 冲突、`42901` 限流、`50000` 服务异常
- 分页两种：cursor（`{list,nextCursor,hasMore,total}`）与 page（`{list,total,hasMore,nextCursor}`）
- 所有 ID 出参为字符串；时间出参为 `YYYY-MM-DD HH:mm:ss`（东八区）

## 冒烟与测试

```bash
# 需先启动服务；按 A01–A32 顺序跑一遍主链路（会写入少量测试数据）
python -m scripts.smoke

# 只读契约回归（httpx ASGITransport，需先 seed）
python -m pytest
```

## 上传

- `POST /upload/avatar`：单文件字段 `file`，压缩到 720px JPEG
- `POST /upload/images`：字段 `files`（可多图，单请求建议 1 张）
- 返回 `{url}` / `{urls:[...]}`，文件落盘 `UPLOAD_DIR`，通过 `UPLOAD_URL_PREFIX + /uploads/...` 访问
- 限制：单文件 `MAX_UPLOAD_MB`（默认 5MB），类型仅 jpg/jpeg/png/webp

## 说明

- MySQL `DATETIME` 默认值统一用 `CURRENT_TIMESTAMP(3)`（`app/db/base.py:now_default`），`func.now()` 在 MySQL 下会生成非法 DDL。
- Windows 下 `asyncmy` 需编译工具链，故选用 `aiomysql`；生产同样可用。
- `.env` 不入库，只提交 `.env.example`。
