import type { Database, SqlConnection } from "../database.ts";
import type {
  Institution,
  Plan,
  PlanningQueueItem,
  Task,
} from "../../../../packages/contracts/src/model.ts";
import {
  generatePlan,
  businessDate,
  dateAdd,
} from "../../../../packages/dispensing-policy/src/index.ts";
import { body } from "../core.ts";
import type { Context } from "../core.ts";
import type { Residents } from "./residents.ts";
import type { Medication } from "./medication.ts";
import type { Records } from "./records.ts";
export class Planning {
  db: Database;
  residents: Residents;
  medication: Medication;
  records: Records;
  constructor(
    db: Database,
    residents: Residents,
    medication: Medication,
    records: Records,
  ) {
    this.db = db;
    this.residents = residents;
    this.medication = medication;
    this.records = records;
  }
  async queue(
    ctx: Context,
  ): Promise<{ today: string; items: PlanningQueueItem[] }> {
    const [orgRow, residents, prescriptions, tasks] = await Promise.all([
      this.db.query("SELECT body FROM institutions WHERE id=?", [
        ctx.institutionId,
      ]),
      this.residents.residents(ctx),
      this.medication.prescriptions(ctx),
      this.records.tasks(ctx),
    ]);
    const org = body<Institution>(orgRow.rows[0]);
    const today = businessDate(org.settings.timezone);
    const items = residents
      .filter((r) => r.active)
      .map((resident): PlanningQueueItem => {
        const history = tasks.filter((t) => t.residentId === resident.id);
        const occupied = history.find(
          (t) => !["ended", "cancelled"].includes(t.status),
        );
        const real = history.filter((t) => t.executionMode === "serial");
        const complete = (t: Task) =>
          t.status === "ended" &&
          t.results.length === t.plan.batches.length &&
          t.results.every((r) => ["machine", "manual"].includes(r.status));
        const coverageEnd =
          real
            .filter(complete)
            .map((t) => t.plan.endDate)
            .sort()
            .at(-1) ?? null;
        const unresolved = real.find(
          (t) => t.status === "ended" && !complete(t),
        );
        const base = {
          resident,
          coverageEnd,
          startDate: null,
          endDate: null,
          drugCount: 0,
          reason: "",
          due: false,
          occupiedTaskId: occupied?.id ?? null,
          deviceName: occupied?.deviceId ?? null,
          issue: null,
        };
        try {
          const plan = generatePlan({
            institutionId: ctx.institutionId,
            resident,
            prescriptions: prescriptions.filter(
              (p) => p.residentId === resident.id,
            ),
            settings: org.settings,
            lastCompleteEnd: coverageEnd,
            today,
          });
          const due =
            !!plan &&
            (!coverageEnd ||
              coverageEnd < today ||
              coverageEnd <= dateAdd(today, org.settings.reminderDays - 1));
          const needsReview =
            !!unresolved &&
            (!coverageEnd || unresolved.plan.endDate > coverageEnd);
          return {
            ...base,
            startDate: plan?.startDate ?? null,
            endDate: plan?.endDate ?? null,
            drugCount: plan
              ? new Set(plan.batches.map((b) => b.prescriptionId)).size
              : 0,
            due: due || needsReview,
            reason: occupied
              ? "正在处理"
              : needsReview
                ? "上次有未完成项，请核对"
                : !plan
                  ? "当前无需摆药"
                  : !coverageEnd
                    ? "尚无已完成覆盖"
                    : coverageEnd < today
                      ? "覆盖已结束"
                      : due
                        ? "即将到期"
                        : "可提前准备",
            issue: needsReview
              ? "请先查看原任务的未完成项，核对后再安排下一次摆药。"
              : null,
          };
        } catch (e) {
          return {
            ...base,
            due: true,
            reason: "用药安排需核对",
            issue: (e as Error).message,
          };
        }
      });
    items.sort(
      (a, b) =>
        Number(b.due) - Number(a.due) ||
        a.resident.bed.localeCompare(b.resident.bed, "zh-CN", {
          numeric: true,
        }),
    );
    return { today, items };
  }
  async preview(
    ctx: Context,
    residentId: string,
    mealSplit?: boolean,
    tx: SqlConnection = this.db,
  ): Promise<Plan | null> {
    const resident = await this.residents.resident(ctx, residentId, tx);
    const org = body<Institution>(
      (
        await tx.query("SELECT body FROM institutions WHERE id=?", [
          ctx.institutionId,
        ])
      ).rows[0],
    );
    const tasks = await this.records.tasks(ctx, tx, { residentId });
    const latest = tasks
      .filter(
        (task) =>
          task.residentId === residentId &&
          task.executionMode === "serial" &&
          task.status === "ended" &&
          task.results.length === task.plan.batches.length &&
          task.results.every((result) =>
            ["machine", "manual"].includes(result.status),
          ),
      )
      .sort((a, b) => b.plan.endDate.localeCompare(a.plan.endDate))[0];
    return generatePlan({
      institutionId: ctx.institutionId,
      resident,
      settings: org.settings,
      prescriptions: await this.medication.prescriptions(ctx, residentId, tx),
      lastCompleteEnd: latest?.plan.endDate,
      mealSplit,
    });
  }
}
