import type {
  ExecutionSnapshot,
  Task,
} from "../../../packages/contracts/src/model.ts";

export function dateRange(start: string, end: string) {
  const short = (date: string) =>
    `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`;
  if (start.slice(0, 4) !== end.slice(0, 4)) return `${start} — ${end}`;
  const year =
    start.slice(0, 4) === String(new Date().getFullYear())
      ? ""
      : `${start.slice(0, 4)}年`;
  return (
    year + (start === end ? short(start) : `${short(start)} — ${short(end)}`)
  );
}
export function dateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}
export function taskResult(task: Task): { label: string; tone: string } {
  if (task.status === "cancelled") return { label: "已取消", tone: "" };
  if (task.status === "ended") {
    if (task.results.some((r) => r.status === "unknown"))
      return { label: "待核实", tone: "amber" };
    const complete =
      task.plan.batches.length > 0 &&
      task.results.length === task.plan.batches.length &&
      task.results.every((r) => ["machine", "manual"].includes(r.status));
    return complete
      ? { label: "已完成摆药", tone: "blue" }
      : { label: "有未完成项", tone: "amber" };
  }
  if (["review", "interrupted"].includes(task.status))
    return { label: "需要核对", tone: "amber" };
  if (task.status === "paused") return { label: "已暂停", tone: "amber" };
  return { label: task.started ? "摆药中" : "等待开始", tone: "blue" };
}
// Preparing another batch must never show the previous batch's count or identity.
export function executionView(state: ExecutionSnapshot) {
  const preparing = ["next_drug", "tray_change"].includes(state.phase);
  const index = state.batchIndex + (preparing ? 1 : 0);
  return {
    batch: state.plan.batches[index],
    index,
    count: preparing ? 0 : state.count,
    preparing,
    lastGateValue:
      state.gateOverrides?.[state.plan.batches[index]?.id] ??
      (preparing ? null : state.gateValue),
  };
}
