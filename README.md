# 健衡运动社区 · 1.0

微信原生小程序 + FastAPI 服务端。本仓库把**前端、后端放在同一目录**，便于一次 review 全链路；需求与设计文档在 `前置文档/`（只读，不参与代码变更）。

```
健衡运动社区小程序端/
├── 01-小程序前端/            微信原生小程序（WXML/WXSS/JS）
│   ├── app.js / app.json / app.wxss
│   ├── pages/                一级页（发现、我的）
│   ├── panes/                发现页内三个页签容器（社区/课程/产品）
│   ├── packageCommon/        分包：登录、搜索、协议页
│   ├── packageCommunity/     分包：话题、帖子、发布、结果、个人主页
│   ├── packageCourse/        分包：课程详情、播放
│   ├── packageProduct/       分包：产品详情
│   ├── packageMine/          分包：资料、编辑、身体档案、收藏、设置
│   ├── components/           23 个自定义组件（C01–C22 + 辅助件）
│   ├── services/             请求层、接口封装、登录、上传
│   ├── store/                极简全局状态
│   ├── utils/                日志、埋点、上报、校验、格式化
│   ├── styles/               设计令牌（颜色/字阶/间距/阴影）
│   └── tools/                工程自检脚本（node tools/check.js）
├── 02-后端服务/              FastAPI + SQLAlchemy + Alembic + MySQL
│   ├── app/
│   │   ├── api/v1/routers/   14 个路由模块（与接口文档 A01–A36 对应）
│   │   ├── core/             配置、响应包、异常、日志、限流、JWT、requestId
│   │   ├── db/               引擎与会话
│   │   ├── models/           17 张表
│   │   ├── repositories/     数据访问
│   │   ├── services/         业务逻辑 + VO 组装
│   │   ├── schemas/          请求体模型
│   │   └── utils/
│   ├── alembic/              迁移脚本
│   ├── seeds/data/           种子数据（源自 0.1 mock）
│   ├── scripts/              seed / smoke / 占位图生成
│   ├── tests/                pytest 接口契约测试
│   ├── nginx/                反向代理配置
│   ├── Dockerfile
│   └── docker-compose.yml
├── 前置文档/                 需求、设计、接口、部署文档（只读）
├── project.config.json       微信开发者工具根配置（miniprogramRoot 指向 01-小程序前端）
└── .gitignore
```

## 快速开始

### 1. 后端（二选一）

**方式 A：本地 venv**

```bash
cd 02-后端服务
python -m venv .venv && .venv\Scripts\activate      # Windows
pip install -r requirements-dev.txt
copy .env.example .env                               # 改 DATABASE_URL / JWT_SECRET
python -m alembic upgrade head
python -m scripts.gen_placeholders                   # 生成占位图（可选）
python -m scripts.seed
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**方式 B：Docker**

```bash
cd 02-后端服务
copy .env.example .env
docker compose up -d --build
docker compose exec api alembic upgrade head
docker compose exec api python -m scripts.seed
```

启动后：`http://127.0.0.1:8000/healthz`、`/docs`（非生产）。

### 2. 前端

微信开发者工具 → 导入项目，目录选择：

- **推荐**：`01-小程序前端/`（该目录自带 `project.config.json`，`miniprogramRoot` 为 `./`）
- 也可以直接导入**本仓库根目录**：根 `project.config.json` 已声明 `miniprogramRoot: "01-小程序前端/"`

导入后勾选「不校验合法域名」。前端 `01-小程序前端/config/env.js` 的 `DEV_HOST` 与后端 `.env` 的 `UPLOAD_URL_PREFIX` 必须指向同一地址（默认 `127.0.0.1:8000`）。真机调试时两处都要改成电脑局域网 IP。

## 代码 Review 路线（建议按此顺序）

| 顺序 | 文件 | 看什么 |
|---|---|---|
| 1 | `01-小程序前端/config/env.js` | 环境与接口地址、上传约束、版本号 |
| 2 | `01-小程序前端/services/request.js` | 请求层：统一解包、401 处理、重试、错误上报 |
| 3 | `01-小程序前端/services/auth.js` | 登录态、并发去重、静默重登 |
| 4 | `01-小程序前端/services/api.js` | 36 个接口封装（与后端路由一一对应） |
| 5 | `01-小程序前端/pages/community/index.js` + `panes/*` | 三页签容器与各页签数据流 |
| 6 | `02-后端服务/app/main.py` | 应用装配：中间件、路由、静态目录、健康检查 |
| 7 | `02-后端服务/app/core/*` | 响应包、异常、限流、JWT、requestId、日志 |
| 8 | `02-后端服务/app/api/v1/router.py` + `routers/*` | 路由与参数校验 |
| 9 | `02-后端服务/app/services/*` + `vo.py` | 业务规则与出参组装（camelCase 在这里） |
| 10 | `02-后端服务/app/models/*` + `alembic/versions/*` | 表结构与迁移 |
| 11 | `02-后端服务/tests/*` + `scripts/smoke.py` | 契约测试与冒烟 |

## 约定速查

| 项 | 约定 |
|---|---|
| 统一响应 | `{ code, message, data, requestId }`，`data` 不返回裸数组 |
| 字段命名 | 出参 camelCase；数据库 snake_case；ID 一律字符串 |
| 时间 | `YYYY-MM-DD HH:mm:ss`（东八区） |
| 请求追踪 | 后端生成 `X-Request-Id`，同时写入响应头与响应体；前端上报时带上 |
| 鉴权 | `Authorization: Bearer <JWT>`，7 天有效；401 先尝试静默重登一次 |
| 产品红线 | 任何接口不得返回价格、购物车、订单、设备、训练报告 |

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| 开发者工具报 `app.json 未找到` | 项目根选错了。选 `01-小程序前端/`，或选仓库根（根配置已带 `miniprogramRoot`） |
| 接口 401 循环 | 后端 `JWT_SECRET` 变更过 → 前端清缓存重新登录 |
| 图片 404 | 前端 `DEV_HOST` 与后端 `UPLOAD_URL_PREFIX` 不一致，或后端没启动 |
| 真机连不上 | 后端要 `--host 0.0.0.0`，且手机与电脑同一局域网 |
| 中文乱码/时间差 8 小时 | 后端容器/连接串时区与 `charset=utf8mb4` 未配置 |

## 与前置文档的对应

| 代码目录 | 对应文档（`前置文档/`） |
|---|---|
| `01-小程序前端/` | `前端/01-PRD.md`、`02-页面清单与导航关系图.md`、`03-前端架构与目录规范.md`、`04-前后端协作契约.md`、`05-UI样式规则.md` |
| `02-后端服务/app` | `后端/01-接口文档.md`、`05-后端架构与路由约定.md`、`07-日志与错误定位说明.md` |
| `02-后端服务/app/models` + `alembic` | `后端/02-数据库结构.md`、`03-数据库设计决策记录.md` |
| `02-后端服务/{Dockerfile,docker-compose.yml,nginx}` | `后端/04-部署拓扑说明.md` |
| `02-后端服务/app/services/auth_service.py` | `后端/06-微信登录流程说明.md` |

## 版本

- 应用版本：`1.0.0`（前端 `app.js` 读 `config/env.js` 的 `VERSION`；后端 `APP_VERSION`）
- 分支约定：`main` 可发布 / `dev` 集成分支 / `feat/<模块>`
