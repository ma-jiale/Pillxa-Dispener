import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowUp,
  ArrowDown,
  Download,
  RefreshCw,
  Search,
  X,
  Settings2,
  Pill,
  LayoutGrid,
  Monitor,
  Check,
} from "lucide-react";
import { useApp } from "../context.tsx";
import {
  api,
  credentials,
  configureRuntime,
  local,
  desktop,
} from "../platform.ts";
import { Badge } from "../components.tsx";
import { slotLabels } from "../../../../packages/contracts/src/model.ts";
import type {
  Institution,
  Settings as InstitutionSettings,
  Slot,
} from "../../../../packages/contracts/src/model.ts";

const categories = [
  {
    id: "general",
    name: "常规",
    group: "机构设置",
    icon: Settings2,
    description: "查看当前机构与账号，设置机构使用的时区。",
    keywords: "当前养老院 当前账号 机构时区 姓名 权限 时间",
  },
  {
    id: "dispensing",
    name: "摆药规则",
    group: "机构设置",
    icon: Pill,
    description: "设置一次摆药的覆盖安排，日常工作自动沿用这些规则。",
    keywords:
      "每次覆盖天数 漏摆后开始日期 提前提醒天数 默认按餐食要求分盘 当天 次日 饭前 饭后",
  },
  {
    id: "layout",
    name: "药盒布局",
    group: "机构设置",
    icon: LayoutGrid,
    description: "按药盒的实际位置排列服药时段。",
    keywords: "启用睡前时段 药盒从上到下的顺序 早晨 中午 晚上 第四格 上移 下移",
  },
  {
    id: "device",
    name: "设备连接",
    group: "本机设置",
    icon: Monitor,
    description: "管理这台电脑连接的摆药机。",
    keywords:
      "设备名称 运行模式 摆药机串口 通信设置 当前连接 STM32 115200 模拟 真实",
  },
  {
    id: "updates",
    name: "软件更新",
    group: "本机设置",
    icon: Download,
    description: "查看当前版本，从服务器检查最新发布版本。",
    keywords: "版本 下载 安装 更新 Windows",
  },
] as const;
type CategoryId = (typeof categories)[number]["id"];
function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div className="setting-copy">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}
function SettingGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="setting-group">
      <h2>{title}</h2>
      <div className="setting-card">{children}</div>
    </section>
  );
}
function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <label className="settings-switch">
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span aria-hidden="true" />
    </label>
  );
}
export function Settings({
  initialCategory = "general",
  onDirtyChange,
}: {
  initialCategory?: CategoryId;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const app = useApp();
  const { workspace, runtime, notify, user } = app;
  const [selected, setSelected] = useState<CategoryId>(initialCategory);
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(workspace.institution.settings);
  const [value, setValue] = useState(workspace.institution.settings);
  const [device, setDevice] = useState(credentials.device);
  const [ports, setPorts] = useState<{ name: string }[]>([]);
  const [port, setPort] = useState(runtime.port || "");
  const [saving, setSaving] = useState(false);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");
  const canEdit = user.role !== "staff";
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  useEffect(() => {
    setSelected(initialCategory);
  }, [initialCategory]);
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const leave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);
  const matches = categories.filter((c) =>
    `${c.name} ${c.description} ${c.keywords}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const category = matches.find((c) => c.id === selected) ?? matches[0];
  const active = category?.id;
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [active]);
  const change = <K extends keyof InstitutionSettings>(
    key: K,
    next: InstitutionSettings[K],
  ) => setValue((old) => ({ ...old, [key]: next }));
  useEffect(() => {
    const current = workspace.institution.settings;
    if (!dirty && current.version > saved.version) {
      setSaved(current);
      setValue(current);
    }
  }, [workspace.institution.settings, saved.version, dirty]);
  const save = async () => {
    setSaving(true);
    try {
      const institution = await api<Institution>("/settings", value, "PUT");
      setSaved(institution.settings);
      setValue(institution.settings);
      await app.refresh();
      notify("机构设置已保存，已开始的任务继续使用原计划");
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const move = (index: number, delta: number) => {
    const rows = [...value.rows];
    [rows[index], rows[index + delta]] = [rows[index + delta], rows[index]];
    change("rows", rows);
  };
  const deviceAction = async (action: () => Promise<unknown>) => {
    setDeviceBusy(true);
    try {
      await action();
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setDeviceBusy(false);
    }
  };
  const saveDevice = () =>
    deviceAction(async () => {
      const previous = credentials.device;
      try {
        credentials.device = device;
        await configureRuntime();
        notify("本机设备名称已保存");
      } catch (error) {
        credentials.device = previous;
        throw error;
      }
    });
  const checkUpdates = async () => {
    setUpdating(true);
    setUpdateMessage("正在检查最新版本…");
    try {
      const result = await api("/releases/latest");
      if (!result.available) {
        setUpdateMessage(result.message);
        return;
      }
      if (!desktop) {
        setUpdateMessage("请在 Windows 客户端安装更新");
        return;
      }
      await local("updateAllowed");
      const update = await import("@tauri-apps/plugin-updater").then((m) =>
        m.check({ headers: { Authorization: `Bearer ${credentials.token}` } }),
      );
      if (update) {
        setUpdateMessage("正在下载并安装更新…");
        await update.downloadAndInstall();
        setUpdateMessage("更新已安装，请重新启动");
      } else setUpdateMessage("当前已是最新版本");
    } catch (error) {
      setUpdateMessage((error as Error).message);
    } finally {
      setUpdating(false);
    }
  };
  return (
    <div className="settings-shell">
      <aside className="settings-sidebar">
        <h1>设置</h1>
        <div className="settings-search">
          <Search size={17} />
          <input
            type="search"
            aria-label="搜索设置"
            placeholder="搜索设置"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              className="icon"
              aria-label="清空搜索"
              onClick={() => setQuery("")}
            >
              <X size={15} />
            </button>
          )}
        </div>
        <nav aria-label="设置分类">
          {["机构设置", "本机设置"].map((group) => (
            <div className="settings-nav-group" key={group}>
              {matches.some((c) => c.group === group) && <h2>{group}</h2>}
              {matches
                .filter((c) => c.group === group)
                .map((c) => (
                  <button
                    key={c.id}
                    className={active === c.id ? "active" : ""}
                    aria-current={active === c.id ? "page" : undefined}
                    onClick={() => setSelected(c.id)}
                  >
                    <c.icon size={18} />
                    {c.name}
                  </button>
                ))}
            </div>
          ))}
        </nav>
      </aside>
      <section className="settings-main" aria-label="设置内容">
        <div className="settings-detail">
          {category ? (
            <>
              <header className="settings-heading">
                <div>
                  <h1>{category.name}</h1>
                  <p>{category.description}</p>
                </div>
              </header>
              {active === "general" && (
                <>
                  <SettingGroup title="工作空间">
                    <SettingRow
                      title="当前养老院"
                      description="机构设置由本院共用，适用于本院所有摆药电脑。"
                    >
                      <span className="setting-value">
                        {workspace.institution.name}
                      </span>
                    </SettingRow>
                    <SettingRow
                      title="当前账号"
                      description={
                        user.role === "platform"
                          ? "平台管理员可以切换机构并创建院内管理员。"
                          : user.role === "admin"
                            ? "院内管理员可以维护本院设置与工作人员账号。"
                            : "使用院内管理员为你分配的操作权限。"
                      }
                    >
                      <span className="setting-value">{user.name}</span>
                    </SettingRow>
                  </SettingGroup>
                  <SettingGroup title="日期与时间">
                    <SettingRow
                      title="机构时区"
                      description="计划日期按这个时区计算。中国养老院通常使用 Asia/Shanghai。"
                    >
                      <input
                        aria-label="机构时区"
                        value={value.timezone}
                        disabled={!canEdit || saving}
                        onChange={(e) => change("timezone", e.target.value)}
                      />
                    </SettingRow>
                  </SettingGroup>
                </>
              )}
              {active === "dispensing" && (
                <>
                  <SettingGroup title="覆盖安排">
                    <SettingRow
                      title="每次覆盖天数"
                      description="每次自动准备的天数，最多七天。无需在开始摆药时重新选择。"
                    >
                      <div className="setting-number">
                        <input
                          type="number"
                          aria-label="每次覆盖天数"
                          min="1"
                          max="7"
                          value={value.days}
                          disabled={!canEdit || saving}
                          onChange={(e) =>
                            change("days", Number(e.target.value))
                          }
                        />
                        <span>天</span>
                      </div>
                    </SettingRow>
                    <SettingRow
                      title="漏摆后开始日期"
                      description="超过原覆盖周期后，从当天或次日开始新一轮安排。"
                    >
                      <select
                        aria-label="漏摆后开始日期"
                        value={value.startMode}
                        disabled={!canEdit || saving}
                        onChange={(e) =>
                          change(
                            "startMode",
                            e.target.value as InstitutionSettings["startMode"],
                          )
                        }
                      >
                        <option value="today">从当天开始</option>
                        <option value="tomorrow">从次日开始</option>
                      </select>
                    </SettingRow>
                    <SettingRow
                      title="提前提醒天数"
                      description="在当前覆盖周期结束前，提醒准备下一轮药物。"
                    >
                      <div className="setting-number">
                        <input
                          type="number"
                          aria-label="提前提醒天数"
                          min="0"
                          max="30"
                          value={value.reminderDays}
                          disabled={!canEdit || saving}
                          onChange={(e) =>
                            change("reminderDays", Number(e.target.value))
                          }
                        />
                        <span>天</span>
                      </div>
                    </SettingRow>
                  </SettingGroup>
                  <SettingGroup title="餐食分盘">
                    <SettingRow
                      title="默认按餐食要求分盘"
                      description="开启后，饭前药单独成盘；关闭后不按餐食要求分盘。本次计划中仍可切换。"
                    >
                      <Toggle
                        label="默认按餐食要求分盘"
                        checked={value.mealSplit}
                        disabled={!canEdit || saving}
                        onChange={(next) => change("mealSplit", next)}
                      />
                    </SettingRow>
                  </SettingGroup>
                </>
              )}
              {active === "layout" && (
                <>
                  <SettingGroup title="服药时段">
                    <SettingRow
                      title="启用睡前时段"
                      description="增加一个睡前时段，可与早、中、晚一起调整位置。"
                    >
                      <Toggle
                        label="启用睡前时段"
                        checked={value.rows.includes("bedtime")}
                        disabled={!canEdit || saving}
                        onChange={(next) =>
                          change(
                            "rows",
                            next
                              ? [...value.rows, "bedtime" as Slot]
                              : value.rows.filter((slot) => slot !== "bedtime"),
                          )
                        }
                      />
                    </SettingRow>
                  </SettingGroup>
                  <SettingGroup title="药盒从上到下的顺序">
                    {value.rows.map((slot, index) => (
                      <SettingRow
                        key={slot}
                        title={`第 ${index + 1} 格`}
                        description={
                          index === 0
                            ? "药盒最上方的位置"
                            : index === value.rows.length - 1
                              ? "药盒最下方的位置"
                              : undefined
                        }
                      >
                        <div className="setting-row-order">
                          <strong>{slotLabels[slot]}</strong>
                          <button
                            className="icon"
                            aria-label={`${slotLabels[slot]}上移`}
                            disabled={!canEdit || saving || index === 0}
                            onClick={() => move(index, -1)}
                          >
                            <ArrowUp size={17} />
                          </button>
                          <button
                            className="icon"
                            aria-label={`${slotLabels[slot]}下移`}
                            disabled={
                              !canEdit ||
                              saving ||
                              index === value.rows.length - 1
                            }
                            onClick={() => move(index, 1)}
                          >
                            <ArrowDown size={17} />
                          </button>
                        </div>
                      </SettingRow>
                    ))}
                  </SettingGroup>
                </>
              )}
              {active === "device" && (
                <>
                  <SettingGroup title="本机摆药机">
                    <SettingRow
                      title="设备名称"
                      description="用于区分本院不同摆药机，每台电脑使用不同名称。"
                    >
                      <div className="setting-inline">
                        <input
                          aria-label="设备名称"
                          value={device}
                          disabled={deviceBusy}
                          onChange={(e) => setDevice(e.target.value)}
                        />
                        <button
                          disabled={
                            deviceBusy ||
                            device === credentials.device ||
                            !device.trim()
                          }
                          onClick={saveDevice}
                        >
                          保存
                        </button>
                      </div>
                    </SettingRow>
                    <SettingRow
                      title="运行模式"
                      description={
                        runtime.mode === "serial"
                          ? "当前使用真实机器。请按当前药物提示投料。"
                          : "用于演练操作流程，模拟结果不会推进真实摆药的覆盖日期。"
                      }
                    >
                      <div className="setting-inline">
                        <Badge
                          tone={runtime.mode === "serial" ? "blue" : "amber"}
                        >
                          {runtime.mode === "serial" ? "真实机器" : "演练模式"}
                        </Badge>
                        {runtime.mode !== "simulator" && (
                          <button
                            disabled={deviceBusy}
                            onClick={() =>
                              deviceAction(() =>
                                app.action("mode", { mode: "simulator" }),
                              )
                            }
                          >
                            切换到演练
                          </button>
                        )}
                      </div>
                    </SettingRow>
                  </SettingGroup>
                  <SettingGroup title="串口连接">
                    <SettingRow
                      title="摆药机串口"
                      description="先扫描可用串口，再选择实际连接的摆药机。"
                    >
                      <div className="setting-inline">
                        <select
                          aria-label="串口"
                          value={port}
                          disabled={deviceBusy}
                          onChange={(e) => setPort(e.target.value)}
                        >
                          <option value="">选择串口</option>
                          {runtime.port &&
                            !ports.some((p) => p.name === runtime.port) && (
                              <option value={runtime.port}>
                                {runtime.port}
                              </option>
                            )}
                          {ports.map((p) => (
                            <option key={p.name} value={p.name}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <button
                          className="icon"
                          aria-label="扫描串口"
                          disabled={deviceBusy}
                          onClick={() =>
                            deviceAction(async () => {
                              const result = await local<{
                                ports: { name: string }[];
                              }>("ports");
                              setPorts(result.ports);
                            })
                          }
                        >
                          <RefreshCw size={17} />
                        </button>
                        <button
                          disabled={deviceBusy || !port}
                          onClick={() =>
                            deviceAction(() => app.action("connect", { port }))
                          }
                        >
                          连接
                        </button>
                      </div>
                    </SettingRow>
                    <SettingRow
                      title="当前连接"
                      description="端口打开后，还需通过设备反馈和现场动作确认机器正常。"
                    >
                      <span className="setting-value">
                        {runtime.port
                          ? `端口已打开 · ${runtime.port}`
                          : "尚未连接真实机器"}
                      </span>
                    </SettingRow>
                  </SettingGroup>
                  <details className="detail-disclosure">
                    <summary>连接详情</summary>
                    <p className="hint">
                      STM32 · 115200 · 8N1 · 无流控。使用 HC-06 时，先在 Windows
                      完成配对，再选择对应的出站串口。
                    </p>
                  </details>
                </>
              )}
              {active === "updates" && (
                <SettingGroup title="版本与更新">
                  <SettingRow title="当前版本" description="Pillxai Dispenser">
                    <span className="setting-value">0.2.0</span>
                  </SettingRow>
                  <SettingRow
                    title="检查软件更新"
                    description="从服务器获取最新发布版本，更新时需要结束当前任务并同步记录。"
                  >
                    <button disabled={updating} onClick={checkUpdates}>
                      <Download size={17} />
                      {updating ? "正在检查…" : "检查并下载更新"}
                    </button>
                  </SettingRow>
                  {updateMessage && (
                    <p className="settings-update-message" role="status">
                      {updateMessage}
                    </p>
                  )}
                </SettingGroup>
              )}
              {(["general", "dispensing", "layout"].includes(active!) ||
                dirty) && (
                <footer className="settings-savebar">
                  <span>
                    {!canEdit ? (
                      "机构设置由管理员维护"
                    ) : dirty ? (
                      "有未保存的更改"
                    ) : (
                      <>
                        <Check size={15} />
                        机构设置已保存
                      </>
                    )}
                  </span>
                  {canEdit && (
                    <div className="actions">
                      {dirty && (
                        <button
                          disabled={saving}
                          onClick={() => setValue(saved)}
                        >
                          撤销更改
                        </button>
                      )}
                      <button
                        className="primary"
                        disabled={saving || !dirty}
                        onClick={save}
                      >
                        {saving ? "保存中…" : "保存更改"}
                      </button>
                    </div>
                  )}
                </footer>
              )}
            </>
          ) : (
            <div className="settings-no-results">
              <Search size={27} />
              <h1>没有找到相关设置</h1>
              <p>试试“覆盖天数”“睡前”或“串口”。</p>
              <button onClick={() => setQuery("")}>清空搜索</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
