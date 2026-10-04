# V1 维护与代码管理

2026-10-04 起，唯一维护版本是 Unity + Flask/SQLite V1。V2 重建终止，历史提交保留；不强推或改写已有提交来删除 V2 历史。

## 维护范围

- `legacy/v1/client/`：Unity 客户端，Windows 串口主线与 Android 蓝牙兼容实现。
- `legacy/v1/server/`：Flask/SQLite 服务端及 Web 页面。
- `hardware/`：本地硬件工具与分析。
- `legacy/v0/`：只读归档，不代表当前行为。

保留 V1 路径，避免把资源搬迁、功能修改和版本退役混在一次变更中。

## 分支与提交

- 本次整理在 `codex/v1-maintenance` 上进行。V2 退役、V1 功能修改和部署工作分别提交。
- 原分支、历史标签和现有独立部署工作区保留。旧 V2 分支不继续开发；只有确认不存在未合并工作后才整理分支。
- `main` 通过 PR 更新。提交前检查具体文件列表，避免整仓库无差别暂存或清理。
- V1 未提交功能修改必须单独审阅和验收，不能因本次仓库整理而被视为已验证。

## 验证

V1 服务端 Python 命令使用 `pill-dispenser` 虚拟环境：

```bash
conda activate pill-dispenser
cd legacy/v1/server
python -m pip install -r requirements-dev.txt
python -m pytest
npm ci
npm run build:css -- --content './templates/**/*.html,./static/js/**/*.js,./node_modules/flowbite/**/*.js'
```

CI 使用同名的隔离 Python 虚拟环境，运行已有服务端测试、样式构建和硬件 Python 语法检查。样式构建显式传入仓库相对路径，避免原配置中的本机绝对路径影响检查；硬件检查只编译语法，不导入脚本或连接设备。统一 `gate` 要求三个作业全部成功。

Unity 编辑器版本以 `legacy/v1/client/ProjectSettings/ProjectVersion.txt` 为准。CI 不声称覆盖 Unity 构建、真实设备动作、打印或生产数据迁移。

## 备份与数据

本次清理前的 V2 源码和未提交资料保存在本地 `.local-backups/v2-retired-2026-10-04/`，清单记录原分支、原提交及文件列表。该目录被 Git 忽略，不随提交上传。已提交的历史版本仍可通过原始提交恢复。

禁止提交业务数据库、患者数据、凭据、SDK 或构建产物。已有历史 CSV 是否脱敏仍需单独核实，本次版本退役不改变这些数据文件。
