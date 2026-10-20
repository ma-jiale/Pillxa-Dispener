# EZ-Dose 服务器端

EZ-Dose养老院摆药机的后端服务器，基于Flask框架开发，使用SQLite数据库存储数据，为摆药机控制软件提供API服务，同时提供Web管理后台。

## V1 品牌与摆药日期维护

管理网页的显示名称统一为 **Pillxa**。

摆药覆盖日期由 V1 Unity 客户端计算，再通过 `/packer/prescriptions/upload` 上传截止日。新一次摆药从今天、处方开始日、已有覆盖截止日的次日三者中最晚的一天开始，跳过过去未摆药的日期；本次天数仍受处方结束日、补药阈值和最多 7 天限制。例如，处方从 10 月 1 日开始、从未摆药，10 月 20 日实际摆 7 天，则截止日为 10 月 26 日，不补算 1–19 日。

本次起始日期随计划保存，完成时按该日期回写，跨午夜不会将覆盖整体后移。历史记录不重写。**日期修复需要重新打包并安装 V1 Unity 客户端，仅部署服务器不会更新客户端的计算逻辑。**

日期回归验证在仓库根目录运行 `powershell -File legacy/v1/client/tools/test-prescription-dates.ps1`，复用本机已有的 Visual Studio Roslyn 编译器，也可通过 `-CompilerPath` 指定编译器路径。测试直接编译实际 `PrescriptionManager.cs`，仅替代 Unity 的序列化和网络接口，不连接服务器或设备；不代表 Unity/Android 打包或实机验证已通过。

## 🏗️ 系统架构

```
EZ-Dose Server
├── 分药机API接口     # 设备端数据同步
├── Web管理后台       # 浏览器管理界面
└── SQLite数据库      # 数据持久化存储
```

## 📋 核心功能

### 🔧 分药机系统API
- `GET /packer/patients` - 获取所有患者信息
- `GET /packer/pill-boxes` - 获取有效的 RFID UID 与患者绑定关系
- `GET /packer/prescriptions` - 获取所有有效处方数据
- `POST /packer/patients/upload` - 批量上传患者信息
- `POST /packer/prescriptions/upload` - 批量上传处方数据
- `POST /packer/dispense` - 记录发药日志
- `GET /packer/dispense_logs` - 获取发药记录

### 🌐 Web管理后台
- `/admin` - 管理后台首页（含统计数据）
- `/admin/users` - 用户管理
- `/admin/patients` - 患者管理，并为同一患者绑定一个或多个药盒 RFID UID
- `/admin/prescriptions` - 处方管理
- `/admin/dispense_logs` - 发药记录查看

## 🛠️ 技术栈

- **Web框架**: Flask
- **数据库**: SQLite
- **密码安全**: Werkzeug (密码哈希)
- **文件处理**: Werkzeug (安全文件上传)

## 📁 项目结构

```
server/
├── main.py                    # 主程序入口
├── data/
│   └── ezdose.db             # SQLite数据库文件
├── static/
│   ├── styles.css            # 样式文件
│   └── images/               # 患者照片存储
└── templates/
    ├── base.html             # 基础模板
    ├── dashboard.html        # 首页仪表板
    ├── users.html            # 用户列表
    ├── user_form.html        # 用户表单
    ├── patients.html         # 患者列表
    ├── patient_form.html     # 患者表单
    ├── prescriptions.html    # 处方列表
    ├── prescription_form.html # 处方表单
    └── dispense_logs.html    # 发药记录
```

## 🗃️ 数据库设计

### users 表 - 系统用户
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键，自增 |
| username | TEXT | 用户名，唯一 |
| password_hash | TEXT | 密码哈希值 |
| name | TEXT | 姓名 |
| can_edit_users | INTEGER | 用户管理权限 (0/1) |
| can_edit_patients | INTEGER | 患者管理权限 (0/1) |
| can_edit_prescriptions | INTEGER | 处方管理权限 (0/1) |
| created_at | DATETIME | 创建时间 |

### patients 表 - 患者信息
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键，自增 |
| patient_name | TEXT | 患者姓名 |
| bed_number | TEXT | 床号 |
| profile_photo_resource_id | TEXT | 照片文件名 |
| created_at | DATETIME | 创建时间 |

### pill_boxes 表 - RFID 药盒绑定
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键，自增 |
| patient_id | TEXT | 患者 ID（外键） |
| rfid_uid | TEXT | 硬件上报的十六进制 UID，全局唯一 |
| box_type | TEXT | 药盒类型，默认 `GENERAL` |
| display_name | TEXT | 可选显示名称 |
| is_active | INTEGER | 是否有效 (0/1) |
| created_at | DATETIME | 创建时间 |

RFID UID 在患者新增/编辑页面录入，可按换行、逗号或空格分隔。服务器会去除 `UID:` 前缀、统一转换为大写十六进制，并阻止同一 UID 绑定到不同患者。

### prescriptions 表 - 处方信息
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键，自增 |
| patient_id | INTEGER | 患者ID (外键) |
| medicine_name | TEXT | 药品名称 |
| morning_dosage | REAL | 早餐剂量 |
| noon_dosage | REAL | 午餐剂量 |
| evening_dosage | REAL | 晚餐剂量 |
| meal_timing | TEXT | 用餐时机 (before_meal/after_meal/with_meal) |
| start_date | DATE | 开始日期 |
| duration_days | INTEGER | 持续天数 |
| last_dispensed_expiry_date | DATE | 最后发药有效期 |
| is_active | INTEGER | 是否有效 (0/1) |
| pill_size | TEXT | 药片大小 (S/M/L) |
| image_resource_id | TEXT | 药品图片 |
| created_at | DATETIME | 创建时间 |

### dispense_logs 表 - 发药记录
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键，自增 |
| dispense_date | DATE | 发药日期 |
| patient_id | INTEGER | 患者ID (外键) |
| prescription_id | INTEGER | 处方ID (外键) |
| medicine_name | TEXT | 药品名称 |
| dosage | REAL | 发药剂量 |
| time_period | TEXT | 时段 (morning/noon/evening) |
| dispensed_by_user_id | INTEGER | 操作用户ID (外键) |
| created_at | DATETIME | 记录时间 |

## 🚀 快速开始

### 环境要求
- Python 3.7+
- Flask
- Werkzeug

### 安装步骤

1. **安装依赖**
```bash
pip install flask werkzeug
```

2. **启动服务器**
```bash
python main.py
```

服务器将在 `http://localhost:5050` 启动

数据库文件将自动创建在 `data/ezdose.db`

## 🧪 运行测试

项目使用 `pytest` 做后端 API 与鉴权的自动化测试。测试完全隔离,**不会触碰真实的 `data/ezdose.db`**:每个用例在临时目录里新建一次性 SQLite 库,测试结束即销毁。

按 `AGENT.md` 约定,Python 操作应在 `pill-dispenser` 环境执行:

```bash
# 1. 安装测试依赖(含运行时依赖 flask/werkzeug/reportlab + pytest)
conda run -n pill-dispenser python -m pip install -r requirements-dev.txt

# 2. 运行全部测试
conda run -n pill-dispenser python -m pytest

# 只跑某个文件 / 某个用例
conda run -n pill-dispenser python -m pytest tests/test_packer_api.py
conda run -n pill-dispenser python -m pytest -k coalesce
```

测试覆盖范围:

- **纯函数**(`tests/test_helpers.py`):患者 ID 6 位补零/递增/上限、文件扩展名校验、行转字典。
- **设备同步 API**(`tests/test_packer_api.py`):患者/处方增查、RFID 药盒绑定与唯一性、字段别名兼容、`is_active` 过滤、发药记录、标定设置,以及 **COALESCE 保护专项**(设备回传 0/空值时不覆盖已校准的 `pill_size_area` / `image_resource_id`)。
- **鉴权**(`tests/test_auth.py`):登录成功/失败、`login_required` 重定向、`permission_required` 返回 403。

CI 已配置在 `.github/workflows/tests.yml`,push / PR 时在 Python 3.10 / 3.11 / 3.12 上自动运行。

## 🔍 故障排除

### 常见问题
1. **数据库锁定**: 确保没有其他进程访问数据库文件
2. **端口冲突**: 修改端口号（默认5050）
3. **权限问题**: 确保对data和static目录有写权限

### 日志查看
服务器运行时会在控制台输出详细日志，包括：
- API请求记录
- 数据库操作状态
- 错误信息详情

---

## 🎨 UI/UX 优化与开发指南

在分支 `feature/ux-improvement` 中，系统引进了 **Pillxa** 现代卡片与品牌设计系统，由 Tailwind CSS + Flowbite + Alpine.js 提供技术支撑。

### 1. 前端构建与常用命令
项目根目录下配置了 `package.json`，运行前端需要确保安装了 Node.js（和 npm/npx）：

```bash
# 1. 安装前端构建依赖
npm install

# 2. 实时监听并编译 Tailwind CSS (开发模式)
npm run watch:css

# 3. 编译并压缩 CSS (生产环境)
npm run build:css
```

### 2. 核心重构经验与避坑指南 (Gotchas)

#### ⚠️ Windows 下 Tailwind 路径匹配失效问题
- **表现**：在 Windows 操作系统中，若 `tailwind.config.js` 的 `content` 采用相对路径（如 `"./templates/**/*.html"`），编译器可能无法精准识别并抽取模板中的实用类，导致生成的 CSS 缺乏对应样式。
- **解决**：在配置文件中，针对模板文件**直接指定绝对路径或增加扁平化通配符**（例如 `"D:/WorkSpace/Dispenser/EZ-Dose-server/templates/**/*.html"`），强制编译器在 Windows 下绝对定位。

#### ⚠️ HTML 输入框的 disabled 状态导致表单漏报问题
- **表现**：为了实现提交表单时的防重点击动效，若直接对输入框 `<input>` 应用 `:disabled="loading"`（在 Alpine.js 提交表单时触发），**浏览器会根据 HTML 规范在提交时将该禁用元素排除在 POST 负载之外**。这会导致后端收到的表单数据为空，始终提示用户名或密码错误。
- **解决**：表单输入框在提交期间应保持 `enabled` 状态，只针对提交按钮 `<button type="submit">` 执行 `:disabled="loading"` 并展示 Loading 动效。

#### ⚠️ 错误提示兼顾 Flask error 变量与 Flash 渲染
- **表现**：原系统后台可能存在两种错误反馈链路：一种是通过 `render_template(..., error=error)` 注入的上下文变量，另一种是 Flask `flash()` 闪现消息队列。
- **解决**：在编写 Jinja2 提示框模板时，应通过合并赋值同时支持两者的渲染逻辑，以增强前后端兼容性：
  ```html
  {% set display_error = error or (get_flashed_messages(category_filter=["error"])[0] if get_flashed_messages(category_filter=["error"]) else None) %}
  ```
