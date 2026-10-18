import { useState, useEffect } from "react";
import {
  Play,
  Pause,
  ArrowRight,
  RotateCcw,
  Monitor,
  CheckCircle2,
  Pill,
} from "lucide-react";
import { api, credentials, configureRuntime, local } from "./platform.ts";
import { useApp } from "./context.tsx";
import { Badge, Empty, Filter, Modal, Field, Failure } from "./components.tsx";
import { PlanGrid } from "./PlanGrid.tsx";
import { Identification } from "./Identification.tsx";
import { GateControl } from "./GateControl.tsx";
import { InterruptedTask } from "./InterruptedTask.tsx";
import type { Plan } from "../../../packages/contracts/src/model.ts";
import { executionView, dateRange } from "./presentation.ts";
import { usePlanningQueue } from "./usePlanningQueue.ts";
const phaseLabels: Record<string, string> = {
  ready: "待识别药盒",
  running: "摆药中",
  paused: "已暂停",
  next_drug: "准备下一药",
  tray_change: "等待换盘",
  review: "需要核对",
  interrupted: "执行中断",
  resolving: "等待机器退出当前药物",
  discarding: "正在结束并删除",
  take_out: "等待取盒",
  ended: "本次已结束",
};
export function Execute() {
  const app = useApp();
  const { workspace, runtime, notify, action } = app;
  const [query, setQuery] = useState(""),
    [plan, setPlan] = useState<Plan | null>(),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [resolve, setResolve] = useState(""),
    [reason, setReason] = useState("");
  const s = runtime.state;
  const queue = usePlanningQueue(!s || s.phase === "ended");
  const [scope, setScope] = useState("due");
  const [previewTray, setPreviewTray] = useState(0);
  const preview = async (id: string, split?: boolean) => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await api("/plans/preview", {
        residentId: id,
        mealSplit: split,
      });
      setPlan(result.plan);
      setPreviewTray(result.plan?.trays[0]?.number ?? 0);
      if (!result.plan) notify("当前没有需要摆放的药物");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const run = (method: string, params?: unknown) => {
    setBusy(true);
    action(method, params)
      .catch((e) => notify(e.message))
      .finally(() => setBusy(false));
  };
  const claim = async () => {
    if (!plan) return;
    setBusy(true);
    setError(undefined);
    let task: any;
    try {
      await configureRuntime();
      task = await api("/tasks/claim", {
        residentId: plan.residentId,
        planId: plan.id,
        mealSplit: plan.mealSplit,
        deviceId: credentials.device,
        terminalId: credentials.terminal,
        executionMode: runtime.mode,
      });
      await local("load", { task });
      setPlan(undefined);
      await app.refresh();
      // Keep a loaded task available if opening fails; the operator can retry.
      try {
        await action("prepareBox");
      } catch (openingError) {
        notify((openingError as Error).message);
      }
    } catch (e) {
      if (task)
        await api(`/tasks/${task.id}/cancel`, {
          terminalId: credentials.terminal,
        }).catch(() => {});
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    if (!s) return;
    setBusy(true);
    try {
      await api(`/tasks/${s.taskId}/cancel`, {
        terminalId: credentials.terminal,
      });
      await local("clear");
      await app.refresh();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const start = async () => {
    setBusy(true);
    try {
      if (!s?.hasStarted) await action("authorize");
      await action("start");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (app.selectedResidentId && (!s || s.phase === "ended")) {
      void preview(app.selectedResidentId);
    }
  }, [app.selectedResidentId]);
  const view = s ? executionView(s) : null;
  const current = view?.batch;
  const adjustable = current;
  return (
    <>
      <div className="page-title">
        <div>
          <h1>摆药工作台</h1>
          <p>
            {s && s.phase !== "ended"
              ? "按当前药物提示操作，进度会持续保存。"
              : "选择住民，核对本次用药安排。"}
          </p>
        </div>
        <Badge tone={runtime.mode === "simulator" ? "amber" : "blue"}>
          <Monitor size={14} />
          {runtime.mode === "simulator"
            ? "演练模式"
            : (s ? s.connected : runtime.port)
              ? "本机端口已打开"
              : "本机未连接"}
        </Badge>
      </div>
      {s && s.phase !== "ended" ? (
        <>
          <div className="panel execution-heading">
            <div>
              <h2>
                {s.plan.resident.name}
                <Badge tone="blue">
                  {s.phase === "ready"
                    ? s.identifiedResidentId
                      ? "药盒已核验"
                      : s.boxPrepared
                        ? "等待放盒"
                        : "准备放盒"
                    : phaseLabels[s.phase]}
                </Badge>
              </h2>
              <p>
                {s.plan.resident.bed} ·{" "}
                {dateRange(s.plan.startDate, s.plan.endDate)} · {s.deviceId}
              </p>
            </div>
            <div className="sync-status">
              {s.pendingSync ? `${s.pendingSync} 条记录待同步` : "记录已同步"}
            </div>
          </div>
          {(["interrupted", "review", "discarding"].includes(s.phase) ||
            (s.hasStarted &&
              !s.connected &&
              ["next_drug", "tray_change", "take_out"].includes(s.phase))) && (
            <InterruptedTask key={s.taskId} />
          )}
          {(s.phase === "ready" || s.phase === "tray_change") && (
            <div className="panel">
              <Identification />
            </div>
          )}
          <div className="panel execution-card">
            {view?.preparing && (
              <div className="previous-batch-summary">
                上一药：{s.plan.batches[s.batchIndex]?.name} ·
                已完成处理。请核对下面的下一药。
              </div>
            )}
            <div className="execution-top">
              <span className="execution-drug-image">
                {current?.image ? (
                  <img src={current.image} alt={current.name} />
                ) : (
                  <Pill size={38} />
                )}
              </span>
              <div>
                <small>
                  {view?.preparing ? "准备下一药 · " : ""}第{" "}
                  {(view?.index ?? 0) + 1} / {s.plan.batches.length} 项药物 ·{" "}
                  {s.plan.trays.find((t) => t.number === current?.tray)?.label}
                </small>
                <h2>{current?.name}</h2>
                <p>
                  {current?.specification} ·{" "}
                  {current?.form === "half"
                    ? "人工预切半片，按颗粒投料"
                    : "整片投料"}
                </p>
              </div>
              <div className="progress-number">
                <strong>{view?.count ?? 0}</strong>
                <span>/ {current?.target} 颗</span>
              </div>
            </div>
            <div className="progress-track">
              <div
                style={{
                  width: `${Math.min(100, ((view?.count ?? 0) / (current?.target || 1)) * 100)}%`,
                }}
              />
            </div>
            <p className="hint">
              {s.phase === "resolving"
                ? "处理请求已保存，正在等待机器停止并退出当前药物。请暂停投料。"
                : s.phase === "running"
                  ? s.count >= (current?.target || 1)
                    ? "已达到计划数量，等待机器完成反馈。"
                    : "请投入上方所示药物，机器正在累计计数。"
                  : s.phase === "tray_change"
                    ? "本盘已结束，请换好下一盘。确认后继续，不需要关仓。"
                    : s.phase === "next_drug"
                      ? "当前药物已完成。取下一种药，准备开始投料。"
                      : s.phase === "take_out"
                        ? "本次药物已处理。请先取出药盒，再点击下方按钮收回轨道。"
                        : s.phase === "paused"
                          ? "当前药物进度已保留，可以接着摆药。"
                          : "请按页面提示完成当前步骤。"}
            </p>
            {s.error && <p className="error">{s.error}</p>}
            <div className="actions execution-actions">
              {s.phase === "resolving" && (
                <button disabled={busy} onClick={() => run("reviewResolution")}>
                  反馈未返回，转入现场核对
                </button>
              )}
              {(s.phase === "ready" || s.phase === "next_drug") && (
                <button
                  className="primary"
                  disabled={busy || !s.identifiedResidentId || !s.connected}
                  onClick={start}
                >
                  <Play size={18} />
                  {s.phase === "ready" ? "开始摆药" : "开始下一药"}
                </button>
              )}
              {s.phase === "running" && (
                <button disabled={busy} onClick={() => run("pause")}>
                  <Pause size={17} />
                  暂停
                </button>
              )}
              {s.phase === "paused" && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => run("resume")}
                >
                  <Play size={18} />
                  继续当前药
                </button>
              )}
              {s.phase === "tray_change" && (
                <button
                  className="primary"
                  disabled={busy || !s.identifiedResidentId || !s.connected}
                  onClick={() => run("tray")}
                >
                  <ArrowRight size={17} />
                  已换好，继续摆药
                </button>
              )}
              {s.phase === "take_out" && (
                <button
                  disabled={busy || !s.connected}
                  onClick={() => run("openForRemoval")}
                >
                  <RotateCcw size={17} />
                  重新开仓
                </button>
              )}
              {s.phase === "take_out" && (
                <button
                  className="primary"
                  disabled={busy || !s.connected}
                  onClick={() => run("takeOut")}
                >
                  <CheckCircle2 size={18} />
                  已取出药盒，收回轨道
                </button>
              )}
              {!s.hasStarted && (
                <button disabled={busy} onClick={cancel}>
                  取消领取
                </button>
              )}
              {["running", "paused", "review", "interrupted"].includes(
                s.phase,
              ) && (
                <button
                  disabled={busy}
                  onClick={() => {
                    setReason("");
                    setResolve("skip");
                  }}
                >
                  跳过当前药物
                </button>
              )}
              {["running", "paused", "review", "interrupted"].includes(
                s.phase,
              ) && (
                <button
                  disabled={busy}
                  onClick={() => {
                    setReason("");
                    setResolve("manual");
                  }}
                >
                  处理异常 / 人工核对
                </button>
              )}
            </div>
            {["ready", "next_drug", "tray_change"].includes(s.phase) &&
              (!s.identifiedResidentId || !s.connected) && (
                <p className="hint">
                  {!s.connected
                    ? "连接摆药机后才能继续。"
                    : "药盒核验通过后才能继续。"}
                </p>
              )}
          </div>
          {adjustable &&
            [
              "ready",
              "running",
              "paused",
              "next_drug",
              "tray_change",
              "review",
              "interrupted",
            ].includes(s.phase) && (
              <GateControl
                key={`${s.taskId}:${adjustable.id}`}
                min={0}
                max={1}
                step={0.01}
                unit="刻度"
                drugName={adjustable.name}
                initialValue={
                  s.gateOverrides?.[adjustable.id] ?? adjustable.parameters.gate
                }
                lastSent={view?.lastGateValue}
                connected={s.connected}
                simulated={runtime.mode === "simulator"}
                apply={async (value) => {
                  await action("setGate", {
                    taskId: s.taskId,
                    batchId: adjustable.id,
                    value,
                  });
                }}
              />
            )}
          <details className="panel execution-plan">
            <summary>查看本盘摆药计划</summary>
            <PlanGrid plan={s.plan} tray={current?.tray} />
          </details>
        </>
      ) : (
        <>
          <div className="panel queue-panel">
            <div className="section-heading">
              <h2>选择住民</h2>
              <Filter value={query} change={setQuery} />
            </div>
            <div className="segmented queue-scope">
              {[
                ["due", "待准备"],
                ["all", "全部住民"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={scope === id ? "selected" : ""}
                  aria-pressed={scope === id}
                  onClick={() => setScope(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {s?.phase === "ended" && (
              <div className="success">
                {s.plan.resident.name} 的本次任务已结束
                {s.pendingSync ? "，联网后同步记录。" : "，结果已留存。"}
              </div>
            )}
            <Failure error={queue.error} />
            {queue.isPending && <Empty>正在整理准备清单…</Empty>}
            <div className="queue-grid">
              {(queue.data?.items || [])
                .filter(
                  (item) =>
                    `${item.resident.name} ${item.resident.bed}`.includes(
                      query,
                    ) &&
                    (scope === "all" || item.due || !!item.occupiedTaskId),
                )
                .map((item) => {
                  const r = item.resident;
                  const occupied = workspace.tasks.find(
                    (t) =>
                      t.residentId === r.id &&
                      !["ended", "cancelled"].includes(t.status),
                  );
                  return (
                    <button
                      className="queue-resident"
                      key={r.id}
                      disabled={
                        busy ||
                        app.serviceOnline === false ||
                        !!occupied ||
                        (!item.startDate && !item.issue)
                      }
                      onClick={() => preview(r.id)}
                    >
                      <span className="avatar">{r.name.slice(-2)}</span>
                      <div>
                        <strong>{r.name}</strong>
                        <small>{r.bed || "未填写床号"}</small>
                        <small>
                          {item.startDate && item.endDate
                            ? dateRange(item.startDate, item.endDate)
                            : item.reason}
                        </small>
                      </div>
                      {occupied ? (
                        <Badge>由 {occupied.deviceId} 处理</Badge>
                      ) : (
                        <span className="queue-reason">
                          <small>{item.reason}</small>
                          <ArrowRight size={18} />
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
            {!queue.isPending &&
              !queue.error &&
              !queue.data?.items.some(
                (item) =>
                  `${item.resident.name} ${item.resident.bed}`.includes(
                    query,
                  ) &&
                  (scope === "all" || item.due || !!item.occupiedTaskId),
              ) && (
                <Empty>
                  {scope === "due"
                    ? "当前没有待准备住民，可切换到全部住民提前准备。"
                    : "没有找到匹配住民。"}
                </Empty>
              )}
            {!workspace.residents.length && (
              <Empty>先添加住民及用药安排，再开始摆药。</Empty>
            )}
            <Failure error={error} />
          </div>
          {workspace.tasks
            .filter(
              (t) =>
                t.terminalId === credentials.terminal &&
                !t.started &&
                t.status === "claimed",
            )
            .map((t) => (
              <div className="panel recovery" key={t.id}>
                <p>本机有已领取但未启动的任务：{t.plan.resident.name}</p>
                <button
                  onClick={() =>
                    configureRuntime()
                      .then(() => local("load", { task: t }))
                      .then(app.refresh)
                      .then(() => action("prepareBox"))
                      .catch((e) => notify(e.message))
                  }
                >
                  <RotateCcw size={16} />
                  载入任务
                </button>
                <button
                  onClick={() =>
                    api(`/tasks/${t.id}/cancel`, {
                      terminalId: credentials.terminal,
                    })
                      .then(app.refresh)
                      .catch((e) => notify(e.message))
                  }
                >
                  取消领取
                </button>
              </div>
            ))}
        </>
      )}
      {plan && (
        <Modal
          title={`${plan.resident.name} · 核对摆药计划`}
          wide
          close={() => setPlan(undefined)}
        >
          <div className="plan-summary">
            <strong>{dateRange(plan.startDate, plan.endDate)}</strong>
            <span>
              {plan.dates.length} 天 · {plan.trays.length} 盘 ·{" "}
              {plan.totalParticles} 颗
            </span>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={plan.mealSplit}
              onChange={(e) => preview(plan.residentId, e.target.checked)}
            />
            按餐食要求分盘（饭前单独一盘）
          </label>
          <div className="plan-preview-layout">
            <section>
              <div className="segmented" aria-label="预览药盘">
                {plan.trays.map((tray) => (
                  <button
                    key={tray.number}
                    aria-pressed={previewTray === tray.number}
                    className={previewTray === tray.number ? "selected" : ""}
                    onClick={() => setPreviewTray(tray.number)}
                  >
                    {tray.label}
                  </button>
                ))}
              </div>
              <PlanGrid plan={plan} tray={previewTray} />
            </section>
            <aside className="plan-preparation">
              <h3>投料准备</h3>
              <p className="muted">请按药物和规格分别核对</p>
              {plan.batches.map((b) => (
                <div key={b.id}>
                  <strong>{b.name}</strong>
                  <small>
                    {b.specification} ·{" "}
                    {b.form === "half" ? "预切半片" : "整片"}
                  </small>
                  <span>
                    {b.target} 颗
                    {b.form === "half" && (
                      <small>相当于 {b.originalTablets} 原片</small>
                    )}
                  </span>
                </div>
              ))}
            </aside>
          </div>
          <p className="hint">
            覆盖日期自动沿用已保存的机构规则；修改规则后需要重新核对计划。
          </p>
          <Failure error={error} />
          <footer>
            <button
              className="primary"
              disabled={busy || app.serviceOnline === false}
              title={
                app.serviceOnline === false
                  ? "资料连接恢复后才能领取新任务"
                  : undefined
              }
              onClick={claim}
            >
              {busy ? "处理中…" : "领取并开仓放盒"}
            </button>
          </footer>
        </Modal>
      )}
      {resolve && (
        <Modal title="处理当前药物" close={() => setResolve("")}>
          <p className="hint">
            先暂停投料并核对现场。人工补齐与机器完成会分别保留。
          </p>
          <Field label="处理结果">
            <select
              value={resolve}
              onChange={(e) => setResolve(e.target.value)}
            >
              <option value="manual">已人工补齐目标量</option>
              <option value="skip">跳过，未完成</option>
              <option value="unknown">无法确定实际结果</option>
            </select>
          </Field>
          <Field label="处理原因">
            <textarea
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <footer>
            <button
              className="primary"
              disabled={!reason.trim() || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await action(resolve, { reason });
                  setResolve("");
                } catch (e) {
                  notify((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {resolve === "skip"
                ? "确认跳过，记为未完成"
                : resolve === "manual"
                  ? "确认已人工补齐"
                  : "确认结果待核实"}
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}
