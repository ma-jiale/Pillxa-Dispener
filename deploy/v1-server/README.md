# V1 服务器 Docker CD

学校服务器是 Linux，不能从外部 SSH 直连，但能够联网。用户已确认这是**首次部署，没有原程序或旧数据需要接管**。采用 **Docker Compose + 学校服务器主动接收任务的 Runner**：GitHub 构建镜像，通过 Actions 制品交付；学校服务器下载镜像、加载到本机 Docker、启动或更新容器。

部署对象仅为 `legacy/v1/server`。工作流在 [.github/workflows/v1-cd.yml](../../.github/workflows/v1-cd.yml)，关键步骤有中文注释。原业务代码不修改，客户端与硬件程序不进入镜像。

## 现在先做什么

2026 年 10 月 19 日用户提供的学校终端输出为：Docker Engine 29.4.3（客户端与服务端均可访问）、Compose 5.1.3、`x86_64`、Python 3.14.6，并已安装 Miniforge。这些版本符合当前最低要求，镜像平台使用默认 `linux/amd64`。

用户随后执行初始化命令并提供输出，已确认：

- 配置文件：`/home/deploy/projects/pillxa-dispenser/v1/shared/server.env`。
- Python 绝对路径：`/home/deploy/miniforge3/bin/python3`。
- SQLite 版本：`3.53.4`，宿主机能够成功导入 SQLite 模块。
- Runner 已添加 `pillxa-server` 标签并完成仓库部署设置；[首次 CD](https://github.com/ma-jiale/Pillxa-Dispener/actions/runs/39285086701)已由 `user-Super-Server` 成功执行。后台服务模式仍需单独确认。

因此在 GitHub 的仓库变量 `V1_SERVER_PYTHON` 中填写 `/home/deploy/miniforge3/bin/python3`，首次部署已验证此路径可用于执行部署工具。

若以后切换部署账号或 Python 安装位置，再通过下列命令确认绝对路径，避免后台 Runner 依赖交互终端的 `(base)` 激活状态：

```bash
python3 -c "import sys, sqlite3; print(sys.executable); print('SQLite:', sqlite3.sqlite_version)"
```

确认 Docker 引擎能连接、Compose 插件至少为 **2.24**、宿主机 Python 至少为 **3.10**。Python 在宿主机上只运行无第三方依赖的部署工具和 SQLite 备份；应用所需的 Python **3.12**、Flask、Waitress 和 ReportLab 都在镜像里。

把打印的 Python 路径设为仓库变量 `V1_SERVER_PYTHON`；不需要为应用另建 Miniforge 环境。换服务器时仍需实际验证 Runner 任务和镜像启动；终端版本输出不能作为 CD 已上线的证据。本 CD 不自动安装 Docker、修改用户组或升级服务器系统。

## 每次更新的流程

1. 代码进入 `main`，已有 **V1 CI** 自动运行。
2. CI 成功后，**V1 Server CD** 在 GitHub 临时 Linux 机器上检查部署工具，并构建 CI 实际验证过的提交。
3. Dockerfile 的第一阶段构建 CSS，第二阶段只保留应用运行文件。基础镜像固定到摘要；数据库、照片和真实密钥不进入构建上下文。
4. 在临时、隔离的数据目录实际启动新镜像，要求 HTTP、版本号和 SQLite 健康检查通过，再验证登录页生成的 CSS 地址及 CSS 内容，之后才导出 `image.tar.gz` 和清单。
5. 开启部署后，学校 Runner 下载本次制品，验证文件 SHA-256、Git 提交号、镜像内容 ID 和服务器架构。
6. 先加载新镜像，成功后再确认 `main` 仍是这个版本；短暂停止原容器，备份 SQLite 和图片，启动新版本并等待健康检查。
7. 成功才更新当前版本记录。失败时尝试恢复上一个容器；首次部署没有旧容器可回退，则停止新容器并保留已生成的数据供重试。

镜像通过 Actions 制品传输，学校服务器**无需连接 Docker Hub、PyPI 或额外镜像仓库**。它仍须能访问 GitHub、GitHub API、Runner 工具和 Actions 制品下载域名，详见 [Runner 网络要求](https://docs.github.com/en/actions/reference/runners/self-hosted-runners)。能打开普通网页不一定意味着这些域名都能连接。

默认只构建与测试；仓库变量 `V1_CD_ENABLED=true` 才向学校 Runner 分发部署任务。`workflow_run` 工作流须先合入默认分支才会生效。并发更新排队，不中途取消正在执行的部署；等待中的任务可能被较新提交替代。服务器上的文件锁另行防止两个部署同时修改版本记录。

## 学校服务器目录与数据

应用部署到该账号的 `~/projects/pillxa-dispenser/v1`。专用部署账号、Runner 和下列目录使用同一个普通账号；现有 Runner 可继续放在 `/opt/deployments/actions-runner`，无需移动。数据与容器独立保存：

```text
~/projects/pillxa-dispenser/v1/
├── current.json                 最近一次成功部署的版本目录
├── previous.json                上一次成功版本的目录记录
├── releases/                    每次部署的 Compose 配置和镜像清单
├── shared/
│   ├── data/ezdose.db            首次启动创建的 SQLite 资料及应用日志
│   ├── images/                  上传图片
│   ├── server.env               真实会话密钥和端口配置
│   └── DEPLOYMENT_READY         手工确认目录与配置已准备好
└── backups/                     每次更新前的 SQLite 与图片备份
```

Compose 把 `shared/data` 挂载到 `/app/data`，把 `shared/images` 挂载到 `/app/static/images`；路径不存在会报错，不自动建立空目录。应用日志可用 `docker logs` 查看，Docker 控制台日志限制大小轮转。业务数据库、原有日志和图片持续留在共享目录。

历史镜像保留在本机 Docker 中用于回退，版本记录和备份也会保留。空间与留存由管理员按学校要求管理，不能在部署期间清理当前或上一版本的镜像。

## 首次部署

以下命令在**学校服务器的部署账号**执行，不是在开发电脑上执行。首次安装 Runner 和配置 Docker 需要学校控制台权限或管理员协助。

### 1. 准备空的持久目录

```bash
mkdir -p "$HOME/projects/pillxa-dispenser/v1/releases" "$HOME/projects/pillxa-dispenser/v1/backups"
mkdir -p "$HOME/projects/pillxa-dispenser/v1/shared/data" "$HOME/projects/pillxa-dispenser/v1/shared/images"
chmod 700 "$HOME/projects/pillxa-dispenser/v1/shared"
```

首次不需要准备 `main.py` 或手工创建 SQLite 文件，也不需要复制旧资料。应用首次在容器中启动时自行初始化数据库。部署前没有数据库时，备份记录会明确写出 `database_present=false`，不会伪造数据库备份。

允许初始化的条件是：还没有成功部署记录，且数据、图片目录均为空。若已有部署记录却缺失数据库，或没有数据库但目录内已有不明文件，CD 会停止，避免把丢失资料误当作全新安装。首次启动若已经创建数据库后才失败，文件会保留，重试时正常备份并沿用。

### 2. 设置服务器密钥和访问端口

在学校终端直接生成配置；真实密钥只写入服务器文件，不在终端输出。已有配置保持原样：

```bash
python3 - <<'PY'
from pathlib import Path
import os
import secrets
import sys
os.umask(0o077)
configuration = Path.home() / 'projects/pillxa-dispenser/v1/shared/server.env'
if not configuration.exists():
    with configuration.open('x', encoding='utf-8') as output:
        output.write(f'V1_SECRET_KEY={secrets.token_urlsafe(48)}\n')
        output.write('V1_BIND_ADDRESS=127.0.0.1\nV1_PORT=5068\nV1_THREADS=4\n')
        output.write('V1_URL_PREFIX=/dispenser\n')
configuration.chmod(0o600)
print('Python 路径：', sys.executable)
print('配置文件：', configuration)
PY
```

| 配置 | 默认值与用途 |
| --- | --- |
| `V1_SECRET_KEY` | 首次随机生成，至少 32 个字符，保存在服务器上，不提交到 Git |
| `V1_BIND_ADDRESS` | `127.0.0.1`，供已有反向代理访问；直接通过服务器端口访问时可设为 `0.0.0.0` |
| `V1_PORT` | 宿主机端口 `5068`；容器内部固定为 `5068` |
| `V1_THREADS` | Waitress 请求线程数，默认 `4` |
| `V1_URL_PREFIX` | 浏览器访问路径的前缀，默认 `/dispenser`；不带末尾 `/`。根路径部署时设为空字符串 |

原启动配置使用 5068 且开启调试。Docker 入口改用 Waitress，并关闭调试和错误栈输出；部署入口通过 `V1_URL_PREFIX` 覆盖旧模块生成模板资源和跳转地址时使用的前缀，业务路由保持原样。随机会话密钥替代原固定值后，现有用户可能需要重新登录。

学校公开入口是 `https://ixd.sjtu.edu.cn/dispenser/login`。现有代理将 `/dispenser/` 剥除后转发到 `127.0.0.1:5068/`，例如公开的 `/dispenser/static/dist/main.css` 对应容器内部的 `/static/dist/main.css`。`V1_URL_PREFIX=/dispenser` 确保页面也生成这个公开地址；旧配置文件未写此项时自动使用此默认值，无需修改现有密钥文件。

2026 年 10 月 20 日首次外部页面排查发现：登录页返回 200，但仍引用旧的 `/nursing-rx/static/dist/main.css`，该地址返回 502；正确的 `/dispenser/static/dist/main.css` 返回 200 和 CSS。这说明服务健康检查不能代表页面资源正常。`check_web.py` 在镜像发布前验证登录页的本地 CSS 前缀，并模拟代理剥除前缀后实际读取 CSS；不访问外部字体站点，也不登录或修改业务数据。直接通过服务器端口浏览页面时，应设置 `V1_URL_PREFIX=`。

### 3. 配置普通账号的 Docker 访问

部署账号需要能直接运行 `docker info` 和 `docker compose version`。应用通过 Compose 的 `restart: unless-stopped` 随 Docker 重启，不再配置 Python 的 systemd 用户服务，也不需要服务器上的 Python 虚拟环境。

Docker 权限由学校管理员配置。普通 Docker 的控制权限相当于宿主机高权限，不能当成普通的低权限用户组；也可以使用学校已配置的 Rootless Docker。部署工具支持两种模式：普通模式使用部署账号 UID/GID，Rootless 模式使用映射到该账号的容器 UID 0。不要盲目用 root 运行 Runner，参考 [Docker 权限说明](https://docs.docker.com/engine/install/linux-postinstall/)与 [Rootless 模式](https://docs.docker.com/engine/security/rootless/)。

这里只写入部署文件，没有在学校或本机安装 Docker、更改权限或系统服务。

### 4. 注册学校 Runner

在仓库 **Settings → Actions → Runners → New self-hosted runner** 选择 Linux 和服务器架构，按 GitHub 当前显示的命令下载、校验、注册。自定义标签填 **`pillxa-server`**，保留默认的 `self-hosted`、`Linux`、`X64` 标签（当前服务器为 x86_64）。注册令牌在该页面生成，不写入项目文件。

这个 Runner 用于 Pillxa Dispenser 后端部署，不绑定 V1。当前工作流只部署 V1，应用目录仍是 `~/projects/pillxa-dispenser/v1`；以后其他版本可以通过同一标签选择这个 Runner，并使用各自的部署工作流和目录。Runner 名称可保留默认的 `user-Super-Server`。如果注册时漏填标签，在仓库 **Settings → Actions → Runners → 对应 Runner → Labels** 中编辑并添加 `pillxa-server`，无需重新注册。

Runner 与部署目录使用相同普通账号。可以先用 `./run.sh` 在控制台测试；长期运行时，请管理员在 Runner 安装目录按 [GitHub 官方说明](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/configure-the-application)安装后台服务：

本次注册前配置了 7890 端口代理。若目前通过终端的代理环境变量运行 `./run.sh`，首次部署期间保持该终端打开。以后切换为后台服务时，需要把实际代理配置合并到 Runner 目录 `/opt/deployments/actions-runner/.env`，保留该文件其他已有变量，再重启 Runner；这是 Runner 的配置文件，不是应用的 `shared/server.env`。本机 HTTP 代理为 `127.0.0.1:7890` 时，配置示例如下：

```dotenv
http_proxy=http://127.0.0.1:7890
https_proxy=http://127.0.0.1:7890
HTTP_PROXY=http://127.0.0.1:7890
HTTPS_PROXY=http://127.0.0.1:7890
no_proxy=localhost,127.0.0.1,::1
NO_PROXY=localhost,127.0.0.1,::1
```

Runner 启动时读取这些配置，按 [官方代理说明](https://docs.github.com/en/actions/how-tos/manage-runners/use-proxy-servers)设置；只在交互终端中 export，不代表后台服务已配置代理。完成代理配置后，由管理员按需执行后台服务安装命令：

```bash
sudo ./svc.sh install "$(id -un)"
sudo ./svc.sh start
```

只有 Runner 需要这种服务托管，应用由 Docker 管理。Docker 引擎自身也应按学校规定设置重启后可用。

本库是公开仓库，生产 Runner 应使用受限专用账号或隔离机器，工作流改动由可信维护者审核，不能批准不可信 PR 在它上面执行。标签只是机器选择条件，不是权限边界。官方建议私有仓库使用自托管 Runner，见 [访问控制说明](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/manage-access)。现有 V1 CI 仍只使用 GitHub 托管机器。

### 5. 确认资料，开启部署

确认 5068 或所选宿主机端口空闲、目录已建、密钥已生成、Docker 可用、Runner 显示 Online 后，在学校终端建立准备标记：

```bash
test -d "$HOME/projects/pillxa-dispenser/v1/shared/data" || exit 1
test -d "$HOME/projects/pillxa-dispenser/v1/shared/images" || exit 1
test -f "$HOME/projects/pillxa-dispenser/v1/shared/server.env" || exit 1
touch "$HOME/projects/pillxa-dispenser/v1/shared/DEPLOYMENT_READY"
```

在仓库 **Settings → Environments** 新建 **`v1-production`**，部署分支限制为 `main`。校方如需要人工审核，可在该环境配置审核人。

再在 **Settings → Secrets and variables → Actions → Variables** 设置**仓库变量**：

| 变量 | 值 |
| --- | --- |
| `V1_CD_ENABLED` | `true` 才部署，未设置则仅构建与测试；删除或改为 `false` 可暂停后续部署 |
| `V1_DOCKER_PLATFORM` | `uname -m` 是 `x86_64` 时用默认 `linux/amd64`；是 `aarch64` 时设为 `linux/arm64` |
| `V1_SERVER_PYTHON` | 当前填写 `/home/deploy/miniforge3/bin/python3`，避免依赖 Miniforge 交互激活；需 Python 3.10 或更新版本 |

新提交进入 `main` 后，CI 成功即触发 CD。也可对**最新 `main` 提交**对应的 V1 CI 点击 **Re-run all jobs**，检查成功后触发部署；旧提交会被版本检查拦下。所有应用密码和会话密钥继续保存在学校服务器，不需要 SSH 私钥或镜像仓库令牌。

## 查看与恢复

GitHub **Actions → V1 Server CD** 的 `package` 是镜像构建与测试，`deploy` 是学校服务器实际更新。`deploy` 跳过时表示部署开关未开启；长期等待则检查 Runner 标签、联网和在线状态。

学校终端可只读查看：

```bash
docker ps --filter label=com.docker.compose.project=pillxa-v1
docker logs --tail 80 pillxa-v1-server-1
cat "$HOME/projects/pillxa-dispenser/v1/current.json"
curl -f http://127.0.0.1:5068/__deployment_health
```

使用其他宿主机端口时替换最后一行。健康检查验证 HTTP、版本号与 SQLite 可读，用户操作、PDF、学校反向代理及实际网络入口仍需上线演练。

更新有短暂停服。依赖已在镜像中构建，加载或校验失败时旧容器尚未停止。停止后的错误会尝试恢复旧镜像，并要求它重新通过健康检查。回退只恢复程序，不自动恢复数据库或密钥配置：应用导入仍调用原有 `init_db()`，若已改变数据结构，旧程序可能也无法启动，需管理员结合备份处理，避免覆盖新产生的资料。首次部署失败则停止新容器、保留已经生成的资料、保持当前版本记录未建立，修正原因后可以重试。

## 文件与实际验证

| 文件 | 职责 |
| --- | --- |
| `.github/workflows/v1-cd.yml` | main CI 成功后构建，启用后分发部署任务 |
| `Dockerfile` / `.dockerignore` | 多阶段镜像、固定基础镜像摘要、排除运行资料 |
| `compose.yaml` | 固定镜像标签、本机端口、持久数据、容器重启与权限 |
| `build_image.py` | 最小上下文、构建、隔离启动及网页检查、镜像导出、版本及哈希清单 |
| `deploy.py` | 镜像校验、架构和账号映射、备份、容器更新与回退 |
| `run_server.py` / `check_health.py` | 生产启动与 Docker HTTP 健康检查 |
| `check_web.py` | 镜像发布前检查登录页本地 CSS 的公开路径、内容类型和非空内容 |
| `requirements-deploy.txt` / `server.env.example` | 运行依赖与无真实密钥的配置模板 |
| `tests/test_deployment.py` | 虚构资料、模拟 Docker 命令下的数据保留与更新状态验证 |

2026 年 10 月 20 日本机已通过 **32 项隔离测试**，全部运行，无跳过；验证临时 SQLite 备份、图片保留、版本记录、失败回退、首次初始化及丢库保护，并覆盖公开路径配置、旧前缀覆盖及 CSS 错误阻止发布，Docker 命令使用模拟。工作流通过 actionlint，Compose 通过项目内官方 Compose 5.6.0 的配置校验。另用虚构 Flask 应用实际验证生产入口 HTTP、关闭调试、SQLite 健康、CSS 获取和重定向前缀。

当前电脑没有 Docker 引擎，**未在本机构建镜像或运行容器**。[首次 CD](https://github.com/ma-jiale/Pillxa-Dispener/actions/runs/39285086701)已通过 GitHub 镜像构建与学校部署，外部 `/dispenser/__deployment_health` 也已验证返回正常版本。此次公开路径修复仍须推送后由新的 CD 验证实际镜像，并复查公开登录页资源；本机检查通过不代表新版已部署。

参考：[Compose 更新与健康等待](https://docs.docker.com/reference/cli/docker/compose/up/)、[Flask 生产部署](https://flask.palletsprojects.com/en/stable/deploying/)、[Waitress](https://docs.pylonsproject.org/projects/waitress/en/stable/)。
