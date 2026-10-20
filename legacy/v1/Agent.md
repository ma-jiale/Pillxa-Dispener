# EZ-Dose 项目接手要点

## 项目定位
EZ-Dose 是智能分药系统。本仓库当前主线是 Unity Android 平板端，负责扫码、生成分药矩阵、蓝牙控制 STM32 分药机、药片计数/校准、回写分药结果。

## 当前事实
- Unity 版本：Unity 6.3，项目实际为 `6000.3.2f1`。
- 后端不在本仓库，位于独立仓库 `EZ_Dose_server`。
- 本仓库里的 `99_archive/server` 只是历史参考，不是当前后端。
- 默认服务端地址 `http://127.0.0.1:5000` 不要擅自修改；Android 实机使用时由设置页配置局域网后端地址。
- 当前物理药盘顺序：从上到下(对应分药机是从内到外)是 `早 / 午 / 晚`的顺序。
- 当前矩阵映射：`row0=晚`, `row1=午`, `row2=早`, `row3=备用`。
- 单次分药天数上限为 7 天：STM32 只接受固定 `4x7` 矩阵。旧版本保存的 8～30 天配置会在加载时自动恢复为 7 天，写回必须按本次实际成功的矩阵天数推进。

## 主要目录
- `client/`：Unity 客户端主工程。
- `server/`：Flask 后端服务。
- `images/`：历史文档图片。
- `legacy/v0/`：更早期的原型与实验归档。

## Unity 关键代码
- `client/Assets/Scripts/MainController.cs`
  - 主流程协调器：患者刷新、分药计划、分药循环、换盘、跳过、错误恢复、校准触发。
- `client/Assets/Scripts/PrescriptionManager.cs`
  - 拉取 `/packer/prescriptions`，计算是否需要分药，生成 4x7 分药矩阵，回写处方状态。
- `client/Assets/Scripts/DispenserController.cs`
  - 串口/蓝牙连接、ACK 重试、发送 STM32 命令、解析硬件反馈。
- `client/Assets/Scripts/SerialProtocol.cs`
  - STM32 协议封包：`0xAA 0xBB + command + data + checksum`。
- `client/Assets/Scripts/CheckPillBoxController.cs`
  - ZXing 扫码，校验 Patient ID。
- `client/Assets/Scripts/PillCounter.cs`
  - OpenCV 药片计数算法，目前处于弃用状态
- `client/Assets/Scripts/PillCalibrationManager.cs`
  - 药片面积校准，以及根据药片大小计算电机/舵机参数。
- `client/Assets/Scripts/UIManager.cs`
  - Home / Scan / Dispense 场景 UI 绑定与流程跳转。

## 依赖
- OpenCVForUnity 已在 `client/Assets/OpenCVForUnity`。
- ZXing DLL 在 `client/Assets/Plugins/Zxing`。
- Android 蓝牙串口插件在 `client/Assets/Plugins/Android/bluetooth-serial.aar`。

## 注意事项
- 不要假设根目录有当前 server。
- 不要把 archive 里的旧 API 当成当前后端真相；以后端仓库为准。
- 涉及分药矩阵时必须小心行顺序，业务时间和物理位置不是直觉顺序。
- 修改代码前先检查 git 状态，不要覆盖用户已有改动。
- 每次修改后向用户解释修改的内容和逻辑
- 每次修改后如果有需要后续Agent接手注意的地方请写入此文档

## 药盒扫描与分药交互流程

目前的交互设计如下：
1. **选择患者**：用户在主界面（Home 场景）点击想要分药的患者卡片。
2. **扫码校验**：界面跳转到扫码界面（Scan 场景），用户将药盒对准摄像头进行校验（由 `CheckPillBoxController` 校验药盒上的 Patient ID 是否匹配）。
3. **开仓与弹窗**：若校验成功，系统会**在弹出确认弹窗的同时，自动开仓**（调用 `main.OpenTrayAsync()` 打开物理摆药机药盘舱门）。
4. **确认分药**：用户在确认已将药盒放入摆药机后，点击弹窗上的确认按钮，界面跳转到分药场景并开始执行分药程序。

### 分药完成后的取盒规则

- 摄像头二维码/条形码药盒：分药完成并打开轨道后立即使用最初扫码成功的同一台摄像头持续检测；条码连续消失 1 秒后自动收回轨道，无需再次确认。摄像头无有效画面或持续解码失败时必须保持轨道打开。
- RFID 药盒：完成弹窗出现后自动检测，不需要按确认键。收到 STM32 `NO CARD` 后，无卡状态稳定 1500 毫秒自动收回；任何 UID 上报均取消当前无卡计时，之后需重新收到 `NO CARD` 并稳定 1500 毫秒。重复 `NO CARD` 不重置计时。
- RFID 反馈从本次 `OpenTray` 开始由设备控制器保存，完成弹窗和异步等待创建前到达的反馈仍有效；已经开仓时完成界面不重复开仓。新开仓、成功收仓或断开连接清空观察，不把默认无卡或上次开仓的状态当成本次取盒证据。失败时保留轨道并提供重试，重试仍检查 RFID，不强制收仓。
- 两类药盒的完成逻辑按本次识别来源隔离，不能用 RFID 状态判断二维码药盒，也不能用摄像头判断 RFID 药盒。

2026-10-18 RFID 完成流程修复：`Hardware/RfidRemovalMonitor.cs` 保存当前开仓周期的单调时间观察，`DispenserController` 在每次 UID / `NO CARD` 时更新，在开仓、成功收仓和断联时重置；`UIManager` 自动启动检测并取消已开仓后的重复开仓。回归入口 `pwsh -NoProfile -File legacy/v1/client/tools/test-rfid-completion.ps1` 执行实际完成流程和反馈处理方法，使用内存设备替身与可控时钟，覆盖 20 个场景（提前反馈、单次/重复反馈、UID 插入、断联取消、收仓失败重试、重复完成通知、开仓失败、迟到回调、配置边界及摄像头隔离等）。这些测试不连接真实机器，不等于机械动作或安装包实测通过。

完成流程用独立入口标志防止重复完成通知重建监测而使等待丢失。开仓失败的重试会重新开仓；设备控制器不可用时保留重试入口。场景取消或设备失联后，开仓/收仓的迟到回调不能重启旧流程或跳回主页。RFID 稳定时间的有效值至少 1500 毫秒，旧场景配置为 0 或负数也不能立即收仓。

复查采用 Unity 6000.5.7f1 当前生成的完整编译参数（含 201 个项目及依赖源码），编辑器 Android、Android Player 和 Windows Player 条件检查均为 0 个编译错误；仍存在已有的过时 API、未使用成员等警告。Unity 日志确认新脚本已正常导入，且复查前的安装包构建成功。2026-10-18，用户确认已完成本轮 RFID 自动取盒收仓修改的实机验证。自动检查结果保存在项目本机 `.var/v1-rfid-completion-verification/final-verification.json`。

新增脚本还必须通过 Unity 资产导入检查：`.meta` 中 GUID 为 32 位十六进制，脚本导入器为 `MonoImporter`。曾因 GUID 误写为 33 位导致 Unity 忽略脚本、控制器报 CS0246；独立 C# 编译不会检查 `.meta`。上述回归入口已加入元数据检查。

### 分药界面 UI 注意点

- **下一药物文字提醒**：在 `Dispense` 场景的 `TopBar` 下配置了 `NextMedicineText`（Text 组件），由 `UIManager.cs` 的 `UpdateNextMedicinePreview(DispensingProgressInfo info)` 更新，显示下一药物名称与数量（如“下一药物：XXX，共 X 粒”或“下一药物：无”）。

### V1 摆药日期维护（2026-10-20）

- 本次覆盖从今天、处方开始日、已有截止日的次日中最晚的一天开始；过去漏摆的日期不补算，天数仍受处方结束日和 7 列上限限制。
- `DispensingMedicine.DispensingStartDate` 在生成计划时固定；正常完成、人工处理后完成、跳过但标记已摆的三条回写路径都必须传入它，不能在完成时重新用当天或旧截止日推算。
- 截止日由 `PrescriptionManager` 回写缓存并上传，服务端只保存上传值。日期修复须更新 V1 Unity 客户端；服务器 CD 不会更新已安装客户端。
- `client/tools/test-prescription-dates.ps1` 直接编译实际处方管理代码，使用隔离的 Unity 接口替代物验证日期、数量和上传入参，不接触真实数据或硬件；Unity/Android 打包与实机执行仍需单独验证。
