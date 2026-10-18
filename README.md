# Pillxai Dispenser

面向养老院的处方管理与摆药系统。工作人员维护住民用药，核对摆药计划，识别药盒，逐药执行并查询实际结果。

## 当前状态

2026 年 10 月 18 日，用户决定放弃本轮 Tauri 实现，重新使用 Flutter 开发。当前仓库是保留业务规格、已确认设备事实和品牌素材的文档基线；尚无 Flutter 工程、可运行服务或当前版本安装包。Windows 首版交付，长期支持 Windows、Android 和 iOS；网页端范围在相应阶段确定。

## 开发入口

- [业务文档](docs/README.md)：范围、功能、业务规则、数据、设备、案例、页面和验收要求。
- [系统架构](docs/08-system-architecture.md)：Flutter 方向和客户端、中央业务、本机执行的责任边界。
- [实施路线](docs/09-agent-development.md)：从最小可运行切片开始验证。
- [开发约定](AGENTS.md)：独立重写、环境约束和结果要求。
- [品牌素材](assets/branding/README.md)：已确认图标和文字标志。

保留需求与真实设备事实，重新实现代码。不得读取、搜索、复制或参考 legacy 或其他旧实现。

原实现保存在恢复分支 `archive/tauri-0.2.1-before-flutter`；本机备份在 `.local-backups/tauri-retired-20261018/`，不作为新实现的代码依据。恢复点、未提交修改和历史交付材料的保存方法见该目录内说明。原有 Git 历史继续保留。
