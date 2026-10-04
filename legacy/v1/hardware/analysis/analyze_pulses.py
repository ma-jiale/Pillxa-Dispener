import os
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from scipy import stats

# 1. 绘图配置与中文字体支持
plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'PingFang SC', 'DejaVu Sans', 'Arial Unicode MS']
plt.rcParams['axes.unicode_minus'] = False
sns.set_theme(style="whitegrid", font='SimHei')
plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'PingFang SC', 'DejaVu Sans']

# 创建图片保存目录
plots_dir = os.path.join(os.path.dirname(__file__), "plots")
os.makedirs(plots_dir, exist_ok=True)

# 2. 读取 CSV 数据
possible_paths = [
    os.path.abspath(os.path.join(os.path.dirname(__file__), "../../client/Logs/pulse_records.csv")),
    os.path.abspath(os.path.join(os.getcwd(), "Logs/pulse_records.csv")),
    os.path.abspath(os.path.join(os.getcwd(), "legacy/v1/client/Logs/pulse_records.csv")),
    os.path.abspath("pulse_records.csv"),
]
csv_path = None
for p in possible_paths:
    if os.path.exists(p):
        csv_path = p
        break

if not csv_path:
    raise FileNotFoundError(f"未找到数据文件，已尝试: {possible_paths}")

print(f"==================================================")
print(f"正在读取分药机脉冲数据: {csv_path}")
print(f"==================================================")

df = pd.read_csv(csv_path)
if df['is_valid'].dtype == object:
    df['is_valid'] = df['is_valid'].astype(str).str.upper() == 'TRUE'

df['medicine_clean'] = df['medicine_name'].apply(lambda x: str(x).strip().rstrip('。.,'))

# 3. 统计分析
valid_df = df[df['is_valid'] & (df['pill_seq'] > 0)].copy()

summary = valid_df.groupby('medicine_clean').agg(
    样本数=('pill_seq', 'count'),
    脉宽均值=('pulse_width', 'mean'),
    脉宽标准差=('pulse_width', 'std'),
    脉宽中位数=('pulse_width', 'median'),
    最小脉宽=('pulse_width', 'min'),
    最大脉宽=('pulse_width', 'max'),
    平均下落间隔_ms=('pulse_interval_ms', 'mean'),
    最终使用舵机角度=('used_servo_angle', 'last'),
    分药结果=('dispense_result', 'last')
).reset_index().sort_values(by='脉宽均值')

summary['脉宽均值'] = summary['脉宽均值'].round(2)
summary['脉宽标准差'] = summary['脉宽标准差'].round(2)
summary['平均下落间隔_ms'] = summary['平均下落间隔_ms'].round(1)

print("\n【药片分类特征统计表】:")
print(summary.to_string(index=False))

# 4. 图表 1: 脉冲宽度分布箱线图与核密度估计
fig, axes = plt.subplots(1, 2, figsize=(16, 6))
order = summary['medicine_clean'].tolist()

# 1A: 箱线图
sns.boxplot(data=valid_df, x='medicine_clean', y='pulse_width', order=order, palette="Set2", showmeans=True,
            meanprops={"marker":"o", "markerfacecolor":"red", "markeredgecolor":"red", "markersize":"6"}, ax=axes[0])
sns.stripplot(data=valid_df, x='medicine_clean', y='pulse_width', order=order, color='black', alpha=0.3, jitter=0.2, size=5, ax=axes[0])
axes[0].set_xticklabels(axes[0].get_xticklabels(), rotation=35, ha='right', fontsize=9)
axes[0].set_ylabel('光耦脉冲宽度 (Pulse Width)', fontsize=11)
axes[0].set_title('各药片脉冲宽度箱线分布 (红点为均值)', fontsize=13, fontweight='bold')

# 1B: KDE 核密度分布
for med in order:
    subset = valid_df[valid_df['medicine_clean'] == med]['pulse_width']
    if len(subset) > 1:
        sns.kdeplot(subset, label=med, fill=True, alpha=0.2, linewidth=2, ax=axes[1])
axes[1].set_xlabel('光耦脉冲宽度 (Pulse Width)', fontsize=11)
axes[1].set_ylabel('概率密度 (Density)', fontsize=11)
axes[1].set_title('各药片脉冲宽度概率密度分布 (KDE)', fontsize=13, fontweight='bold')
axes[1].legend(loc='upper right', fontsize=8, framealpha=0.9)

plt.tight_layout()
p1_path = os.path.join(plots_dir, "1_pulse_width_distribution.png")
plt.savefig(p1_path, dpi=300)
plt.close()
print(f"\n[✓] 已生成图表 1: {p1_path}")

# 5. 图表 2: 出药时序与下落间隔
fig, axes = plt.subplots(1, 2, figsize=(16, 6))

for med in valid_df['medicine_clean'].unique():
    med_data = valid_df[valid_df['medicine_clean'] == med].sort_values('pill_seq')
    axes[0].plot(med_data['time_offset_ms'] / 1000.0, med_data['pill_seq'], marker='o', markersize=4, label=med, alpha=0.8)

axes[0].set_xlabel('分药耗时 (秒)', fontsize=11)
axes[0].set_ylabel('已分药片数量 (颗)', fontsize=11)
axes[0].set_title('各药片累积出药时序曲线 (斜率代表出药速率)', fontsize=13, fontweight='bold')
axes[0].legend(loc='lower right', fontsize=8)
axes[0].grid(True, linestyle='--', alpha=0.5)

interval_df = valid_df[valid_df['pill_seq'] > 1].copy()
sns.violinplot(data=interval_df, x='medicine_clean', y='pulse_interval_ms', order=order, palette="Pastel1", cut=0, ax=axes[1])
axes[1].set_xticklabels(axes[1].get_xticklabels(), rotation=35, ha='right', fontsize=9)
axes[1].set_ylabel('两颗药下落间隔 (毫秒)', fontsize=11)
axes[1].set_title('药片下落时间间隔分布 (小提琴图)', fontsize=13, fontweight='bold')

plt.tight_layout()
p2_path = os.path.join(plots_dir, "2_dispensing_rhythm.png")
plt.savefig(p2_path, dpi=300)
plt.close()
print(f"[✓] 已生成图表 2: {p2_path}")

# 6. 图表 3: 脉宽与舵机角度拟合曲线
calib_data = summary.copy()
x_pulse = calib_data['脉宽均值'].values
y_servo = calib_data['最终使用舵机角度'].values

slope, intercept, r_value, p_value, std_err = stats.linregress(x_pulse, y_servo)
k_servo_fitted = np.sum((1.0 - y_servo) * x_pulse) / np.sum(x_pulse ** 2)

plt.figure(figsize=(10, 6))
plt.scatter(x_pulse, y_servo, color='royalblue', s=120, zorder=5, label='实测最佳参数点')

for idx, row in calib_data.iterrows():
    plt.annotate(f"{row['medicine_clean']}\n(W={row['脉宽均值']}, Angle={row['最终使用舵机角度']})",
                 (row['脉宽均值'], row['最终使用舵机角度']),
                 textcoords="offset points", xytext=(8, -8), fontsize=9,
                 bbox=dict(boxstyle="round,pad=0.3", fc="yellow", alpha=0.2))

x_range = np.linspace(0, 35, 100)
y_default = np.clip(1.0 - 0.020 * x_range, 0.1, 1.0)
plt.plot(x_range, y_default, 'r--', label='系统当前公式: Angle = Clamp(1.0 - 0.020 × W, 0.1, 1.0)', linewidth=2)

y_fitted = np.clip(1.0 - k_servo_fitted * x_range, 0.1, 1.0)
plt.plot(x_range, y_fitted, 'g-', label=f'数据拟合最优公式: Angle = Clamp(1.0 - {k_servo_fitted:.4f} × W, 0.1, 1.0) (R²={r_value**2:.3f})', linewidth=2.5)

plt.xlabel('药片脉冲宽度 (Pulse Width)', fontsize=12)
plt.ylabel('舵机开度角度 (Servo Angle)', fontsize=12)
plt.title('药片脉冲宽度 vs 最佳舵机开度拟合曲线', fontsize=14, fontweight='bold')
plt.ylim(0, 1.1)
plt.xlim(0, 35)
plt.legend(fontsize=10, loc='upper right')
plt.grid(True, linestyle='--', alpha=0.6)

plt.tight_layout()
p3_path = os.path.join(plots_dir, "3_servo_calibration_curve.png")
plt.savefig(p3_path, dpi=300)
plt.close()
print(f"[✓] 已生成图表 3: {p3_path}")

print(f"\n==================================================")
print(f"=== 参数校准评估结果 ===")
print(f"系统当前预设 K_servo: 0.0200")
print(f"实测数据最佳拟合 K_servo: {k_servo_fitted:.4f}")
print(f"拟合相关度 R²: {r_value**2:.4f}")
print(f"==================================================")
