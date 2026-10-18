# Pillxai Dispenser

面向养老院的处方管理与摆药软件。工作人员在统一界面管理用药、识别住民药盒、逐药摆放并查询实际结果；多台机器各自执行，共用本院数据。

首版 Windows，考虑后续网页、Android 和 iOS。独立 React 前端、TypeScript 中央后端与 Rust 本机设备执行程序；0.2.1 在今日工作、住民用药目录、分盘计划、执行卡与记录筛选详情基础上，提供设备中断后的重连、核对继续和结束删除，含 SQLite 本机试用服务、中文分类设置及统一自动药盒识别。中央后端提供 PostgreSQL 连接适配，多机生产部署尚待验证。

- [文档入口](docs/README.md)：业务需求与阅读地图。
- [系统架构](docs/08-system-architecture.md)：运行边界、技术基线、契约、存储与平台演进。
- [Agent 协作与实施路线](docs/09-agent-development.md)：并行开发和分阶段交付。
- [开发入口](AGENTS.md)：独立重写、结果优先与协作约定。

Windows 首版产物在 `release/`。推荐先解压便携包试用，数据保存在应用旁的 `data/`，无需安装开发工具。首次使用与实际验证见 [Windows 首版交付](docs/10-windows-first-edition.md)。没有内置账号密码。

在 `feat/pillxai-dispenser-NT` 分支独立重写。用户要求不读取、搜索、复制或参考旧代码；机器使用有疑问时询问用户。
