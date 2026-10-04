# STM32 Machine Communication Protocol

## Protocol Baseline & Source of Truth

- **代码基线事实来源**：`legacy/v1/client/Assets/Scripts/SerialProtocol.cs`、`DispenserController.cs`、`PrescriptionManager.cs`。
- **物理接口**：
  - Windows COM 串口为主线，默认参数：**115200 波特率，8 数据位，无校验位 (None)，1 停止位 (8N1)**。
  - Android HC-06 蓝牙模块为历史兼容传输通道。

## Frame Format

### 发送帧结构（二进制）

```
[0xAA] [0xBB] [Command: 1 Byte] [Data: N Bytes] [Checksum Low: 1 Byte] [Checksum High: 1 Byte]
```

- **帧头**：固定双字节 `0xAA 0xBB`。
- **校验和（Checksum）**：虽然历史代码变量命名为 CRC，但**底层实现实际为 Command 字节与 Data 所有字节的 16 位累加和（不包含 0xAA 0xBB 帧头）**，采用小端序（Little-Endian）存放。
- **数值字节序**：浮点数（float）与 32 位整型（uint32）数据字段均采用 IEEE 754 小端序排列。

### 核心命令表

| 命令名称 | 十六进制值 | 说明 |
| :--- | :--- | :--- |
| `SKIP_TASK` | `0x00` | 跳过当前正在执行的分药任务 |
| `RESET_DISPENSER` | `0x01` | 复位分药机内部机构与状态机 |
| `CLEAN_PILLS` | `0x02` | 执行清药动作（将残留药粒排入回收仓） |
| `OPEN_TRAY` | `0x03` | 推出/打开药盒托盘 |
| `CLOSE_TRAY` | `0x04` | 收回/关闭药盒托盘 |
| `SEND_PILL_MATRIX` | `0x05` | 下发 4×7 分药目标网格数据 |
| `SET_OPTOCOUPLER_THRESH` | `0x06` | 设置对射光耦脉宽过滤门限参数 |
| `NORESP` | `0x07` | 心跳/无响应测试命令 |
| `SET_MOTOR_SPEED` | `0x08` | 设置分药电机旋转速度与步进参数 |
| `SET_MOTOR_DELAY_STOP` | `0x09` | 设置电机停止延时缓冲时间 |
| `ACK` | `0x0A` | 客户端应答确认帧 |
| `SET_CLEAN_SPEED` | `0x0B` | 设置清药旋转速度 |
| `SET_CLEAN_DELAY` | `0x0C` | 设置清药延时时长 |

*示例：`OPEN_TRAY` 无额外数据负载，完整发送帧为 `AA BB 03 03 00`（校验和 0x0003，小端序 03 00）。*

### 接收反馈（ASCII 文本行）

与发送的二进制不同，STM32 固件上报的反馈为换行符分隔的 ASCII 字符串：
- `ACK`：硬件接收指令确认（**注意：仅代表下位机收到指令，不等于物理动作执行完毕**）。
- `DONE`：特定动作执行结束。
- `machine init`：下位机上电复位初始化完成。
- `machine_state:FINISH`：分药全流程正常结束。
- `machine_state:CNT_ERR`：分药计数异常（出药数量与目标不符）。
- `pills out:N`：当前已排出药粒数量统计。
- `cleaned pills:N`：清药排出药粒数量。
- `UID:<HEX_STRING>`：检测到底部药盒 RFID 卡 UID。
- `NO CARD`：未检测到药盒卡片。
- `number:N,width:W`：光耦检测到的药粒脉冲编号与脉冲宽度数据。

## Pill Matrix Mapping (4×7 Grid)

分药网格固定为 4 行 × 7 列，单次支持最大 7 天周期：
- **行定义（Row Index）**：
  - `row 0`：**晚上（Evening）**
  - `row 1`：**中午（Noon）**
  - `row 2`：**早上（Morning）**
  - `row 3`：**备用（Spare / Bedtime 预留）**
- **映射规则**：
  - 禁止将备用行（row 3）自动隐式当成睡前时段，需由处方模型显式声明。
  - UI 展示的“周一至周日”日历顺序与固件发送的“第 1 天至第 7 天”必须经过明确索引映射转换，不得混淆。
  - 任务执行完毕后，处方实际执行日期必须根据实际下发的有效天数回写，跳过或出错的周期不得误标记为已发药。

## Optocoupler Calibration & Parameters

- **有效脉宽区间**：光耦单次检测最小有效脉宽阈值为 `3`，最大阈值为 `200`。
- **参数动态优化**：下位机与上位机基于滑动窗口中位数统计算法过滤机械抖动，默认门限需累计至少 7 个有效样本方可触发自适应参数微调。

## V1 维护约定

当前协议行为以正在维护的 V1 源码为准；文档与代码存在差异时先核对源码及设备反馈，不通过真实摆药动作试探协议。

串口与蓝牙均为流式传输，维护时必须处理分包与多条反馈合并到达的情况。摄像头条码识别与硬件 RFID 反馈分别核对，禁止互相串扰。物理动作结果不明确时引导人工核对，不盲目重放下药指令。
