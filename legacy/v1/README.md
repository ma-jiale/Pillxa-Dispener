<p align="center">
  <img src="images/MainPhoto.jpg" alt="EZ-Dose 智能分药系统" width="600"/>
</p>

<h1 align="center">EZ-Dose 智能分药系统</h1>

<p align="center">
  <b>面向康养机构的智能药物管理系统</b><br>
  <sub>处方管理 · 智能分药 · 全程可追溯</sub>
</p>

<p align="center">
  <a href="./README_EN.md">English</a> | 中文
</p>

---

> **V1 当前维护说明**：
> - `client`: Unity (Windows x64 / Android 兼容)
> - `server`: Flask + SQLite
> 
> 2026-10-04 起，V1 是唯一维护版本，V2 重建已终止。本目录继续承载日常开发；冻结基线由 Git 标签保留，不等同于当前工作区。维护规则见 [仓库根说明](../../README.md)。

## 项目简介

EZ-Dose 是一个面向康养机构的**智能药物管理系统**，为搭载 STM32 的自动分药机设计并实现了一套完整的"**处方管理—分药控制—操作记录**"多端交互系统。

> **当前主线平台：Windows。** 分药控制程序运行在 Windows 电脑上，通过 COM 串口直接连接 STM32 分药机。Android + HC-06 蓝牙方案仍保留为兼容实现，但不再是当前主要部署方式。

### 核心价值

> 在康养机构分药场景中，通过软硬件协同的交互系统设计，将原本依赖护理人员记忆、计算和体力操作的分药流程，转化为由**系统主导、护理人员监督**的协作流程，从而**降低认知负担**、**减少体力劳动**，并实现**全过程可追溯**的用药管理。

### 系统组成

| 组件 | 描述 | 技术栈 |
|------|------|--------|
| 🌐 **处方管理网站** | 医护人员管理患者信息、录入处方、查看分药记录 | Flask + SQLite |
| 🖥️ **分药控制程序** | 在 Windows 电脑上连接分药机、扫码识别并控制分药流程 | Unity + Windows x64 |
| 🔌 **硬件通信** | 通过 Windows COM 串口与 STM32 直接通信，Android 蓝牙作为兼容方案保留 | Win32 Serial + STM32 |

---

## 系统架构

当前 Windows 主线架构：

```mermaid
flowchart LR
    Staff[医护人员] --> Web[处方管理网站]
    Web <-->|HTTP(S)| Server[Flask 服务器]
    Server <--> DB[(SQLite 数据库)]
    Server <-->|HTTP(S)| Client[Windows 分药控制程序]
    Camera[摄像头 / 条码扫描] --> Client
    RFID[RFID 检测器] --> Machine
    Client <-->|COM 串口 · 115200| Machine[STM32 自动分药机]
```

Android 平板通过 HC-06 蓝牙连接分药机的旧架构仍受代码兼容，但当前开发和部署以 Windows 串口方案为准。

---

## 功能特性

- ✅ **患者管理** - 管理患者基本信息，支持药盒标签打印
- ✅ **处方管理** - 录入和管理患者处方，支持多时段用药
- ✅ **智能分药** - Windows 客户端引导分药流程，自动控制分药机
- ✅ **参数校准** - 根据光耦反馈自动优化电机速度和舵机角度
- ✅ **双通道药盒识别** - 支持摄像头条码或 RFID 自动匹配患者信息
- ✅ **分药记录** - 完整记录每次分药操作，支持追溯查询
- ✅ **权限管理** - 支持不同角色（医生、护士、管理员）的权限配置

---

## 🚀 快速开始

### 前置要求

- Windows 10/11 64 位电脑
- Unity 6.3 和 Windows Build Support（仅从源码构建时需要；项目当前使用 Unity 6000.3.2f1）
- 可被 Windows 识别为 COM 端口的 STM32 USB 串口或 USB 转串口设备
- 用于药盒条码识别的摄像头
- 可选的 RFID 药盒标签（由分药机开仓后检测）
- 搭载 STM32 的自动分药机
- Python 3.9+ 与 pyserial（仅使用串口诊断工具或配置可选的 HC-06 蓝牙方案时需要）

### 1️.克隆仓库

```bash
git clone https://github.com/ma-jiale/EZ-Dose.git
cd EZ-Dose
```

### 2️.连接 Windows 串口

当前 Windows 版本通过 COM 串口直接连接 STM32，不需要 HC-06 蓝牙模块。

1. 使用 USB 数据线或 USB 转串口设备连接 Windows 电脑与 STM32
2. 在 Windows **设备管理器 → 端口（COM 和 LPT）** 中确认对应端口，例如 `COM3`
3. 确认 STM32 串口参数为 `115200 baud / 8 data bits / no parity / 1 stop bit`
4. 关闭串口调试助手等可能占用该 COM 端口的程序
5. 启动 EZ-Dose，在设备管理界面刷新设备并选择 `STM32 Dispenser (COMx)` 连接

程序会自动枚举 Windows 中可用的 `COM1` 至 `COM256` 端口。目前所有有效串口都会显示为 `STM32 Dispenser`，因此连接前请先在设备管理器中确认分药机实际对应的端口。

如需在启动客户端前验证串口，可使用仓库自带的诊断脚本：

```bash
python -m pip install pyserial
python client/tools/serial_probe.py --list
python client/tools/serial_probe.py --port COM3 clean
```

诊断结束后请关闭脚本，再由 EZ-Dose 客户端连接该端口。

#### Android / HC-06 兼容方式（可选）

如需继续使用旧 Android 平板版本，可为 STM32 加装 HC-06 蓝牙串口模块。该方式不是当前 Windows 主线的必要条件。

HC-06 蓝牙串口模块

<img src="images/image-20260204123339711.png" alt="HC-06蓝牙模块" width="300"/>

##### 修改波特率

STM32 串口通信波特率是 115200，但 HC-06 默认波特率是 9600，需要修改为一致：

```bash
# 安装依赖
pip install pyserial

# 列出可用串口
python hardware/hc06_baudrate_configurator.py --list

# 修改波特率（将 COM6 替换为您的实际端口）
python hardware/hc06_baudrate_configurator.py --port COM6 --current-baud 9600 --target-baud 115200
```

##### 修改蓝牙名称（可选）

```bash
python hardware/hc06_name_configurator.py --port COM6 --name "PillDispenserXX"
```

##### 电压转换电路

由于 HC-06 的高电平是 3.3V，STM32 的高电平是 5V，需要使用 1kΩ 和 2kΩ 电阻制作分压电路：

分压电路原理图

<img src="images/image-20260204123442739.png" alt="电路原理图" width="300"/>

实物接线图

<img src="images/2f036d90c4fdd007d465ec7600c208fd.jpg" alt="实物接线图" width="400"/>

##### 引脚连接

根据下图连接控制板和蓝牙模块的对应引脚：

引脚连接图

<img src="images/image-20260204123818392.png" alt="引脚连接图" width="400"/>

> **✅ 验证**：上电后蓝牙模块指示灯持续闪烁表示连接成功

### 3️.准备后端服务器

```bash
# 后端代码位于独立仓库
git clone https://github.com/ma-jiale/nursing-rx.git EZ-Dose-server
cd EZ-Dose-server
```

请按 `EZ-Dose-server` 仓库 README 启动 Flask 后端，并在 Windows 客户端设置页填写对应服务器地址。
Windows 客户端与服务器部署在同一台电脑时可使用本机地址；部署在不同设备时填写服务器的局域网或公网地址。客户端地址可在设置页修改，实际端口和 URL 前缀以后端仓库当前配置为准。

#### 公网访问（可选）

如需从外网访问，可以使用 Nginx 反向代理或内网穿透工具（如 ngrok、frp）。后端的 URL 前缀、端口和部署方式以 `EZ-Dose-server` 仓库配置为准：

```python
# 当前远程部署示例
URL_PREFIX = '/nursing-rx'
```

### 4️.编译 Windows 分药控制程序

1. 使用 Unity Hub 打开 `unity` 目录
2. 确认 `Assets/OpenCVForUnity` 和 `Assets/Plugins/Zxing` 已存在
3. 选择 **File → Build Profiles**（旧版界面为 Build Settings），切换平台到 **Windows**
4. 目标架构选择 **Intel 64-bit / x86_64**，点击 **Build**
5. 保留 `EZ Dose.exe`、`EZ Dose_Data/` 和 `UnityPlayer.dll` 等完整构建目录，在 Windows 中运行 `EZ Dose.exe`

发布时必须分发 Unity 生成的完整 Windows 构建目录，不能只复制 `EZ Dose.exe`。

> **⚠️ 注意**：COM 端口同一时间只能被一个程序占用。运行 EZ-Dose 前请关闭串口助手、烧录工具的串口监视器等程序。

---

## 📖 使用说明

### 使用流程概览

EZ-Dose 系统使用流程图

![使用流程图](images/使用流程图.png)

---

### 处方管理网站

#### 登录系统

运行后端服务器后访问对应登录地址，例如 `http://服务器地址/login`；端口和 URL 前缀以 `EZ-Dose-server` 的部署配置为准。

登录界面

![登录界面](images/web_login_page.png)

> **默认管理员账户**  
> 用户名：`admin`  
> 密码：`admin123`  
> 首次登录后请及时修改密码

#### 主页功能

主页包含四大功能板块：**用户管理**、**患者管理**、**处方管理**和**系统记录查询**

主页界面

![主页](images/image-20260204134632640.png)

#### 用户管理

新增用户和修改已有用户信息，可为不同角色（医生、护士、院长等）设置不同权限

用户管理界面

![用户管理](images/image-20260204134852692.png)

用户信息表单

![用户表单](images/image-20260204134937663.png)

#### 患者管理

新增患者和修改患者信息，支持打印患者药盒标签，并可为同一患者绑定多个药盒 RFID UID。UID 使用硬件上报的十六进制内容，例如 `5303859E740001`，每行填写一个。

患者管理界面

![患者管理](images/image-20260204135040150.png)

> **📌 标签打印说明**  
> - 仅支持 Windows 系统
> - 需安装 `print_service` 目录下的精臣打印服务 SDK
> - 使用 USB 连接精臣标签打印机
> - 使用 50×20mm 白色标签纸

#### 处方管理

新增和修改患者处方信息

处方管理界面

![处方管理](images/image-20260204135714765.png)

处方表单

![处方表单](images/image-20260204135844987.png)

#### 系统记录

查询分药记录和系统操作记录（新增、修改、删除患者/用户/处方等）

分药记录查询

![分药记录](images/image-20260204140012335.png)

操作记录查询

![操作记录](images/image-20260204140045611.png)

![操作详情](images/image-20260204140048375.png)

---

### 🖥️ Windows 分药控制程序

> 下面部分界面截图采集自早期 Android 构建。当前 Windows 版本沿用相同的 Unity 业务场景和操作流程，设备连接方式已改为 Windows COM 串口。

#### 分药前准备

1. 准备贴好条码标签或已绑定 RFID 标签的患者药盒
2. 插上自动分药机电源并开机
3. 使用 USB 串口连接 Windows 电脑与分药机
4. 确认设备管理器中已出现对应 `COM` 端口，并关闭其他占用串口的软件
5. 如需使用条码识别，连接用于扫描药盒条码的摄像头
6. 打开 Windows 分药控制程序，并检查服务器 URL

分药机设备

<img src="images/7e6906dbcc70b91b3ee85b1d391a2694.jpg" alt="分药机设备" width="500"/>

#### 主页预览

医生录入处方后，可在首页看到对应的患者处方卡片

客户端首页

![首页](images/Screenshot_20260203_215159_com.HyggeLab.EasyDosePRO.jpg)

> **💡 提示**：如果看不到处方卡片，请在设置中检查服务器 URL 等参数是否正确

#### 连接分药机

点击右上角按钮连接分药机

连接分药机

![连接分药机](images/Screenshot_20260203_215237_com.HyggeLab.EasyDosePRO.jpg)

连接成功界面

![连接成功](images/Screenshot_20260203_215315_com.HyggeLab.EasyDosePRO-1770185443794.jpg)

> **⚠️ 连接问题排查**  
> - 在 Windows 设备管理器中确认 COM 端口存在
> - 关闭串口助手、IDE 串口监视器等占用端口的程序
> - 确认串口波特率为 115200，并检查 USB 线缆和串口驱动

#### 药盒识别

点击患者卡片并等待开仓，然后放入药盒。客户端会同时等待摄像头条码和 RFID，任意一种合法结果都可以完成识别；若两种方式同时得到结果，则必须属于同一患者。

RFID 由 STM32 通过同一个 COM 串口上报：`UID:<标签ID>` 表示药盒已放入，`NO CARD` 表示药盒已取出。未绑定的 RFID 不会选择患者，仍可继续使用摄像头识别。

扫码界面

![扫码界面](images/Screenshot_20260203_215331_com.HyggeLab.EasyDosePRO-1770185598555.jpg)

药盒扫描示意

![扫描药盒](images/be9308cbb0003604f9ff1e2693a01111.jpg)

#### 放置药盒

识别成功后分药机轨道会弹出，提醒放入药盒

放置药盒提示

![放置药盒](images/Screenshot_20260203_215421_com.HyggeLab.EasyDosePRO.jpg)

> **⚠️ 重要**：一定要确认药盒放置到位后再按下确认按钮！

药盒正确放置示意

<img src="images/50093bd8e75b28cdd509f50c75b8cd63.jpg" alt="药盒放置" width="400"/>

#### 分药参数校准

客户端在分药过程中采集 STM32 返回的光耦脉宽数据，并自动计算适合当前药物的转盘速度和舵机角度。计算结果会回写服务器，供后续分药复用；未标定药物会先使用默认参数。

#### 分药流程

根据界面信息提醒，向分药机漏斗处放入对应药品相应数量的药片

分药界面

![分药界面](images/Screenshot_20260203_215840_com.HyggeLab.EasyDosePRO.jpg)

放入药物

<img src="images/6f9e23188ba9da904b9bf3d2f3b216cb.jpg" alt="放入药物" width="400"/>

> **💡 多余药片处理**：如果放置数量超过实际需要，剩余药片会自动流入分药机回收口

药片回收口

<img src="images/358995d5aca0cd1cb43a9f66091b648f.jpg" alt="回收口" width="400"/>

#### 错误处理

如果分药机出现摆药错误，会弹出错误提示弹窗，轨道自动退出，需要手动纠正后按确认键继续

错误提示

![错误提示](images/Screenshot_20260203_215934_com.HyggeLab.EasyDosePRO.jpg)

#### 完成分药

所有药物分发完成后，界面弹出提示，轨道退出，取走药盒后按确认键收回轨道

完成提示

![完成分药](images/Screenshot_20260203_220115_com.HyggeLab.EasyDosePRO.jpg)

取走药盒

<img src="images/52864ccd15def351c3610b6b5a1fd415.jpg" alt="取药盒" width="400"/>

分药流程完成

![流程完成](images/Screenshot_20260203_220148_com.HyggeLab.EasyDosePRO.jpg)

---

## 项目结构

```text
legacy/v1/
├── client/     # Unity 分药控制程序（Windows 主线，保留 Android 兼容）
│   ├── Assets/             # Unity 资源文件
│   ├── Packages/           # 依赖包
│   ├── ProjectSettings/    # 项目设置
│   └── tools/serial_probe.py # STM32 串口诊断工具
├── server/     # Flask + SQLite 处方管理与后端服务
├── images/     # 文档图片资源
├── README.md   # V1 说明文档 (中文)
└── README_EN.md # V1 说明文档 (English)
```

---

## 故障排除

| 问题 | 解决方案 |
|------|----------|
| 找不到分药机串口 | 在设备管理器中确认 COM 端口和驱动，重新插拔 USB 设备后刷新列表 |
| 串口连接失败 | 关闭其他占用端口的软件，确认选择了正确 COM 端口且波特率为 115200 |
| 连接后无硬件反馈 | 检查 USB/串口接线、STM32 固件和收发方向，确认通信参数为 115200 / 8N1 |
| 摄像头无法使用 | 在 Windows 隐私设置中允许桌面应用访问摄像头，并关闭其他占用摄像头的程序 |
| RFID 无法识别患者 | 在服务器患者管理页面绑定硬件上报的 UID，确认 UID 未绑定给其他患者，然后刷新客户端患者数据 |
| 条码与 RFID 结果冲突 | 取出药盒，核对条码标签和 RFID 绑定的患者后重新放入 |
| 服务器启动失败 | 请在 `EZ-Dose-server` 仓库中检查端口、依赖和启动日志 |
| 数据库锁定 | 关闭其他访问数据库的进程 |
| 标签打印失败 | 确认打印机已通过 USB 连接，SDK 已正确安装 |
| 处方卡片不显示 | 检查 Windows 客户端设置中的服务器 URL 是否正确 |

---

## 许可证

本项目采用 [MIT License](./LICENSE) 开源许可证。

---

## 联系方式

如有问题或建议，欢迎提交 [Issue](https://github.com/ma-jiale/EZ-Dose/issues)！

---

<p align="center">
  <sub>Made by Jiale Ma</sub>
</p>
