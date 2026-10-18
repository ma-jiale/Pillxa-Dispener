import { randomUUID } from "node:crypto";
import type { Database } from "../database.ts";
import type {
  Task,
  RuntimeEvent,
  BatchResult,
} from "../../../../packages/contracts/src/model.ts";
import { fail, body, now, string } from "../core.ts";
import type { Context } from "../core.ts";
import type { Identity } from "./identity.ts";
import type { Records } from "./records.ts";
import type { Planning } from "./planning.ts";
export class Dispensing {
  db: Database;
  identity: Identity;
  records: Records;
  planning: Planning;
  constructor(
    db: Database,
    identity: Identity,
    records: Records,
    planning: Planning,
  ) {
    this.db = db;
    this.identity = identity;
    this.records = records;
    this.planning = planning;
  }
  async claim(
    ctx: Context,
    input: {
      residentId: string;
      planId: string;
      mealSplit: boolean;
      deviceId: string;
      terminalId: string;
      executionMode?: "serial" | "simulator";
    },
  ): Promise<Task> {
    return this.db.transaction(async (tx) => {
      if (this.db.dialect === "postgres")
        await tx.query("SELECT pg_advisory_xact_lock(hashtext(?))", [
          ctx.institutionId,
        ]);
      const plan = await this.planning.preview(
        ctx,
        input.residentId,
        input.mealSplit,
        tx,
      );
      if (!plan) fail(409, "EMPTY", "当前无需摆药");
      if (plan.id !== input.planId)
        fail(409, "PLAN_CHANGED", "计划已变化，请重新预览");
      const terminal = (
        await tx.query("SELECT * FROM terminals WHERE id=?", [input.terminalId])
      ).rows[0];
      if (
        terminal &&
        (terminal.institution_id !== ctx.institutionId ||
          terminal.device_id !== input.deviceId)
      )
        fail(409, "TERMINAL", "本机绑定不匹配");
      if (!terminal)
        await tx.query(
          "INSERT INTO terminals(id,institution_id,device_id,body) VALUES(?,?,?,?)",
          [
            input.terminalId,
            ctx.institutionId,
            string(input.deviceId),
            JSON.stringify({ id: input.terminalId, deviceId: input.deviceId }),
          ],
        );
      const tasks = await this.records.tasks(ctx, tx);
      const occupied = tasks.find(
        (t) =>
          !["ended", "cancelled"].includes(t.status) &&
          (t.deviceId === input.deviceId || t.residentId === input.residentId),
      );
      if (occupied)
        fail(
          409,
          "OCCUPIED",
          `任务由设备 ${occupied.deviceId} 占用，请处理原任务`,
        );
      const partial = tasks.find(
        (t) =>
          t.residentId === input.residentId &&
          t.status === "ended" &&
          t.executionMode !== "simulator" &&
          t.plan.endDate >= plan.startDate &&
          t.plan.startDate <= plan.endDate &&
          !t.results.every((r) => ["machine", "manual"].includes(r.status)),
      );
      if (partial)
        fail(409, "UNRESOLVED", "该周期仍有未完成项，请先核对原任务");
      const task: Task = {
        id: randomUUID(),
        institutionId: ctx.institutionId,
        residentId: input.residentId,
        plan,
        executionMode: input.executionMode || "serial",
        deviceId: input.deviceId,
        terminalId: input.terminalId,
        userId: ctx.user.id,
        status: "claimed",
        started: false,
        results: [],
        createdAt: now(),
        endedAt: null,
        revision: 1,
      };
      await tx.query(
        "INSERT INTO tasks(id,institution_id,resident_id,device_id,terminal_id,status,started,body,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        [
          task.id,
          task.institutionId,
          task.residentId,
          task.deviceId,
          task.terminalId,
          task.status,
          0,
          JSON.stringify(task),
          task.createdAt,
        ],
      );
      await this.identity.audit(ctx, "task.claim", task.id, task, tx);
      return task;
    });
  }
  async begin(ctx: Context, id: string, terminalId: string): Promise<Task> {
    return this.db.transaction(async (tx) => {
      const task = await this.records.task(ctx, id, tx, true);
      if (task.terminalId !== terminalId)
        fail(403, "OWNER", "必须在原终端执行");
      if (task.started) return task;
      if (task.status !== "claimed")
        fail(409, "TASK_STATE", "任务已经取消或结束，不能启动");
      const preview = await this.planning.preview(
        ctx,
        task.residentId,
        task.plan.mealSplit,
        tx,
      );
      if (preview?.id !== task.plan.id)
        fail(409, "PLAN_CHANGED", "处方或设置已变化，请重新生成");
      task.started = true;
      task.status = "starting";
      task.revision++;
      await tx.query("UPDATE tasks SET started=1,status=?,body=? WHERE id=?", [
        task.status,
        JSON.stringify(task),
        task.id,
      ]);
      return task;
    });
  }
  async cancel(ctx: Context, id: string, terminalId: string) {
    return this.db.transaction(async (tx) => {
      const task = await this.records.task(ctx, id, tx, true);
      if (task.terminalId !== terminalId || task.started)
        fail(409, "STARTED", "已开始任务不能取消领取或转交");
      task.status = "cancelled";
      task.endedAt = now();
      await tx.query("UPDATE tasks SET status=?,body=? WHERE id=?", [
        task.status,
        JSON.stringify(task),
        id,
      ]);
      return task;
    });
  }
  async discard(
    ctx: Context,
    id: string,
    terminalId: string,
    confirmed: boolean,
  ) {
    if (confirmed !== true) fail(400, "CONFIRM", "请确认结束并删除本次分药");
    return this.db.transaction(async (tx) => {
      const row = (
        await tx.query(
          `SELECT body FROM tasks WHERE id=?${this.db.dialect === "postgres" ? " FOR UPDATE" : ""}`,
          [id],
        )
      ).rows[0];
      // Retrying after the central deletion succeeded must let local cleanup finish.
      if (!row) return { ok: true };
      const task = body<Task>(row);
      if (
        task.institutionId !== ctx.institutionId ||
        task.terminalId !== terminalId
      )
        fail(403, "OWNER", "只能在原机构、原终端结束本次分药");
      if (["ended", "cancelled"].includes(task.status))
        fail(409, "TASK_STATE", "已结束的历史任务不能从中断入口删除");
      await tx.query("DELETE FROM events WHERE task_id=?", [id]);
      await tx.query(
        "DELETE FROM audit WHERE institution_id=? AND object_id=?",
        [ctx.institutionId, id],
      );
      await tx.query("DELETE FROM tasks WHERE id=?", [id]);
      return { ok: true };
    });
  }
  async sync(
    ctx: Context,
    id: string,
    terminalId: string,
    events: RuntimeEvent[],
  ): Promise<{
    accepted: string[];
    task: Task;
  }> {
    if (!Array.isArray(events) || events.length > 1000)
      fail(400, "EVENTS", "事件批量无效");
    return this.db.transaction(async (tx) => {
      const task = await this.records.task(ctx, id, tx, true);
      if (task.terminalId !== terminalId)
        fail(403, "OWNER", "记录须来自原终端");
      const accepted: string[] = [];
      for (const event of events) {
        if (
          event.taskId !== id ||
          event.terminalId !== terminalId ||
          event.institutionId !== ctx.institutionId ||
          event.deviceId !== task.deviceId
        )
          fail(400, "EVENT_OWNER", "事件归属不一致");
        const existing = (
          await tx.query("SELECT body FROM events WHERE id=?", [event.id])
        ).rows[0];
        if (existing) {
          if (String(existing.body) !== JSON.stringify(event))
            fail(409, "EVENT_CONFLICT", "同一事件身份内容不同");
          accepted.push(event.id);
          continue;
        }
        if (!task.started) fail(409, "NOT_STARTED", "任务尚未获得启动许可");
        await tx.query(
          "INSERT INTO events(id,institution_id,task_id,terminal_id,sequence,type,body,created_at) VALUES(?,?,?,?,?,?,?,?)",
          [
            event.id,
            ctx.institutionId,
            id,
            terminalId,
            event.sequence,
            event.type,
            JSON.stringify(event),
            event.receivedAt,
          ],
        );
        if (event.type === "batch.result") {
          const result = event.data as BatchResult;
          const batch = task.plan.batches.find((b) => b.id === result.batchId);
          if (
            !batch ||
            !["machine", "manual", "skipped", "unknown"].includes(
              result.status,
            ) ||
            !Number.isInteger(result.count) ||
            result.count < 0
          )
            fail(400, "RESULT", "批次结果无效");
          if (
            ["machine", "manual"].includes(result.status) &&
            result.count !== batch.target
          )
            fail(400, "COUNT", "完成结果必须与目标相符");
          if (!task.results.some((r) => r.batchId === result.batchId))
            task.results.push(result);
        }
        if (event.type === "task.ended") {
          if (task.results.length !== task.plan.batches.length)
            fail(409, "INCOMPLETE", "尚有药物没有处理结果");
          task.status = "ended";
          task.endedAt = event.receivedAt;
        } else if (task.status !== "ended")
          task.status = event.type === "task.paused" ? "paused" : "running";
        accepted.push(event.id);
      }
      task.revision++;
      await tx.query("UPDATE tasks SET status=?,body=? WHERE id=?", [
        task.status,
        JSON.stringify(task),
        task.id,
      ]);
      return { accepted, task };
    });
  }
}
