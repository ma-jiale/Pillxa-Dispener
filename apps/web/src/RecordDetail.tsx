import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, CheckCircle2, CircleAlert } from "lucide-react";
import { Modal, Badge, Busy, Failure } from "./components.tsx";
import { useApp } from "./context.tsx";
import { api, download } from "./platform.ts";
import { PlanGrid } from "./PlanGrid.tsx";
import { dateRange, dateTime, taskResult } from "./presentation.ts";
import type {
  Task,
  RuntimeEvent,
} from "../../../packages/contracts/src/model.ts";

const resultLabels: Record<string, string> = {
  machine: "机器完成",
  manual: "人工补齐",
  skipped: "跳过未完成",
  unknown: "待核实",
};
const eventLabels: Record<string, string> = {
  "task.started": "开始摆药",
  "batch.started": "开始本药",
  "batch.result": "药物处理结果",
  "task.ended": "任务结束",
  "box.observed": "药盒识别",
  "box.open_requested": "请求开仓",
  "box.close_requested": "人工确认取盒并收回轨道",
  "task.paused": "暂停摆药",
  "task.resumed": "继续摆药",
  "device.gate_set": "调整出药开口",
  "batch.resolution_requested": "请求现场处理",
  "batch.exit_completed": "当前药物已退出",
};
export function RecordDetail({ task, close }: { task: Task; close(): void }) {
  const { workspace, user, notify } = useApp();
  const [technical, setTechnical] = useState(false),
    [plan, setPlan] = useState(false);
  const events = useQuery({
    queryKey: ["task-events", workspace.institution.id, task.id],
    queryFn: () => api<RuntimeEvent[]>(`/tasks/${task.id}/events`),
  });
  const result = taskResult(task);
  const canExport =
    user.role !== "staff" || user.permissions.includes("export");
  const timeline = events.data?.filter((e) => !!eventLabels[e.type]);
  return (
    <Modal title="摆药记录详情" drawer close={close}>
      <div className="record-overview">
        <span className="avatar large">
          {task.plan.resident.name.slice(-2)}
        </span>
        <div>
          <h2>{task.plan.resident.name}</h2>
          <p>
            {task.plan.resident.bed} ·{" "}
            {dateRange(task.plan.startDate, task.plan.endDate)}
          </p>
        </div>
        <Badge tone={result.tone}>{result.label}</Badge>
      </div>
      <div className="record-meta">
        <div>
          <small>摆药设备</small>
          <strong>{task.deviceId}</strong>
        </div>
        <div>
          <small>创建时间</small>
          <strong>
            {dateTime(task.createdAt, workspace.institution.settings.timezone)}
          </strong>
        </div>
        <div>
          <small>操作环境</small>
          <strong>
            {task.executionMode === "simulator" ? "演练模式" : "真实机器"}
          </strong>
        </div>
      </div>
      {task.executionMode === "simulator" && (
        <p className="simulation-note">这是演练记录，不计入实际用药覆盖。</p>
      )}
      <section className="detail-section">
        <div className="section-heading">
          <h2>逐药结果</h2>
          <span className="muted">{task.plan.batches.length} 项</span>
        </div>
        <div className="record-results">
          {task.plan.batches.map((batch) => {
            const item = task.results.find((r) => r.batchId === batch.id),
              good = item && ["machine", "manual"].includes(item.status);
            return (
              <article className="record-result-row" key={batch.id}>
                {good ? (
                  <CheckCircle2 size={20} />
                ) : (
                  <CircleAlert className="attention-text" size={20} />
                )}
                <div>
                  <h3>{batch.name}</h3>
                  <p>
                    {batch.specification} ·{" "}
                    {batch.form === "half" ? "预切半片" : "整片"}
                  </p>
                  {item?.reason && (
                    <p className="result-reason">{item.reason}</p>
                  )}
                </div>
                <div className="result-amount">
                  <strong>
                    {item ? resultLabels[item.status] : "尚无结果"}
                  </strong>
                  <small>
                    计划 {batch.target} 颗
                    {item
                      ? ` · ${item.status === "manual" ? "人工确认" : "机器累计"} ${item.count} 颗`
                      : ""}
                  </small>
                </div>
              </article>
            );
          })}
        </div>
        <p className="hint">
          机器累计计数与人工确认分别记录；药格中的数量是当时计划。
        </p>
      </section>
      <section className="detail-section">
        <h2>处理经过</h2>
        <Failure error={events.error} />
        {events.isPending ? (
          <Busy />
        ) : (
          <div className="event-timeline">
            {timeline?.map((e) => (
              <div key={e.id}>
                <span />
                <strong>{eventLabels[e.type]}</strong>
                <time>
                  {dateTime(
                    e.receivedAt,
                    workspace.institution.settings.timezone,
                  )}
                </time>
              </div>
            ))}
            {!events.error && !timeline?.length && (
              <p className="hint">暂时没有可显示的处理经过。</p>
            )}
          </div>
        )}
      </section>
      <details
        open={plan}
        onToggle={(e) => setPlan(e.currentTarget.open)}
        className="detail-disclosure"
      >
        <summary>查看当时的摆药计划</summary>
        {plan && <PlanGrid plan={task.plan} />}
      </details>
      {(user.role !== "staff" ||
        user.permissions.includes("devices") ||
        canExport) && (
        <details
          open={technical}
          onToggle={(e) => setTechnical(e.currentTarget.open)}
          className="detail-disclosure"
        >
          <summary>技术详情与原始记录</summary>
          {technical && (
            <>
              <p className="hint">任务编号：{task.id}</p>
              {canExport && (
                <button
                  onClick={() =>
                    download(
                      `/tasks/${task.id}/samples/export`,
                      "Pillxai-原始记录.json",
                    ).catch((e) => notify(e.message))
                  }
                >
                  <FileDown size={16} />
                  导出原始记录
                </button>
              )}
              <Failure error={events.error} />
              {events.data && (
                <pre className="events">
                  {JSON.stringify(events.data, null, 2)}
                </pre>
              )}
            </>
          )}
        </details>
      )}
    </Modal>
  );
}
