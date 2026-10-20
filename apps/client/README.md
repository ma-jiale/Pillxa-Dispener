# Pillxa 客户端交互预览

这是面向 Android 平板首发的 Flutter 客户端预览。当前采用用户确认的极简风格作为唯一界面，移除底部方案切换栏和其他方案，继续完善处方管理。浏览器预览用于快速评审，Android Debug APK 用于在平板上体验实际尺寸与触控。

本轮已建立界面和内存演示交互，尚未接入 FastAPI、HC-06、摄像头或 RFID、Android 后台生命周期和生产数据持久化。演示中的药量与进度来自固定样例，不是依据真实处方、覆盖日期或机构设置计算的业务计划，也不会控制机器。

## 可以体验什么

左侧固定 `Pillxa` 字标与简约图标，按“摆药”“处方管理”“设置”排列，登录后默认进入摆药，直接切换，不设返回页。当前侧栏按最新确认采用图标文字横排和较长圆角矩形；选中背景固定浅灰，不随强调色变化。设置使用齿轮、摆药使用下半黑色与上半白色的胶囊，处方管理保留原图标。三个页面共用当前演示状态。

| 模块 | 当前交互 |
| --- | --- |
| 处方管理 | 统一展示带彩色简笔画头像的长者，按姓名和床位搜索，新增及编辑资料；维护分时段剂量、餐食、投料形态和用药日期，停用与恢复药物条目，进入摆药演示 |
| 摆药 | 登录后默认打开此页；模拟药盒核验、开始、暂停、继续、换药、调整开口及取消；当前药物图片与进度为主，下一药简短预告 |
| 设置 | 分类导航与跨分类搜索；分组列表中调整通用规则和强调色，查看本机设备未接入状态，确认后重置演示 |

主体采用白色或浅灰背景，灰色区分层级。黑色是默认强调色，可在设置中更改；药品图片保留原色。设置变化仅用于交互体验，尚不参与生产计划计算。

“设置”下方显示演示护理员的圆形头像和账户名，点击可选择“退出当前用户”。退出后回到登录表单并清空凭据；真实登录服务尚未接入。有执行中、暂停或待换药的任务时，须先完成或结束当前摆药。加载页仅显示品牌图标与 Pillxa 字标。

设置页采用左侧分类、右侧分组列表，提供通用、外观、本机设备、演示与关于四类；窄屏使用分类选择器。搜索跨分类筛选设置，切换分类保留未应用的颜色输入。

姓名必填、床位选填；所有已登记长者的非空床位不能重复。用药表单校验正剂量、整片/半片匹配、有效日期和睡前格设置，取消修改时保护未保存输入。修改处方不会改写已经创建的演示任务。图片上传、标签和历史版本持久化尚未实现。

「预览摆药」仅选取今日有效用药，以固定数量演示界面；它不执行正式覆盖周期、餐食分盘或矩阵计算，未来生效用药的提前准备仍须由中央计划服务实现。

资料、设置、颜色和任务状态都只保留在本次应用会话中，浏览器刷新或应用重启后重置。页面切换时保留演示进度，不表示已经实现切换其他应用、锁屏或强杀后的真实设备执行保障。

## 登录预览

首次启动显示登录表单，登录后默认进入摆药。提供账号和密码输入、密码显隐、必填校验与错误提示，手机键盘弹出时仍可滚动操作。当前仅在本地验证公开演示账号 `demo` / `pillxai`，可点击“填入演示账号”后登录；任意其他账号不能进入。此流程不代表真实认证、授权或安全会话已经实现，不发送、记录或持久化输入的密码。刷新或重启后重新登录。`initiallySignedIn` 只用于 GUI 测试构造已登录的演示场景。

## 当前界面

应用统一采用已确认的极简风格：细边框、白灰层级、克制留白，以及横向图标文字侧栏。侧栏选中背景固定浅灰，强调色可在设置中更改；不再提供底部方案栏或其他风格入口。

打开[本机交互预览](http://127.0.0.1:5180/)体验三个模块。[界面截图](preview/index.html)展示当前实际运行画面，也可通过[本机截图入口](http://127.0.0.1:5180/preview/)浏览。用户原型和视觉参考保留在 [UI 参考目录](../../assets/ui-references/index.html)。

## 菜单与弹层

设置和处方中的选择器共用 `AppSelect`，账户和更多操作共用 `AppActionMenu`，在 `widgets/app_menu.dart` 维护。浮层采用白底、16 像素圆角、细灰边框和轻阴影，选项使用浅灰底及勾选标记；点击外部或按 Escape 关闭。保留 Flutter 菜单的焦点导航、语义和视口避让能力，避免各页单独编写弹出层。

确认弹窗、日期选择器、开关、提示和按钮反馈由 `theme/app_theme.dart` 统一配置：白灰层级、较小字号、柔和遮罩、固定圆角，去掉默认水波纹与表面染色。账号头像及药品图片保持原色。三个尺寸下的选择、关闭与页面切换已由交互测试覆盖。

## 技术选择与官方参考

本轮研究了 [Flutter Material 3 组件](https://docs.flutter.dev/ui/widgets/material)、[Forui](https://forui.dev/) 和 [Shadcn UI for Flutter](https://mariuti.com/flutter-shadcn-ui/)。Forui 提供可定制的简约 Flutter 组件；Shadcn UI for Flutter 提供主题与组件，并说明了和 Material 组合使用的方式。

当前采用 **Material 3 + 小型自定义设计层**：使用现有按钮、输入、选择、弹窗和语义能力，以 `ThemeData` 和 `Surface` 集中定义间距、圆角、灰阶与边框，让三个模块保持一致并减少重叠的组件和主题依赖。Forui 和 Shadcn UI 本轮仅作研究参考，未加入依赖。

## 本地运行与构建

以下命令在**仓库根目录**的 PowerShell 中执行。项目当前使用 Flutter **3.47.1**、Dart **3.13.1**；依赖清单及锁定结果见 [pubspec.yaml](pubspec.yaml) 与 [pubspec.lock](pubspec.lock)。

统一入口 [scripts/flutter.cmd](../../scripts/flutter.cmd) 调用仓库内 `.tools/flutter`，自动切换到 `apps/client`。Pub、Gradle 和 Android 用户缓存均指向仓库 `.tools`；脚本仅配置当前进程，不改全局 PATH 或注册表。Android 构建使用本机已有 Android SDK 和 Android Studio JBR，可通过当前进程的 `ANDROID_SDK_ROOT`、`JAVA_HOME` 指定已有路径。

安装项目依赖、静态检查和测试：

```powershell
.\scripts\flutter.cmd pub get
.\scripts\flutter.cmd analyze
.\scripts\flutter.cmd test
```

构建并打开浏览器预览：

```powershell
.\scripts\flutter.cmd build web --release --no-web-resources-cdn
node .\scripts\serve-preview.cjs
```

服务启动后打开 [localhost:5180](http://localhost:5180/)；它只监听本机 `127.0.0.1:5180`，提供 `apps/client/build/web` 中的构建产物。修改代码后重新构建并刷新浏览器。结束预览服务可在对应终端按 `Ctrl+C`。

需要热重载时，可启动 Flutter 的开发预览：

```powershell
.\scripts\flutter.cmd run -d chrome
```

查看已连接终端、运行到指定设备，以及构建 Android 调试包：

```powershell
.\scripts\flutter.cmd devices
.\scripts\flutter.cmd run -d <device-id>
.\scripts\flutter.cmd build apk --debug
```

将 `<device-id>` 替换为设备列表中的实际 ID。Android Debug APK 输出为 [build/app/outputs/flutter-apk/app-debug.apk](build/app/outputs/flutter-apk/app-debug.apk)，可复制到 Android 平板手动安装体验。它是调试预览包，不是正式签名发布包。

## 目录与责任

| 位置 | 责任 |
| --- | --- |
| `lib/main.dart` | 应用入口、三入口侧边栏、当前强调色 |
| `lib/theme/app_theme.dart` | 统一设计参数、Material 主题与公共表面组件 |
| `lib/screens/` | 处方管理、摆药与设置页面 |
| `lib/models/demo_model.dart` | 内存资料、任务快照与演示状态转换；不包含网络或设备命令 |
| `assets/` | 本地字体、示例药品图片与彩色简笔画头像 |
| `preview/` | 当前界面的实际运行截图与离线浏览页 |
| `test/` | 演示状态转换、处方表单、切页与自适应布局验证 |

生产系统仍须遵守 [业务流程](../../docs/02-workflows-and-rules.md)、[页面规则](../../docs/06-pages-and-interactions.md)及[责任边界](../../docs/08-system-architecture.md)。预览模型不替代中央计划服务或本机设备执行核心，不迁移旧数据，也不读取旧实现。

## 实际验证与限制

下表为 2026 年 10 月 19 日本轮菜单与弹层统一后的实际验证结果：

| 检查 | 结果与范围 |
| --- | --- |
| `flutter analyze` | 通过，无问题 |
| `flutter test` | 35 项通过；覆盖菜单选择、Escape 关闭、点击外部切页关闭、登录校验、密码显隐、退出清空凭据、键盘避让、默认摆药入口、账户退出及任务保护、设置分类搜索、识别门槛、任务快照、长者资料与搜索、剂量日期校验、药物停用恢复、未保存保护、药图原色，以及 1280×800 / 1024×600 / 390×844 布局 |
| `flutter build web --release --no-web-resources-cdn` | 已成功生成 Web 预览构建，渲染资源随构建提供 |
| `flutter build apk --debug` | 已成功生成 Android Debug APK |
| 浏览器实际检查 | 本轮在浏览器确认设置选项展开、选择生效和账户菜单；此前已检查登录、退出、设置分类与处方表单；此前已检查处方搜索及药物表单 |
| 界面截图 | 当前 Flutter 组件直接渲染为 1280×800，已检查登录、摆药、处方、设置选项、账户菜单与调整开口弹窗；另在应用内检查窄屏显示 |

这些结果验证的是当前 GUI 和演示模型。Android 平板实机安装、真实蓝牙、后台与锁屏、断网和恢复、生产权限及数据保存尚未验收；Windows 和 iOS 的构建与硬件能力也未在本轮验证。代码继续变化后，需要重新运行相应检查与构建，并以最新结果更新此表。

示例药品图片由内置生图工具生成，使用虚构名称且保留自然色彩；[生成说明](assets/images/source-prompts.json)随素材保存。它们只用于界面演示。字体及许可证保存在 `assets/fonts`。

四位示例长者与演示账户的彩色简笔画头像由内置生图工具生成，素材和[提示词记录](assets/images/avatars/source-prompts.json)保存在 `assets/images/avatars`。新增长者未上传头像时使用通用人像图标。
