# EZ-Dose / Mdis

面向养老院与康养机构的智能摆药管理系统。当前唯一维护版本为 **V1：Unity 客户端 + Flask/SQLite 服务端**，Windows COM 串口为主线，Android 蓝牙为兼容实现。

2026-10-04 决定终止 V2 重建。Flutter/FastAPI 工程、V2 设计文档及 PostgreSQL 容器配置已退出当前代码线；历史提交和基线标签保留，便于追溯。

## 目录

```text
legacy/v1/client/  当前维护的 Unity 客户端
legacy/v1/server/  当前维护的 Flask/SQLite 服务端
legacy/v1/         V1 使用说明与产品资料
legacy/v0/         早期原型，只读归档
hardware/          当前硬件工具与工程分析
docs/              协议、历史基线与维护说明
```

V1 继续使用原有路径，避免影响 Unity 资源引用及现有部署工作。`legacy/v1/` 的目录名沿用历史布局，已不代表只读。

## 开发与验证

- 客户端：用 Unity Hub 打开 `legacy/v1/client/`，编辑器版本以 `ProjectSettings/ProjectVersion.txt` 为准。
- 服务端：在 `pill-dispenser` 虚拟环境中，进入 `legacy/v1/server/`，安装 `requirements-dev.txt` 并运行 `python -m pytest`。
- 服务端样式：在 `legacy/v1/server/` 运行 `npm ci`，然后按 [维护说明](docs/maintenance.md) 使用仓库相对路径构建。
- 根目录 CI 运行 V1 服务端测试、样式构建和硬件 Python 语法检查。Unity 构建与真实设备验收仍需单独进行。

启动服务器前核对其配置及数据目录。测试使用隔离的临时数据，不执行真实摆药操作。

## 文档

- [V1 使用说明](legacy/v1/README.md)
- [服务端说明](legacy/v1/server/README.md)
- [维护与代码管理](docs/maintenance.md)
- [硬件协议](docs/protocol.md)
- [历史基线](docs/migration.md)
