# 历史基线与目录沿革

## V1 冻结基线

冻结日期为 2026-09-17。这些标签保留发布时的代码，不代表当前维护版本或工作区已通过实机验收。

| 组件 | 原仓库与分支 | 原始提交 | 基线标签 | 当前维护路径 |
| --- | --- | --- | --- | --- |
| Unity 客户端 | `ma-jiale/EZ-Dose`，`main` | `cf19c66d` | `mdis-v1-unity-baseline` | `legacy/v1/client/` |
| Flask 服务端 | `ma-jiale/nursing-rx`，`feature/ux-improvement` | `d37f2d8d` | `mdis-v1-flask-baseline` | `legacy/v1/server/` |

Flask 原仓库完整历史通过 `git subtree add` 导入，导入提交为 `f574154`。基线标签及原始提交继续保留。

需要查阅基线时，在独立工作区检出对应标签，不覆盖正在维护的 V1 工作区。

## 目录沿革

- V0 原型归档至 `legacy/v0/`，不作为当前行为依据。
- Unity 与 Flask V1 保持 `legacy/v1/client/`、`legacy/v1/server/` 路径。
- 硬件工具与分析维护在 `hardware/`。
- 曾在 `apps/` 试验 Flutter/FastAPI V2，相关提交保留于 Git 历史。

## 2026-10-04：终止 V2 重建

仅继续维护 V1。当前代码线移除 `apps/`、V2 专属规格与界面文档、PostgreSQL 容器配置；不继续执行 SQLite 到 PostgreSQL 的重建迁移计划。

V1 源码路径、历史提交及基线标签保持不变。根目录 CI 改为验证 V1；`legacy/v1/server/.github/workflows/` 是原仓库保留文件，GitHub 不会自动执行嵌套工作流，实际 CI 入口是根目录 `.github/workflows/ci.yml`。

具体维护约定见 [维护与代码管理](maintenance.md)。
