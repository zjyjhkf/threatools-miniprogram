# 健衡运动社区 · 开发与部署说明

> 本文档面向开发与运维：环境搭建、启动方式、代码 Review 路线、接口约定与常见问题。
> 项目定位、功能概览与目录结构见根目录 [README](../README.md)。

微信原生小程序 + FastAPI 服务端。本仓库把**前端、后端放在同一目录**，便于一次 review 全链路。

```
健衡运动社区小程序端/
├── frontend/                 微信原生小程序（WXML/WXSS/JS）
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
│   ├── tools/                工程自检脚本（node tools/check.js）
│   └── project.config.json   前端独立工程配置（miniprogramRoot 为 ./）
├── backend/                  FastAPI + SQLAlchemy + Alembic + MySQL
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
├── project.config.json       微信开发者工具根配置（miniprogramRoot 指向 frontend/）
└── .gitignore
```

## 快速开始

### 1. 后端（三选一）

**方式 A：一键脚本（推荐，Windows）** —— 双击 `backend/dev-server.cmd`。

脚本会自动：释放被占用的 8000 端口 → 建 `.venv` / 装依赖 → 跑迁移与种子数据 → 前台启动服务。**窗口保持开启即后端在线，关闭窗口即停止**。关掉窗口后点小程序任何模块都会提示「网络异常」。

在终端里运行同样是这条命令（当前目录随意）：

```powershell
.\backend\dev-server.cmd
```

**方式 B：本地 venv（手动）**

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate      # Windows
pip install -r requirements-dev.txt
copy .env.example .env                               # 改 DATABASE_URL / JWT_SECRET
python -m alembic upgrade head
python -m scripts.gen_placeholders                   # 生成占位图（可选）
python -m scripts.seed
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

> 注意：`uvicorn` 只装在 `backend/.venv` 里。没有先激活 venv 就敲 `uvicorn` 会报「不是内部或外部命令」，敲 `python -m uvicorn` 会报 `No module named 'uvicorn'`（系统 Python 未安装）。两者都不是项目问题，激活 venv 即可。
>
> 不想激活也可以直接用 venv 的解释器，一条命令搞定：
>
> ```powershell
> cd backend
> .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
> ```

**方式 C：Docker**

```bash
cd backend
copy .env.example .env
docker compose up -d --build
docker compose exec api alembic upgrade head
docker compose exec api python -m scripts.seed
```

启动后：`http://127.0.0.1:8000/healthz`、`/docs`（非生产）。

> `scripts.seed` 默认只导入用户、话题、课程、产品；**示例作品与评论不再自动导入**（避免后台删掉后重启又回来）。需要演示数据时追加 `--with-posts`。

### 2. 微信登录

`backend/.env` 的 `WX_SECRET` 为空时，登录走联调模式：任意 `wx.login` 的 code 都映射到种子用户，方便本地开发（`WX_MOCK_LOGIN=true`）。

要接入真实微信身份：

1. 微信公众平台 → 开发管理 → 开发设置，复制 **AppSecret**；
2. 填入 `backend/.env` 的 `WX_SECRET=`（不要提交到仓库，`.env` 已在 `.gitignore`）；
3. 确认 `WX_APPID` 与 `project.config.json` 的 `appid` 一致（当前 `wx1d74ed07f229eba7`）；
4. 重启后端。**填入 AppSecret 后自动切换到真实 `code2session`**，不需要再改 `WX_MOCK_LOGIN`。

> 真机调试时 `127.0.0.1` 不可达：后端要 `--host 0.0.0.0`，前端 `config/env.js` 的 `DEV_HOST` 改成电脑局域网 IP，并在公众平台配置 request 合法域名（或开发期勾选「不校验合法域名」）。
>
> 后端已按微信错误码给出明确提示：`40029` 凭证失效、`40163` 凭证已用、`40013`/`40125` AppID/AppSecret 配置错误。

### 3. 前端

微信开发者工具 → 导入项目，目录选择：

- **推荐**：`frontend/`（该目录自带 `project.config.json`，`miniprogramRoot` 为 `./`）
- 也可以直接导入**本仓库根目录**：根 `project.config.json` 已声明 `miniprogramRoot: "frontend/"`

导入后勾选「不校验合法域名」。前端 `frontend/config/env.js` 的 `DEV_HOST` 与后端 `.env` 的 `UPLOAD_URL_PREFIX` 必须指向同一地址（默认 `127.0.0.1:8000`）。真机调试时两处都要改成电脑局域网 IP。

> 开发期热更新：开发者工具「详情 → 本地设置」保持「编译热重载 / 文件保存时自动编译」开启，改 WXML/WXSS/JS 保存即刷新模拟器。

> 前端所有页面都依赖 8000 端口的后端接口；后端没起来时，点任何模块都会弹「网络异常，请检查网络」。改完代码想立刻看效果，务必保持后端进程在跑（`curl http://127.0.0.1:8000/healthz` 返回 `"db":"ok"`）。

## BLE 设备联调

在 `frontend` 运行：

```bash
node tools/check.js
node tools/test-ble-codec.js
node tools/test-ble-flow.js
node tools/test-device-store.js
```

本机仿真覆盖分段广播、历史缓存过滤、RSSI、权限状态、型号筛选、停扫及握手控制。真机走查使用微信开发者工具预览，从「设备 → 连接设备 → 设备介绍 → 开始连接设备」进入。准备可连接样机，确认设备已开机进入配对模式且未连接其他手机。授权后返回页面会重新扫一轮；Android 6–11 同时检查系统定位和微信位置权限。

若 15 秒后仍无设备，先判断提示是零 BLE 上报还是有上报无匹配。同一手机可用 nRF Connect 或 LightBlue 检查主广播与扫描响应。核对 NUS Service UUID `6E400001-B5A3-F393-E0A9-E50E24DCCA9E` 和 `JH-{MODEL}-{SN4}` 名称。扫描工具连接过样机时，先断开再回小程序验证。握手成功后查看控制页和「诊断与日志」，记录机型、系统、微信版本、发现数、匹配数和握手结果。

BLE 真机验收依赖配对实物样机，开发者工具编译和模拟测试用于前端回归。

## 代码 Review 路线（建议按此顺序）

| 顺序 | 文件 | 看什么 |
|---|---|---|
| 1 | `frontend/config/env.js` | 环境与接口地址、上传约束、版本号 |
| 2 | `frontend/services/request.js` | 请求层：统一解包、401 处理、重试、错误上报 |
| 3 | `frontend/services/auth.js` | 登录态、并发去重、静默重登 |
| 4 | `frontend/services/api.js` | 36 个接口封装（与后端路由一一对应） |
| 5 | `frontend/pages/community/index.js` + `panes/*` | 三页签容器与各页签数据流 |
| 6 | `backend/app/main.py` | 应用装配：中间件、路由、静态目录、健康检查 |
| 7 | `backend/app/core/*` | 响应包、异常、限流、JWT、requestId、日志 |
| 8 | `backend/app/api/v1/router.py` + `routers/*` | 路由与参数校验 |
| 9 | `backend/app/services/*` + `vo.py` | 业务规则与出参组装（camelCase 在这里） |
| 10 | `backend/app/models/*` + `alembic/versions/*` | 表结构与迁移 |
| 11 | `backend/tests/*` + `scripts/smoke.py` | 契约测试与冒烟 |

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
| 开发者工具报 `app.json 未找到` / 模拟器空白 | 项目根选错了。选 `frontend/`，或选仓库根（根 `project.config.json` 的 `miniprogramRoot` 必须是 `frontend/`） |
| 点任何模块都弹「网络异常，请检查网络」 | 8000 端口没有服务：后端窗口被关了或进程被回收。双击 `backend/dev-server.cmd` 重启，用 `curl.exe http://127.0.0.1:8000/healthz` 确认返回 `"db":"ok"` |
| 终端敲 `uvicorn` 提示「不是内部或外部命令」 | 没激活 venv，`uvicorn` 不在 PATH。先 `cd backend && .\.venv\Scripts\Activate.ps1`（cmd 用 `.venv\Scripts\activate.bat`），或直接用 `.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000` |
| 启动瞬间退出，日志有 `[Errno 10048]` / `已使用` | 8000 被上一次没关掉的实例占着。`netstat -ano \| findstr :8000` 查 PID 后 `taskkill /F /PID <PID>`，或直接跑 `backend/dev-server.cmd`（脚本会自动清理） |
| 登录后还是「运动达人」，不是自己的微信 | `WX_SECRET` 为空走联调模式。按「2. 微信登录」填入 AppSecret 后重启后端 |
| 后台删除作品后小程序端仍显示 | 管理端必须连同一个后端（`vite.config.ts` 已代理 `/api` → `127.0.0.1:8000`），`/admin/posts` 已实装。删除是软删，小程序端 feed/详情立即不可见 |
| 接口 401 循环 | 后端 `JWT_SECRET` 变更过 → 前端清缓存重新登录 |
| 图片 404 | 前端 `DEV_HOST` 与后端 `UPLOAD_URL_PREFIX` 不一致，或后端没启动 |
| 真机连不上 | 后端要 `--host 0.0.0.0`，且手机与电脑同一局域网 |
| 中文乱码/时间差 8 小时 | 后端容器/连接串时区与 `charset=utf8mb4` 未配置 |

## 版本

- 应用版本：`1.0.0`（前端 `app.js` 读 `config/env.js` 的 `VERSION`；后端 `APP_VERSION`）
- 分支约定：`main` 可发布 / `dev` 集成分支 / `feat/<模块>`
