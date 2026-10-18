import { useState } from "react";
import {
  ArrowRight,
  Monitor,
  CalendarDays,
  Pill,
  RefreshCw,
} from "lucide-react";
import { useApp } from "./context.tsx";
import { Badge, Busy, Empty, Failure, Filter } from "./components.tsx";
import { usePlanningQueue } from "./usePlanningQueue.ts";
import { credentials } from "./platform.ts";
import { dateRange, taskResult } from "./presentation.ts";

export function Overview() {
  const { workspace, runtime, navigate, user } = useApp();
  const queue = usePlanningQueue();
  const [query, setQuery] = useState(""),
    [scope, setScope] = useState("due");
  const active = workspace.tasks.filter(
    (t) => !["ended", "cancelled"].includes(t.status),
  );
  const items = queue.data?.items ?? [];
  const due = items.filter((i) => i.due && !i.occupiedTaskId);
  const attention = items.filter((i) => i.issue);
  const visible = items.filter(
    (i) =>
      `${i.resident.name} ${i.resident.bed}`.includes(query.trim()) &&
      (scope === "all" || (scope === "due" ? i.due : !i.due && !!i.startDate)),
  );
  const current =
    runtime.state && runtime.state.phase !== "ended" ? runtime.state : null;
  return (
    <>
      <div className="page-title">
        <div>
          <p className="page-kicker">
            {new Intl.DateTimeFormat("zh-CN", {
              timeZone: workspace.institution.settings.timezone,
              month: "long",
              day: "numeric",
              weekday: "long",
            }).format(new Date())}
          </p>
          <h1>今日工作</h1>
          <p>{user.name}，从这里安排今天的摆药。</p>
        </div>
        <button className="primary" onClick={() => navigate("execute")}>
          <Pill size={18} />
          {current ? "继续本机任务" : "开始摆药"}
          <ArrowRight size={16} />
        </button>
      </div>
      <div className="daily-summary" aria-label="今日工作摘要">
        <div>
          <span>待准备</span>
          <strong>
            {queue.isPending || queue.error ? "—" : due.length}
            <small>位住民</small>
          </strong>
        </div>
        <div>
          <span>正在处理</span>
          <strong>
            {active.length}
            <small>个任务</small>
          </strong>
        </div>
        <div>
          <span>需要核对</span>
          <strong>
            {queue.isPending || queue.error ? "—" : attention.length}
            <small>位住民</small>
          </strong>
        </div>
      </div>
      <div className="daily-layout">
        <section className="panel work-list">
          <div className="section-heading">
            <div>
              <h2>准备清单</h2>
              <p className="muted">按用药安排和已完成覆盖自动整理</p>
            </div>
            <button
              className="icon"
              aria-label="刷新准备清单"
              onClick={() => queue.refetch()}
            >
              <RefreshCw size={17} />
            </button>
          </div>
          <div className="list-toolbar">
            <div className="segmented" aria-label="准备清单范围">
              {[
                ["due", "待准备"],
                ["ahead", "提前准备"],
                ["all", "全部住民"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={scope === id}
                  className={scope === id ? "selected" : ""}
                  onClick={() => setScope(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <Filter value={query} change={setQuery} />
          </div>
          <Failure error={queue.error} />
          {queue.isPending ? (
            <Busy />
          ) : (
            !queue.error && (
              <>
                <div className="queue-column-labels">
                  <span>住民</span>
                  <span>建议准备日期</span>
                  <span>待办</span>
                </div>
                {visible.map((item) => (
                  <div className="work-row" key={item.resident.id}>
                    <div className="person-cell">
                      <span className="avatar">
                        {item.resident.name.slice(-2)}
                      </span>
                      <div>
                        <strong>{item.resident.name}</strong>
                        <small>{item.resident.bed || "未填写床位"}</small>
                      </div>
                    </div>
                    <div className="work-dates">
                      <strong>
                        {item.startDate && item.endDate
                          ? dateRange(item.startDate, item.endDate)
                          : "—"}
                      </strong>
                      <small>
                        {item.coverageEnd
                          ? `已准备至 ${item.coverageEnd}`
                          : "尚无已完成覆盖"}
                      </small>
                    </div>
                    <div className="work-action">
                      <span className={item.issue ? "attention-text" : "muted"}>
                        {item.occupiedTaskId
                          ? `${item.deviceName} 正在处理`
                          : item.reason}
                      </span>
                      <button
                        className="link"
                        disabled={
                          !item.startDate && !item.issue && !item.occupiedTaskId
                        }
                        onClick={() =>
                          item.occupiedTaskId
                            ? navigate(
                                current?.taskId === item.occupiedTaskId
                                  ? "execute"
                                  : "records",
                              )
                            : item.issue
                              ? navigate("records")
                              : navigate("execute", item.resident.id)
                        }
                      >
                        {item.occupiedTaskId
                          ? "查看任务"
                          : item.issue
                            ? "核对记录"
                            : "核对计划"}
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {!visible.length && (
                  <Empty>
                    {query
                      ? "没有找到匹配的住民，请调整搜索。"
                      : scope === "due"
                        ? "当前没有待准备事项，可查看提前准备清单。"
                        : "当前没有符合条件的住民。"}
                  </Empty>
                )}
              </>
            )
          )}
        </section>
        <aside className="daily-aside">
          <section className="panel machine-card">
            <div className="section-heading">
              <h2>
                <Monitor size={18} />
                本机工作
              </h2>
              <Badge tone={runtime.mode === "simulator" ? "amber" : ""}>
                {runtime.mode === "simulator" ? "演练模式" : "真实机器"}
              </Badge>
            </div>
            <h3>{current?.deviceId || credentials.device}</h3>
            {current ? (
              <>
                <div className="current-person">
                  <span className="avatar large">
                    {current.plan.resident.name.slice(-2)}
                  </span>
                  <div>
                    <strong>{current.plan.resident.name}</strong>
                    <small>{current.plan.resident.bed}</small>
                  </div>
                </div>
                <p className="muted">
                  {dateRange(current.plan.startDate, current.plan.endDate)}
                </p>
                <button className="primary" onClick={() => navigate("execute")}>
                  返回当前任务
                  <ArrowRight size={16} />
                </button>
              </>
            ) : (
              <>
                <div className="machine-idle">
                  <Pill size={34} />
                  <strong>准备开始下一次摆药</strong>
                  <p>选择住民，核对本次用药计划。</p>
                </div>
                <button onClick={() => navigate("execute")}>
                  选择住民
                  <ArrowRight size={16} />
                </button>
              </>
            )}
          </section>
          <section className="panel compact-panel">
            <h2>院内正在进行</h2>
            {active.map((task) => (
              <div className="activity" key={task.id}>
                <div>
                  <strong>{task.plan.resident.name}</strong>
                  <small>{task.deviceId}</small>
                </div>
                <Badge tone={taskResult(task).tone}>
                  {taskResult(task).label}
                </Badge>
              </div>
            ))}
            {!active.length && (
              <p className="quiet-empty">暂时没有正在进行的任务</p>
            )}
          </section>
          <div className="coverage-note">
            <CalendarDays size={18} />
            <div>
              <strong>每次准备 {workspace.institution.settings.days} 天</strong>
              <p>日常自动沿用机构的覆盖规则。</p>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
