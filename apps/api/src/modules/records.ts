import type { Database, SqlConnection } from "../database.ts";
import type {
  Task,
  RuntimeEvent,
  RecordFilters,
  Institution,
} from "../../../../packages/contracts/src/model.ts";
import { dateAdd } from "../../../../packages/dispensing-policy/src/index.ts";
import { fail, body } from "../core.ts";
import type { Context } from "../core.ts";
// Filters use the institution's calendar days, including offset and DST changes.
function dayStart(date: string, timezone: string): string {
  dateAdd(date, 0);
  const target = Date.parse(`${date}T00:00:00Z`);
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const part = (name: string) => parts.find((p) => p.type === name)!.value;
    const wall = Date.parse(
      `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}Z`,
    );
    const next = instant + target - wall;
    if (next === instant) break;
    instant = next;
  }
  return new Date(instant).toISOString();
}
export class Records {
  db: Database;
  constructor(db: Database) {
    this.db = db;
  }
  async tasks(
    ctx: Context,
    tx: SqlConnection = this.db,
    options: RecordFilters & {
      residentId?: string;
      limit?: number;
      before?: string;
      includeActive?: boolean;
    } = {},
  ): Promise<Task[]> {
    const conditions = ["institution_id=?"];
    const values: unknown[] = [ctx.institutionId];
    if (options.residentId) {
      conditions.push("resident_id=?");
      values.push(options.residentId);
    }
    if (options.before) {
      const [created, id] = options.before.split("|");
      if (!created || !id) fail(400, "CURSOR", "记录页码无效");
      const comparison = options.sort === "oldest" ? ">" : "<";
      conditions.push(
        `(created_at${comparison}? OR (created_at=? AND id${comparison}?))`,
      );
      values.push(created, created, id);
    }
    const json = (path: string) =>
      this.db.dialect === "postgres"
        ? `(body::jsonb #>> '{${path.split(".").join(",")}}')`
        : `json_extract(body,'$.${path}')`;
    const contains = (expression: string, value?: string) => {
      if (!value?.trim()) return;
      conditions.push(`LOWER(${expression}) LIKE ? ESCAPE '\\'`);
      values.push(
        `%${value
          .trim()
          .toLowerCase()
          .replace(/[\\%_]/g, "\\$&")}%`,
      );
    };
    contains(
      `(${json("plan.resident.name")} || ' ' || ${json("plan.resident.bed")})`,
      options.q,
    );
    contains("device_id", options.device);
    if (options.operator) {
      conditions.push(`${json("userId")}=?`);
      values.push(options.operator);
    }
    if (options.mode) {
      conditions.push(`${json("executionMode")}=?`);
      values.push(options.mode);
    }
    if (options.dateFrom || options.dateTo) {
      if (
        options.dateFrom &&
        options.dateTo &&
        options.dateFrom > options.dateTo
      )
        fail(400, "DATES", "开始日期不能晚于结束日期");
      const org = body<Institution>(
        (
          await tx.query("SELECT body FROM institutions WHERE id=?", [
            ctx.institutionId,
          ])
        ).rows[0],
      );
      if (options.dateFrom) {
        conditions.push("created_at>=?");
        values.push(dayStart(options.dateFrom, org.settings.timezone));
      }
      if (options.dateTo) {
        conditions.push("created_at<?");
        values.push(
          dayStart(dateAdd(options.dateTo, 1), org.settings.timezone),
        );
      }
    }
    if (options.drug?.trim()) {
      const batches =
        this.db.dialect === "postgres"
          ? `jsonb_array_elements(body::jsonb->'plan'->'batches') AS b(value)`
          : `json_each(body,'$.plan.batches') AS b`;
      const name =
        this.db.dialect === "postgres"
          ? `b.value->>'name'`
          : `json_extract(b.value,'$.name')`;
      conditions.push(
        `EXISTS (SELECT 1 FROM ${batches} WHERE LOWER(${name}) LIKE ? ESCAPE '\\')`,
      );
      values.push(
        `%${options.drug
          .trim()
          .toLowerCase()
          .replace(/[\\%_]/g, "\\$&")}%`,
      );
    }
    const resultArray =
      this.db.dialect === "postgres"
        ? `jsonb_array_elements(body::jsonb->'results') AS r(value)`
        : `json_each(body,'$.results') AS r`;
    const resultStatus =
      this.db.dialect === "postgres"
        ? `r.value->>'status'`
        : `json_extract(r.value,'$.status')`;
    const length = (path: string) =>
      this.db.dialect === "postgres"
        ? `jsonb_array_length(body::jsonb #> '{${path.split(".").join(",")}}')`
        : `json_array_length(body,'$.${path}')`;
    const complete = `(status='ended' AND ${length("plan.batches")}>0 AND ${length("results")}=${length("plan.batches")} AND NOT EXISTS (SELECT 1 FROM ${resultArray} WHERE ${resultStatus} NOT IN ('machine','manual')))`;
    if (options.result === "complete") conditions.push(complete);
    if (options.result === "attention")
      conditions.push(
        `((status='ended' AND NOT ${complete}) OR status IN ('review','interrupted'))`,
      );
    if (options.result === "cancelled") conditions.push("status='cancelled'");
    if (options.result === "active")
      conditions.push("status NOT IN ('ended','cancelled')");
    const order = options.sort === "oldest" ? "ASC" : "DESC";
    let sql = `SELECT body FROM tasks WHERE ${conditions.join(" AND ")} ORDER BY created_at ${order},id ${order}`;
    if (options.limit) {
      sql += " LIMIT ?";
      values.push(options.limit);
    }
    const tasks = (await tx.query(sql, values)).rows.map(body<Task>);
    if (options.includeActive) {
      const active = (
        await tx.query(
          "SELECT body FROM tasks WHERE institution_id=? AND status NOT IN ('ended','cancelled')",
          [ctx.institutionId],
        )
      ).rows.map(body<Task>);
      for (const task of active)
        if (!tasks.some((t) => t.id === task.id)) tasks.push(task);
    }
    return tasks;
  }
  async recordPage(ctx: Context, before?: string, filters: RecordFilters = {}) {
    const rows = await this.tasks(ctx, this.db, {
      ...filters,
      limit: 51,
      before,
    });
    const items = rows.slice(0, 50),
      last = items.at(-1);
    return {
      items,
      filters,
      nextCursor:
        rows.length > 50 && last ? `${last.createdAt}|${last.id}` : undefined,
    };
  }
  async task(
    ctx: Context,
    id: string,
    tx: SqlConnection = this.db,
    lock = false,
  ): Promise<Task> {
    const row = (
      await tx.query(
        "SELECT body FROM tasks WHERE id=? AND institution_id=?" +
          (lock && this.db.dialect === "postgres" ? " FOR UPDATE" : ""),
        [id, ctx.institutionId],
      )
    ).rows[0];
    if (!row) fail(404, "TASK", "任务不存在");
    return body<Task>(row);
  }
  async events(ctx: Context, taskId: string) {
    await this.task(ctx, taskId);
    return (
      await this.db.query(
        "SELECT body FROM events WHERE task_id=? AND institution_id=? ORDER BY sequence",
        [taskId, ctx.institutionId],
      )
    ).rows.map(body<RuntimeEvent>);
  }
}
