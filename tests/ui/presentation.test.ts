import test from "node:test";
import assert from "node:assert/strict";
import { executionView, taskResult } from "../../apps/web/src/presentation.ts";
import type {
  ExecutionSnapshot,
  Task,
} from "../../packages/contracts/src/model.ts";

test("next drug and tray change show the upcoming identity with a fresh count", () => {
  const previous = { id: "previous", name: "上一药", tray: 0 },
    next = { id: "next", name: "下一药", tray: 1 };
  const state = {
    batchIndex: 0,
    count: 14,
    gateValue: 0.22,
    plan: { batches: [previous, next] },
    phase: "running",
  } as unknown as ExecutionSnapshot;
  assert.equal(executionView(state).batch.id, "previous");
  assert.equal(executionView(state).count, 14);
  for (const phase of ["next_drug", "tray_change"] as const) {
    const view = executionView({ ...state, phase });
    assert.equal(view.batch.id, "next");
    assert.equal(view.index, 1);
    assert.equal(view.count, 0);
    assert.equal(view.lastGateValue, null);
  }
});
test("incomplete or unknown history cannot be labeled complete", () => {
  const task = {
    status: "ended",
    plan: { batches: [{ id: "a" }, { id: "b" }] },
    results: [{ batchId: "a", status: "machine", count: 7 }],
  } as unknown as Task;
  assert.equal(taskResult(task).label, "有未完成项");
  assert.equal(
    taskResult({
      ...task,
      results: [...task.results, { batchId: "b", status: "unknown", count: 0 }],
    }).label,
    "待核实",
  );
  assert.equal(
    taskResult({
      ...task,
      results: [...task.results, { batchId: "b", status: "manual", count: 7 }],
    }).label,
    "已完成摆药",
  );
});
