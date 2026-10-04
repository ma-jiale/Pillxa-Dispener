import json
import os

notebook_content = {
 "cells": [
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "# 💊 EZ-Dose 分药机光耦脉冲数据分析与参数校准系统\n",
    "\n",
    "本 Notebook 对分药机采集的药片下落光耦脉冲宽度、时间间隔、舵机角度以及分药结果进行多维度统计分析与可视化展示，并基于实测数据拟合最佳校准系数（$K_{\\text{motor}}, K_{\\text{servo}}$）。"
   ]
  },
  {
   "cell_type": "code",
   "execution_count": None,
   "metadata": {},
   "outputs": [],
   "source": [
    "# 1. 导入所需库并配置中文字体与绘图样式\n",
    "import os\n",
    "import pandas as pd\n",
    "import numpy as np\n",
    "import matplotlib.pyplot as plt\n",
    "import seaborn as sns\n",
    "from matplotlib import font_manager\n",
    "from scipy import stats\n",
    "\n",
    "# 自动加载中文字体（支持 Windows 与 WSL 环境）\n",
    "font_candidates = [\n",
    "    \"/mnt/c/Windows/Fonts/msyh.ttc\",\n",
    "    \"/mnt/c/Windows/Fonts/simhei.ttf\",\n",
    "    \"C:/Windows/Fonts/msyh.ttc\",\n",
    "    \"C:/Windows/Fonts/simhei.ttf\"\n",
    "]\n",
    "for f in font_candidates:\n",
    "    if os.path.exists(f):\n",
    "        font_manager.fontManager.addfont(f)\n",
    "\n",
    "plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei', 'PingFang SC', 'DejaVu Sans']\n",
    "plt.rcParams['axes.unicode_minus'] = False\n",
    "sns.set_theme(style=\"whitegrid\", font='Microsoft YaHei')\n",
    "plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei', 'PingFang SC', 'DejaVu Sans']\n",
    "\n",
    "print(\"✓ 环境准备完成，支持高清中文图表输出！\")"
   ]
  },
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "## 1. 数据加载与预处理"
   ]
  },
  {
   "cell_type": "code",
   "execution_count": None,
   "metadata": {},
   "outputs": [],
   "source": [
    "# 自动查找 CSV 文件路径\n",
    "possible_paths = [\n",
    "    os.path.abspath(os.path.join(os.getcwd(), \"../../client/Logs/pulse_records.csv\")),\n",
    "    os.path.abspath(os.path.join(os.getcwd(), \"client/Logs/pulse_records.csv\")),\n",
    "    os.path.abspath(os.path.join(os.getcwd(), \"legacy/v1/client/Logs/pulse_records.csv\")),\n",
    "    os.path.abspath(os.path.join(os.getcwd(), \"Logs/pulse_records.csv\")),\n",
    "    os.path.abspath(\"pulse_records.csv\")\n",
    "]\n",
    "\n",
    "csv_path = None\n",
    "for p in possible_paths:\n",
    "    if os.path.exists(p):\n",
    "        csv_path = p\n",
    "        break\n",
    "\n",
    "if not csv_path:\n",
    "    raise FileNotFoundError(f\"未找到 pulse_records.csv，请检查路径。已尝试: {possible_paths}\")\n",
    "\n",
    "print(f\"正在加载数据: {csv_path}\")\n",
    "df = pd.read_csv(csv_path)\n",
    "\n",
    "# 标准化布尔列与数值列\n",
    "if df['is_valid'].dtype == object:\n",
    "    df['is_valid'] = df['is_valid'].astype(str).str.upper() == 'TRUE'\n",
    "\n",
    "# 清洗药品名称\n",
    "df['medicine_clean'] = df['medicine_name'].apply(lambda x: str(x).strip().rstrip('。.,'))\n",
    "\n",
    "print(f\"共加载 {len(df)} 条脉冲记录，涉及 {df['medicine_clean'].nunique()} 种药片。\")\n",
    "df.head(10)"
   ]
  },
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "## 2. 药片分类统计分析表"
   ]
  },
  {
   "cell_type": "code",
   "execution_count": None,
   "metadata": {},
   "outputs": [],
   "source": [
    "# 过滤有效脉冲进行统计\n",
    "valid_df = df[df['is_valid'] & (df['pill_seq'] > 0)].copy()\n",
    "\n",
    "summary_stats = valid_df.groupby('medicine_clean').agg(\n",
    "    样本总数=('pill_seq', 'count'),\n",
    "    脉宽均值=('pulse_width', 'mean'),\n",
    "    脉宽标准差=('pulse_width', 'std'),\n",
    "    脉宽中位数=('pulse_width', 'median'),\n",
    "    最小脉宽=('pulse_width', 'min'),\n",
    "    最大脉宽=('pulse_width', 'max'),\n",
    "    平均下落间隔_ms=('pulse_interval_ms', 'mean'),\n",
    "    最终使用舵机角度=('used_servo_angle', 'last'),\n",
    "    分药结果=('dispense_result', 'last')\n",
    ").reset_index().sort_values(by='脉宽均值')\n",
    "\n",
    "# 格式化小数位数\n",
    "summary_stats['脉宽均值'] = summary_stats['脉宽均值'].round(2)\n",
    "summary_stats['脉宽标准差'] = summary_stats['脉宽标准差'].round(2)\n",
    "summary_stats['平均下落间隔_ms'] = summary_stats['平均下落间隔_ms'].round(1)\n",
    "\n",
    "summary_stats"
   ]
  },
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "## 3. 药片脉冲宽度分布分析（区分度与特征提取）\n",
    "\n",
    "通过箱线图与核密度估计曲线（KDE），观察不同形状、体积的药片在穿过光耦时的特征区分度。"
   ]
  },
  {
   "cell_type": "code",
   "execution_count": None,
   "metadata": {},
   "outputs": [],
   "source": [
    "plt.figure(figsize=(15, 6))\n",
    "\n",
    "# 1. 箱线图 + 散点分布\n",
    "plt.subplot(1, 2, 1)\n",
    "order = summary_stats['medicine_clean'].tolist()\n",
    "sns.boxplot(data=valid_df, x='medicine_clean', y='pulse_width', order=order, palette=\"Set2\", showmeans=True,\n",
    "            meanprops={\"marker\":\"o\", \"markerfacecolor\":\"red\", \"markeredgecolor\":\"red\", \"markersize\":\"6\"})\n",
    "sns.stripplot(data=valid_df, x='medicine_clean', y='pulse_width', order=order, color='black', alpha=0.3, jitter=0.2, size=5)\n",
    "plt.xticks(rotation=35, ha='right', fontsize=9)\n",
    "plt.ylabel('光耦脉冲宽度 (Pulse Width)', fontsize=11)\n",
    "plt.title('图 1A: 各药片脉冲宽度箱线分布 (红点为均值)', fontsize=13, fontweight='bold')\n",
    "\n",
    "# 2. 核密度估计曲线 (KDE Distribution)\n",
    "plt.subplot(1, 2, 2)\n",
    "for med in order:\n",
    "    subset = valid_df[valid_df['medicine_clean'] == med]['pulse_width']\n",
    "    if len(subset) > 1:\n",
    "        sns.kdeplot(subset, label=med, fill=True, alpha=0.2, linewidth=2)\n",
    "plt.xlabel('光耦脉冲宽度 (Pulse Width)', fontsize=11)\n",
    "plt.ylabel('概率密度 (Density)', fontsize=11)\n",
    "plt.title('图 1B: 各药片脉冲宽度概率密度分布 (KDE)', fontsize=13, fontweight='bold')\n",
    "plt.legend(loc='upper right', fontsize=8, framealpha=0.9)\n",
    "\n",
    "plt.tight_layout()\n",
    "plt.show()"
   ]
  },
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "## 4. 出药节奏与时序稳定性分析 (Dispensing Rhythm & Interval)\n",
    "\n",
    "分析药片掉落的时间均匀性与卡药/连落风险。"
   ]
  },
  {
   "cell_type": "code",
   "execution_count": None,
   "metadata": {},
   "outputs": [],
   "source": [
    "plt.figure(figsize=(15, 6))\n",
    "\n",
    "# 图 2A: 累积出药时序曲线\n",
    "plt.subplot(1, 2, 1)\n",
    "for med in valid_df['medicine_clean'].unique():\n",
    "    med_data = valid_df[valid_df['medicine_clean'] == med].sort_values('pill_seq')\n",
    "    plt.plot(med_data['time_offset_ms'] / 1000.0, med_data['pill_seq'], marker='o', markersize=4, label=med, alpha=0.8)\n",
    "\n",
    "plt.xlabel('分药耗时 (秒)', fontsize=11)\n",
    "plt.ylabel('已分药片数量 (颗)', fontsize=11)\n",
    "plt.title('图 2A: 各药片累积出药时序曲线 (斜率代表出药速率)', fontsize=13, fontweight='bold')\n",
    "plt.legend(loc='lower right', fontsize=8)\n",
    "plt.grid(True, linestyle='--', alpha=0.5)\n",
    "\n",
    "# 图 2B: 药片下落间隔小提琴分布 (去除首颗起始等待)\n",
    "plt.subplot(1, 2, 2)\n",
    "interval_df = valid_df[valid_df['pill_seq'] > 1].copy()\n",
    "sns.violinplot(data=interval_df, x='medicine_clean', y='pulse_interval_ms', order=order, palette=\"Pastel1\", cut=0)\n",
    "plt.xticks(rotation=35, ha='right', fontsize=9)\n",
    "plt.ylabel('两颗药下落间隔 (毫秒)', fontsize=11)\n",
    "plt.title('图 2B: 药片下落时间间隔分布 (小提琴图)', fontsize=13, fontweight='bold')\n",
    "\n",
    "plt.tight_layout()\n",
    "plt.show()"
   ]
  },
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "## 5. 舵机开度与脉冲宽度关联性 & 最佳拟合校准曲线\n",
    "\n",
    "根据测试中手动调校的最佳舵机角度，与测量得到的脉冲宽度进行回归拟合，得到最佳的 $K_{\\text{servo}}$ 转换公式。"
   ]
  },
  {
   "cell_type": "code",
   "execution_count": None,
   "metadata": {},
   "outputs": [],
   "source": [
    "# 提取每种药品的平均脉宽与最终稳定使用的舵机开度\n",
    "calib_data = summary_stats.copy()\n",
    "x_pulse = calib_data['脉宽均值'].values\n",
    "y_servo = calib_data['最终使用舵机角度'].values\n",
    "\n",
    "# 线性回归拟合: y = 1.0 - K * x (强制截距为 1.0 或自由拟合)\n",
    "slope, intercept, r_value, p_value, std_err = stats.linregress(x_pulse, y_servo)\n",
    "\n",
    "# 固定截距为 1.0 时的最佳 K_servo\n",
    "k_servo_fitted = np.sum((1.0 - y_servo) * x_pulse) / np.sum(x_pulse ** 2)\n",
    "\n",
    "plt.figure(figsize=(10, 6))\n",
    "plt.scatter(x_pulse, y_servo, color='royalblue', s=120, zorder=5, label='实测最佳参数点')\n",
    "\n",
    "# 标注药品名\n",
    "for idx, row in calib_data.iterrows():\n",
    "    plt.annotate(f\"{row['medicine_clean']}\\n(W={row['脉宽均值']}, Angle={row['最终使用舵机角度']})\",\n",
    "                 (row['脉宽均值'], row['最终使用舵机角度']),\n",
    "                 textcoords=\"offset points\", xytext=(8, -8), fontsize=9,\n",
    "                 bbox=dict(boxstyle=\"round,pad=0.3\", fc=\"yellow\", alpha=0.2))\n",
    "\n",
    "# 绘制当前系统默认拟合线 (K_servo = 0.020)\n",
    "x_range = np.linspace(0, 35, 100)\n",
    "y_default = np.clip(1.0 - 0.020 * x_range, 0.1, 1.0)\n",
    "plt.plot(x_range, y_default, 'r--', label='系统当前公式: Angle = Clamp(1.0 - 0.020 × W, 0.1, 1.0)', linewidth=2)\n",
    "\n",
    "# 绘制数据拟合最优校准线\n",
    "y_fitted = np.clip(1.0 - k_servo_fitted * x_range, 0.1, 1.0)\n",
    "plt.plot(x_range, y_fitted, 'g-', label=f'数据拟合最优公式: Angle = Clamp(1.0 - {k_servo_fitted:.4f} × W, 0.1, 1.0) (R²={r_value**2:.3f})', linewidth=2.5)\n",
    "\n",
    "plt.xlabel('药片脉冲宽度 (Pulse Width)', fontsize=12)\n",
    "plt.ylabel('舵机开度角度 (Servo Angle)', fontsize=12)\n",
    "plt.title('图 3: 药片脉冲宽度 vs 最佳舵机开度拟合曲线', fontsize=14, fontweight='bold')\n",
    "plt.ylim(0, 1.1)\n",
    "plt.xlim(0, 35)\n",
    "plt.legend(fontsize=10, loc='upper right')\n",
    "plt.grid(True, linestyle='--', alpha=0.6)\n",
    "plt.show()\n",
    "\n",
    "print(f\"=== 校准模型评估报告 ===\")\n",
    "print(f\"系统当前 K_servo: 0.0200\")\n",
    "print(f\"数据拟合最佳 K_servo: {k_servo_fitted:.4f}\")\n",
    "print(f\"线性相关系数 R²: {r_value**2:.4f}\")"
   ]
  },
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "## 6. 参数校准建议对照表"
   ]
  },
  {
   "cell_type": "code",
   "execution_count": None,
   "metadata": {},
   "outputs": [],
   "source": [
    "# 生成自动建议表\n",
    "calib_table = summary_stats[['medicine_clean', '脉宽均值', '最终使用舵机角度']].copy()\n",
    "def calc_opt_servo(w):\n",
    "    if w <= 13.0:\n",
    "        return np.clip(0.95 - (w - 5.0) * 0.020, 0.08, 0.98)\n",
    "    else:\n",
    "        return np.clip(0.79 - (w - 13.0) * 0.055, 0.08, 0.98)\n",
    "calib_table['优化推荐舵机角度'] = calib_table['脉宽均值'].apply(calc_opt_servo).round(2)\n",
    "calib_table['优化推荐转盘速度'] = np.clip(0.15 + (calib_table['脉宽均值'] - 5.0) * 0.010, 0.15, 0.36).round(2)\n",
    "calib_table.columns = ['药片名称', '平均脉冲宽度', '人工测试使用角度', '优化推荐舵机角度', '优化推荐转盘速度']\n",
    "calib_table"
   ]
  }
 ],
 "metadata": {
  "language_info": {
   "name": "python"
  }
 },
 "nbformat": 4,
 "nbformat_minor": 2
}

output_path = os.path.join(os.path.dirname(__file__), "pulse_analysis.ipynb")
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(notebook_content, f, ensure_ascii=False, indent=1)

print(f"Successfully generated notebook at: {output_path}")
