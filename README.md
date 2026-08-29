# Class Widgets 集控

`central-control` 是 Class Widgets 2 的集控平台，包含管理服务、Web 管理后台、设备端插件和 PostgreSQL 部署配置。

## 目录结构

- `server/`：FastAPI 控制平面服务
- `web/`：React + TypeScript + Vite 管理后台
- `client-plugin/`：Class Widgets 终端插件
- `contracts/`：客户端与服务端协议
- `docker-compose.yml`：PostgreSQL + FastAPI 生产部署
- `.env.example`：部署环境变量示例

## 环境要求

### 开发环境

- Windows、Linux 或 macOS
- Python 3.12+
- Node.js 20+
- npm
- PostgreSQL 生产环境；本地开发和测试也支持 SQLite

### 生产环境

- Docker Engine
- Docker Compose v2
- 一个可安全保存密钥的部署环境
- 反向代理和 HTTPS（推荐使用 Caddy、Nginx 或 Traefik）

服务镜像会通过 `server/pyproject.toml` 安装 Python 包；其中 setuptools 已显式配置为只打包 `app`，Alembic 的 `migrations` 目录作为镜像中的迁移脚本保留，不参与 Python wheel 包发现。

## 快速启动：本地开发

### 1. 启动后端

在 `central-control/server` 目录创建 `.env`，至少设置：

```dotenv
CC_DATABASE_URL=sqlite:///./central-control.db
CC_ADMIN_KEY=请替换为至少32位随机密钥
CC_PUBLIC_URL=http://127.0.0.1:8000
CC_SECRET_ENCRYPTION_KEY=请替换为Fernet密钥
CC_ALLOW_INSECURE_HTTP=true
CC_POLL_INTERVAL_SECONDS=10
```

然后安装后端依赖并执行数据库迁移：

```powershell
cd central-control/server
python -m pip install -e ".[dev]"
python -m alembic upgrade head
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

后端地址：

- 健康检查：<http://127.0.0.1:8000/api/v1/health>
- OpenAPI：<http://127.0.0.1:8000/api/docs>

### 2. 启动 Web 管理后台

```powershell
cd central-control/web
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

管理后台地址：<http://127.0.0.1:5173/>

开发环境下 Vite 会将 `/api` 请求代理到后端 `http://127.0.0.1:8000`，具体配置见 `web/vite.config.ts`。

## Docker Compose 部署

### 1. 准备配置

在 `central-control` 目录复制环境变量模板：

```powershell
cd central-control
Copy-Item .env.example .env
```

编辑 `.env`，务必替换以下值：

```dotenv
POSTGRES_PASSWORD=生成一个长随机密码
CC_ADMIN_KEY=生成一个至少32位随机密钥
CC_PUBLIC_URL=https://集控公网域名
CC_SECRET_ENCRYPTION_KEY=生成一个Fernet密钥
```

不要将包含真实密码或管理员密钥的 `.env` 提交到 Git。

### 2. 启动服务

```powershell
docker compose up -d --build
```

查看状态和日志：

```powershell
docker compose ps
docker compose logs -f server
```

验证服务：

```powershell
Invoke-WebRequest http://127.0.0.1:8000/api/v1/health
```

停止服务：

```powershell
docker compose down
```

仅停止容器但保留 PostgreSQL 数据卷时使用 `docker compose down`。删除数据卷会永久删除数据库数据，请谨慎执行：

```powershell
docker compose down -v
```

## 配置项

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | Compose 必填 | PostgreSQL 密码 |
| `CC_DATABASE_URL` | 是 | SQLAlchemy 数据库连接串 |
| `CC_ADMIN_KEY` | 是 | 平台启动密钥；建议至少 32 位随机字符串 |
| `CC_PUBLIC_URL` | OIDC 必填 | 浏览器可访问的集控根地址，用于生成 OIDC 回调地址 |
| `CC_SECRET_ENCRYPTION_KEY` | OIDC 必填 | 加密 Provider Client Secret、PKCE 和一次性交换令牌的 Fernet 密钥 |
| `CC_ALLOW_INSECURE_HTTP` | 开发可用 | 是否允许设备通过非 HTTPS 连接；生产必须为 `false` |
| `CC_POLL_INTERVAL_SECONDS` | 否 | 设备默认轮询间隔，默认 10 秒 |

生产环境推荐：

- 使用 PostgreSQL，不使用 SQLite
- `CC_ALLOW_INSECURE_HTTP=false`
- 通过 HTTPS 反向代理暴露服务
- 定期备份 PostgreSQL
- 轮换平台管理员密钥
- 限制 `/api/docs` 的公网访问，或仅在内网开放

## 认证与多租户

平台支持三种管理端认证方式：

1. 平台管理员密钥：请求头 `X-Admin-Key`
2. 管理员账号登录：请求头 `Authorization: Bearer <session-token>`
3. 动态配置的通用 OpenID Connect Provider（Authorization Code + PKCE）

组织即租户。权限按“平台 / 组织 / 分组 / 设备”范围授予，组织授权向其分组和设备继承，分组授权向其设备继承；系统只保存 Allow，不提供显式 Deny。OIDC 首次登录会创建待授权账号，不会按邮箱自动合并已有账号。

首次部署后，可在 Web 管理后台输入 `CC_ADMIN_KEY` 建立平台连接，然后：

1. 创建组织
2. 创建成员账号
3. 选择成员可访问的组织
4. 让成员使用账号和密码登录

OIDC Provider 可在“平台管理”中动态添加。Provider 后台应将回调地址配置为：

`<CC_PUBLIC_URL>/api/v1/auth/oauth/<provider-key>/callback`

可使用 Python 生成 Fernet 密钥：`from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())`。密钥丢失后，现有 Provider Secret 将无法解密；不要提交或随意轮换该值。

## 课表导入与导出（CSES）

Web 管理后台的课表工作区支持 [CSES](https://github.com/SmartTeachCN/CSES)（The Course Schedule Exchange Schema，v2）格式的课表文件导入与导出：

- 导入：选择 `.yaml` / `.yml` 文件后，服务端会转换为集控课表格式并载入编辑器，转换前可先在“开学日期”中设定周期锚点（CSES 周期的第 1 天所在日期），转换产生的提示（如单双周映射、非整周周期折算）会显示在通知中。
- 导出：编辑器命令栏“导出 CSES”将当前课表生成 CSES YAML 文件下载；固定日期日程、课间/活动条目、周六周日课程等 CSES 无法表达的内容会被跳过并在通知中说明。

对应的服务端接口为 `POST /api/v1/admin/schedules/import-cses` 与 `POST /api/v1/admin/schedules/export-cses`，均为无状态转换，不读取或写入数据库。

## 数据库迁移

执行最新迁移：

```powershell
cd central-control/server
..\..\.venv\Scripts\python.exe -m alembic upgrade head
```

查看当前版本：

```powershell
..\..\.venv\Scripts\python.exe -m alembic current
```

生产迁移前应先备份数据库，并在预发布环境验证迁移。

## 测试与质量检查

```powershell
cd central-control/server
..\..\.venv\Scripts\python.exe -m pytest -q
..\..\.venv\Scripts\python.exe -m ruff check app tests migrations/versions

cd ..\web
npm run build
npm run lint
```

## 常见问题

### 前端显示服务未连接

确认后端正在监听 `127.0.0.1:8000`，并访问 `/api/v1/health`。开发前端的 API 代理配置位于 `web/vite.config.ts`。

### 迁移找不到模块或数据库

确认当前工作目录是 `central-control/server`，并使用项目选定的 Python 解释器执行 Alembic。

### 设备无法连接

生产环境必须配置 HTTPS。检查设备端使用的服务地址、设备 Bearer Token、配对码是否过期，以及设备所属分组是否仍然有效。

## 许可证

本项目许可证见仓库根目录及各子项目中的 `LICENSE` 文件。
