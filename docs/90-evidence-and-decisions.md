# Pillxa Dispenser 提取依据与待决事项

本文件供功能规格的维护者查证来源、处理冲突。新实现不读取、搜索或参考所列旧文件；业务规格与交付基线在 00 至 07，独立架构与 Agent 路线在 08 至 09。这里的路径和函数名仅用于证据定位，不是新架构或新接口的命名建议。

## 提取范围与事实边界

初次功能蒸馏的核对日期为 2026 年 10 月 4 日，仓库提交为 `028eaeb07650e371509670f15ed4affc4cb0425f`，开始时工作区无未提交改动。

以下记录初次功能蒸馏阶段的历史查证；当前架构设计未读取旧代码。初次静态阅读和检索覆盖 V1 后台业务入口、页面表单、打印适配、已有测试，V1 客户端计划、识别、执行、通信、参数、日志及相关场景配置；补充检查 V0 业务入口和 Android 工作流，识别被遗留的候选能力。

没有启动旧后台、编译 Unity、执行已有测试、调用线上服务、读取现场数据库或操作真实硬件；未发现可供核对的控制板固件源文件。因此，“已观察”只指代码或配置存在相关行为，不能替代现场验收。

旧说明多处称后端位于独立仓库。本轮后端事实仅限本仓库 `legacy/v1/server`，没有访问或验证外部仓库和线上版本。没有提取真实住民列表、账号口令或历史医疗记录作为文档样例。

## 已明确的用户目标

| 事项 | 当前理解 |
| --- | --- |
| 重新组织项目 | 用户已要求先蒸馏解耦功能文档，旧代码已放入 legacy |
| 统一产品 | 处方管理和摆药控制在同一应用体验中完成 |
| 多机并行 | 不同机器分别处理不同住民，同一人的一次任务不拆机协作 |
| 机构数据 | 不同养老院隔离 |
| 更新 | 支持软件更新推送 |
| 数据 | 保留更精确、可分析、可解释的记录 |
| 运行方式 | 日常运行无需开发者监管，工作人员仍参与投料和异常处理 |
| 复杂度 | 不过度防护、不凭空扩大风险和产品范围 |

用户已明确首版开发 Windows，同时考虑后续 Android、网页端和 iOS；平台演进要求见 00，首版交付边界见 07。

当前技术方案见 08，属于按用户架构方向选择的工程基线，不伪称用户逐项指定技术。用户已要求前后端完全分离、独立重写、支持强 Agent 并行协作及未来模型能力增长；开发不参考旧代码，机器实际使用疑问向用户确认。

## 用户确认记录

确认日期为 2026 年 10 月 4 日，依据为用户在本聊天中的直接回答。以下表格维护最新有效决定，后续纠正优先于早先表述和旧代码注释；用户确认不等于已经完成新软件实机测试。

| 对应事项 | 用户已确认的决定 | 剩余细节 |
| --- | --- | --- |
| Q01 药格与日期列 | 当前 V1 药盒物理从上到下为早、午、晚；未来机构可以切换位置；第四格用途已纠正为“睡前”；七列为本次第 1 至第 7 天 | 实体列方向和新第四行适配留待设备联调 |
| Q02 摆药周期 | 同一住民通常共同周期，允许提前，不给已摆好旧盒加新药；覆盖规则在设置里调整好后通常不变，日常自动计算、不逐次选择日期；漏摆当天/次日从设置切换 | B03–B04 和 R01 给出默认值与计算细则 |
| Q03 餐食分盘 | 遵循 V1 分组并增加开关，关闭时不考虑饭前饭后分盘。V1 实际分组为饭前一组，饭后、随餐与无餐食限制另一组 | 用户未逐项指定默认；B05 和 R03 已给设计基线 |
| Q04 半片 | 人工预切，机器按半片颗粒计数；按每次服药均为半片的常见场景处理，不考虑复杂情况 | 同一任务混合整片与半片或复杂拆批不纳入；后续处方半片改整片属于普通修改，参数按 Q10 重新调整 |
| Q05 开始与暂停 | 两个电机自动调整药盒行列；开始后可投药，无需额外确认投料完成；现有机器暂停后保留进度并接着摆 | 业务行为已确认，具体命令时序留给适配联调；不推定断电恢复能力 |
| Q06 药盒归属 | 知道属于哪位住民就够了，同一人可以有多个盒子 | 不要求独立实体盒号、单盒用途或周期追踪；标签绑定和本次识别来源仍保留 |
| Q07 多机连接 | 每台机器各配一台电脑，同机构多台电脑共用机构数据 | 本次不要求单电脑控制多机 |
| Q08 机构与账号 | 平台管理员创建养老院及其管理员；院内管理员创建工作人员账号；普通工作人员只能进入自己的养老院；平台管理员可切换机构 | B08–B09 已给权限与床位设计默认，不扩展普通人员跨院任职 |
| Q09 断网 | 继续完成已开始的任务，联网后同步结果；新任务等待网络恢复 | 不扩展完整离线生产；设备物理断开与网络断开分别处理 |
| Q10 参数独立 | 每份处方独立、不共享；同药同规格同形态也不互用；半片改整片仍重新调整 | 多药处方内逐药独立、普通版本延续和过时回传规则见 R14 |
| Q11 更新入口 | 界面提供下载小图标，从服务器获取最新发布版本并自动更新 | 点击获取、空闲安装及失败恢复的设计基线见 R15、N04；安装技术后续选型 |
| Q12 数据留存 | 所有数据长期保留，不自动清理 | 包含业务历史、原始采样、参数、日志与附件；N05 已给备份恢复设计目标，容量与实现后续设计 |
| Q14 进度计数 | 用户说明有已摆与总目标进度，并要求以 V1 协议核对；核对发现主流程用颗粒序号作为已摆数量，软件从下发矩阵计算目标量，解析中没有逐格实测字段 | 正常进度信息已明确，不要求新增逐格上报；其他底层协议细节在联调补齐 |
| Q15 标签输出 | 新版只保留 A4 上 22 × 22 毫米标签的批量 PDF 导出 | 不保留精臣直接打印；每页 8 × 12 布局沿用旧兼容基线，实物扫描效果留待验证 |
| Q16 首批规模 | 4 家养老院，每家约 200 位住民、最多 6 台机器同时工作；合计约 800 人、最多 24 台机器，每台各配一台电脑 | N01–N03 使用明确标注的合成负载与设计目标，不冒充现场药量或实测性能 |
| Q17 平台规划 | 首版开发 Windows，同时考虑后续 Android、网页端和 iOS | 00 定义设计边界，07 定义首版交付要求；各端功能与连接方式在对应阶段确定 |
| Q18 架构与 Agent 开发 | 前后端完全分离；采用现代、清楚的架构，支持 Agent 并行协同及能力增长；独立重写不参考旧代码，机器实际使用情况询问用户；以完成任务衡量，不要求不同 Agent 实现一致 | 08 给工程基线，09 给实施路线；技术与页面方案允许有依据地改进 |
| Q19 本机环境 | 默认不修改电脑环境；确有必要安装或修改时说明必要性、申请批准后执行 | 根目录 AGENTS.md、08–09；优先使用已有工具或独立构建环境 |

第四格用于睡前。睡前时段与饭前饭后分盘是不同维度；位置配置、时段用量和分盘开关分别表达。

## 依据索引

| 编号 | 主要来源和定位 | 支撑的事实及限制 |
| --- | --- | --- |
| E01 | [后台业务](../legacy/v1/server/main.py)，`init_db`、`login`、`permission_required`、`manage_users`、`add_user`、`edit_user`；[权限测试](../legacy/v1/server/tests/test_auth.py) | 用户名密码与四类权限。没有将职业名称实现为完整角色工作流的证据；测试只阅读未运行 |
| E02 | [后台业务](../legacy/v1/server/main.py)，`normalize_rfid_uid`、`parse_rfid_uids`、`sync_patient_pill_boxes`、`add_patient`、`edit_patient`；[接口测试](../legacy/v1/server/tests/test_packer_api.py) | 住民字段、床号检查、多 RFID 绑定、规范化及唯一性；旧标识六位补零 |
| E03 | [标签与打印页面](../legacy/v1/server/templates/patients.html)、[打印接口](../legacy/v1/server/static/js/printer/printerInterface.js)、[打印适配](../legacy/v1/server/static/js/printer/jcPrinterAdapter.js)；[后台业务](../legacy/v1/server/main.py)，`export_patient_labels_pdf` | 直接打印设置、50 × 20 毫米默认纸张、单人份数；A4 22 × 22 毫米、每页 96 位置的批量 PDF；未实物验证 |
| E04 | [后台业务](../legacy/v1/server/main.py)，`manage_prescriptions`、`add_prescription`、`edit_prescription`、`upload_prescriptions_for_dispensing`；[处方表单](../legacy/v1/server/templates/prescription_form.html) | 固定早午晚、餐食关系、疗程、长期标记、规格图片；长期用 99999 天表示；API 浮点与 UI 整数不一致 |
| E05 | [计划实现](../legacy/v1/client/Assets/Scripts/PrescriptionManager.cs)，`TryGenerateDispensingPlan`、`CalculateDispensingDays`、`BuildPillMatrix`、`ApplyDispensingResult`；[主流程](../legacy/v1/client/Assets/Scripts/MainController.cs)，`RefreshPatientsAsync` 等；[配置](../legacy/v1/client/Assets/Scripts/AppConfig.cs) | 提醒、覆盖推算、分盘、七天上限和实际矩阵映射；旧注释不能替代实际赋值 |
| E06 | [识别协调](../legacy/v1/client/Assets/Scripts/PillBoxIdentificationCoordinator.cs)、[条码识别](../legacy/v1/client/Assets/Scripts/CheckPillBoxController.cs)；[界面流程](../legacy/v1/client/Assets/Scripts/UIManager.cs)，`OnPatientClicked`、`BeginIdentificationSession`、`HandleAutoBoxVerifiedAsync`、`ProceedToDispenseAsync` | 先选住民及自动识别入口、双来源、未知 RFID、冲突与更换；正在运行的机械步骤未实机确认 |
| E07 | [主流程](../legacy/v1/client/Assets/Scripts/MainController.cs)，`StartDispensingAsync`、`DispenseMedicineAsync`、`SendMatrixAndWaitAsync`、`ResetAfterDeviceLostAsync`；[错误界面](../legacy/v1/client/Assets/Scripts/ErrorResolutionUI.cs) | 逐药、换盘、跳过、人工核对、断开处理；完成后上传返回值未用于决定列表完成状态 |
| E08 | [协议编码解析](../legacy/v1/client/Assets/Scripts/SerialProtocol.cs)、[设备控制](../legacy/v1/client/Assets/Scripts/DispenserController.cs)，`SendPillMatrix`；[主流程](../legacy/v1/client/Assets/Scripts/MainController.cs)，`OnMachineOptoPulseReceived`；[Windows 传输](../legacy/v1/client/Assets/Scripts/Hardware/Transport/WindowsSerialTransport.cs) | 报文格式、命令、文本反馈、串口配置、暂停恢复、堵转。补充核对：进度分子取设备序号，分母取矩阵总数，未解析逐格实测字段；均为主机侧证据 |
| E09 | [界面流程](../legacy/v1/client/Assets/Scripts/UIManager.cs)，`ShowCompletionAsync`、`ReturnHomeAsync`、`WaitForCompletionTrayClearAsync`；[条码识别](../legacy/v1/client/Assets/Scripts/CheckPillBoxController.cs)，`WaitForNoBarcodeCoroutine`；[Home 配置](../legacy/v1/client/Assets/Scenes/Home.unity)、[Dispense 配置](../legacy/v1/client/Assets/Scenes/Dispense.unity) | 取盒方式按来源区分、条码稳定窗口 1.5 秒；不能把无识别结果概括为严格的实体空仓传感 |
| E10 | [参数管理](../legacy/v1/client/Assets/Scripts/PillCalibrationManager.cs)、[主流程](../legacy/v1/client/Assets/Scripts/MainController.cs)，`SavePulseWidthSettingsAsync`；[Home 配置](../legacy/v1/client/Assets/Scenes/Home.unity) | 光耦优化、手动开口权重、门槛及场景覆盖值；“保存了公式”不等于公式已验证通用有效 |
| E11 | [后台业务](../legacy/v1/server/main.py)，`record_dispense_log`、`get_dispense_logs`、`manage_dispense_logs`、`log_operation`、`manage_operation_logs`；[当前客户端目录](../legacy/v1/client/Assets/Scripts) 全文检索；[计划实现](../legacy/v1/client/Assets/Scripts/PrescriptionManager.cs)，`PushAllChangesAsync` | 后台存在摆药日志入口，所查当前客户端未发现对应调用；客户端主要回传处方整体数据；不能承诺记录闭环 |
| E12 | [采样记录](../legacy/v1/client/Assets/Scripts/PulseDataRecorder.cs)，`RecordSession`；[主流程](../legacy/v1/client/Assets/Scripts/MainController.cs)，`OnMachineOptoPulseReceived` 和记录调用 | 样本及 CSV 列语义。非空样本分支使用未定义局部变量 `angle`；断开早退也可能绕开记录调用。本轮未修复、未宣称可编译运行 |
| E13 | [应用设置](../legacy/v1/client/Assets/Scripts/AppConfig.cs)、[设置界面](../legacy/v1/client/Assets/Scripts/ConfigurationUI.cs)、[界面流程](../legacy/v1/client/Assets/Scripts/UIManager.cs) 快捷键与刷新方法 | 服务地址、1 至 7 天设置、提醒阈值、设备复位、快捷键；视觉校准界面代码仍存，但确认分支已改为显示自动脉冲校准提示 |
| E14 | [V0 后台](../legacy/v0/server/main_packer.py)，任务读写、排班和时间段方法；[V0 网络接口](../legacy/v0/nurse-app/app/src/main/java/com/example/medicinecontrolsystem/network/ApiService.kt)、[提醒调度](../legacy/v0/nurse-app/app/src/main/java/com/example/medicinecontrolsystem/workers/TaskScheduler.kt)、[拍照提交界面](../legacy/v0/nurse-app/app/src/main/java/com/example/medicinecontrolsystem/ui/features/photo_submit_auntie/PhotoSubmittingScreen.kt)、[本地住民管理](../legacy/v0/rx-manager-gui/src/patient_info_manager.py)；[V1 视觉计数](../legacy/v1/client/Assets/Scripts/PillCounterController.cs) | 送药、排班、提醒、拍照界面、本地缓存、视觉数药属于历史候选；未据界面名推断完整图片上传或服药证明 |

## 已发现的冲突与处理方式

| 事项 | 证据冲突或缺口 | 本规格采用的处理 |
| --- | --- | --- |
| 药盘行顺序 | `BuildPillMatrix` 实际行 0 晚、1 午、2 早；同方法注释与通信打印标签不同；旧接手说明和 README 也不一致 | 用户已确认物理从上到下早午晚，未来机构可调整并启用第四格；保留协议行号与物理位置的独立映射 |
| 第几天和星期 | 日志写 Mon 至 Sun，但矩阵实际从本次第 0 列填充 | 业务计划必须写日历日期，星期显示需由真实映射决定 |
| 覆盖起点 | 提醒基于今天，推进覆盖却基于旧末次截止日期；不同药物独立填第 0 列 | 用户已确认通常统一周期、允许提前摆药、漏摆从当天或次日开始；旧盒追加新药不在范围 |
| 处方餐食分盘 | 旧代码将饭后、随餐、随时均判入后一组，与“饭前加随餐”文字不一致；分组存在性判断也在筛选本次条目前发生 | 用户确认沿用 V1 分组并新增开关；按本次实际参与药物判断分盘为建议细则 |
| 剂量精度 | 后台支持浮点，表单整数，计划直接转整数，发送时夹到字节范围 | 用户确认支持人工预切半片；保留原片剂量并转换成有明确投料形态的整数颗粒数，不能静默取整 |
| 开仓和关仓顺序 | 老说明称先扫码后开仓，实际当前入口先开仓；开始前有跳过显式关仓的试验分支 | 用户确认开始后自动按行列定位、可直接投药且无需投料完成确认；具体命令时序另行联调 |
| 视觉校准与光耦优化 | README 仍讲拍照测面积，当前主路径根据脉宽生成参数；旧视觉配置代码尚存 | 视觉能力列为历史候选，主流程按光耦事实记录 |
| 参数默认值 | 类定义关闭优化、电机 0.3；Home 场景开启优化、电机 0.2 | 同时注明两处差异，以场景值描述该场景配置，不推定所有部署相同 |
| 取盒稳定时间 | 接手文档 1 秒、注释 3 秒，当前场景 1.5 秒 | 记录实际配置，后续验证数值，不当作通用业务常数 |
| RFID 与条码身份 | 条码常直接代表住民，RFID 有标签绑定记录 | 用户确认只识别住民即可、一人可有多盒，不要求独立盒号和逐盒管理 |
| 参数归属 | 当前参数跟处方行，无法证明同药同规格跨人跨机是否适用 | 用户确认每份处方独立，不共享；形态改变重新调整。记录参数来源及适用设备范围，不建立跨处方共享关系 |
| 摆药成功与数据保存 | 客户端结束调用整份处方上传，但未依上传结果决定完成；后台摆药日志未发现主客户端写入 | 区分物理结果和同步结果，新规格要求闭环留存 |
| 采样可用性 | CSV 写入非空样本分支引用未定义 `angle`，部分中断可绕开记录 | 标记为采集意图与已知缺口，不声称当前采样可靠或可运行 |
| 日志统计口径 | 首页以摆药日志行数统计今日数量，界面列表限制最近记录条数 | 明确任务、人数、批次数和记录数口径，不继承混合指标 |
| 后端位置与版本 | 旧文档同时说独立后端与本仓库后端，另有 V2 已终止等历史状态 | 本轮只以归档代码为依据；最新用户重写目标优先，旧维护说明不成为新需求 |
| 标签尺寸与范围 | 直接打印 50 × 20 毫米，PDF 22 × 22 毫米 | 旧版两渠道分别记录；用户已选择新版仅保留批量 PDF，直接打印不重建 |

## 决定索引与实现位置

用户确认表仅记用户直接表达的决定；本轮新增默认值不是用户逐项确认。用户要求继续按第一性原理整理后，设计基线集中到 00，业务行为集中到 02，交互与交付分别在 06、07。以下索引不重复定义规则。

| 编号 | 当前状态 | 权威位置 |
| --- | --- | --- |
| Q01 | 时段与七列已确认，物理映射待实机验证 | R03、B06、04 |
| Q02 | 周期、提前与漏摆切换已确认；覆盖规则在设置保存后自动沿用，不逐次选日期 | R01、B03–B04、P05 |
| Q03 | 分组和开关已确认；默认开启及保存范围已采用设计基线 | R03、B05 |
| Q04 | 人工半片与简单投料范围已确认 | R02 |
| Q05 | 自动定位、投料和暂停续摆已确认；药物切换采用设计基线 | R08–R09、B16、04 |
| Q06 | 仅识别住民已确认；换盘、取盒交互已采用设计基线 | R06、R13、B17 |
| Q07 | 每机一电脑、同院共享数据已确认；已开始任务不转机 | R05、B07、B13 |
| Q08 | 管理层级与机构访问已确认；权限默认与床位规则已补齐 | 01 角色表、B08–B09 |
| Q09 | 离线只完成已开始任务已确认 | R12、B18、03 |
| Q10 | 已确认每份处方独立、不共享；半片改整片重新调整 | R14、B10–B11、B14–B15、P10 |
| Q11 | 下载图标自动更新已确认；发布兼容与失败恢复为设计基线 | R15、B12、N04 |
| Q12 | 全部长期保存、不自动清理已确认；备份恢复已有设计目标 | 03 长期留存、N05 |
| Q13 | 额外范围询问未收到答复；当前按首版核心范围实施 | B01；候选不阻塞核心实现 |
| Q14 | 计数来源已核对；底层行为按有限联调清单验证 | 04、R08、03 数量与时间 |
| Q15 | 仅批量 PDF 已确认 | F05、P04、04 |
| Q16 | 4 院、800 人、24 台已确认；合成负载与时延目标已补齐 | N01–N03、A52 |
| Q17 | Windows 首版与后续 Android、网页端、iOS 的规划已确认 | 00 平台演进要求、04 边界职责、07 平台交付、A85 |
| Q18 | 独立重写、前后端分离、Agent 并行协同、结果优先已确认 | 08、09、根目录 AGENTS.md |
| Q19 | 环境默认不变、必要操作先申请批准已确认 | 根目录 AGENTS.md、08–09 |

历史已观察行为补充见 [91](91-legacy-behavior-notes.md)。当前技术架构与实施路线见 08–09，具体实现通过运行验证，不要求用户逐条裁定普通工程细节。

## 不应继承的旧实现方式

以下是本版设计基线的依据，每项对应已经观察到的耦合或缺口；当前业务要求以 00–07 为准，架构和开发路线以 08–09 为起点。

- 用界面场景或一个全局当前住民变量承担所有设备的业务状态。
- 执行完毕后上传整份旧处方缓存，顺带覆盖后来修改的用药安排。
- 用最后覆盖日期一项值概括所有部分完成、跳过和人工修正。
- 用处方行保存所有设备共享的药物运行参数，却不记录适用机器和来源。
- 将长期处方表示为巨大天数，将不足整片的剂量静默转为整数。
- 通过删除住民或处方清除与其相关的执行历史。
- 用收到 ACK、显示 100% 或页面返回首页代替保存真实执行结果。
- 将旧日志文本、无设备关联的 CSV 或日志行数当成完整业务模型。

新实现可以保持简单，但应让这些业务含义有明确归属。

## 本轮完成标准与后续维护

初次完成的是功能蒸馏与来源核对：正文可脱离旧源码阅读；历史候选没有遗漏为“从未存在”；冲突没有被悄悄选成最终规则；生产目标与旧实现事实分别标记；关键流程有可复现验收案例。

后续确认一个 Q 项时，应记录决定和适用范围，修改正文对应规则及验收期望。新增功能也应注明是用户要求还是设计建议。不要让后续 Agent 通过重新读取某份过时 README 来推翻已确认规格。

本次收敛后：00 保存默认决定，01–04 分别承担功能、流程、事实与硬件约定，06 提供可操作页面，07 给定设计性能目标。保留 F/R/A/E/Q 编号以免追溯断裂。设计基线可以按结果改进；用户要求优先，开发不读取旧代码或以旧说明推翻当前需求。
