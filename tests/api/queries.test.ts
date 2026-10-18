import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase, migrate } from "../../apps/api/src/database.ts";
import { createApp } from "../../apps/api/src/app.ts";
import type { Task } from "../../packages/contracts/src/model.ts";
import {
  businessDate,
  dateAdd,
} from "../../packages/dispensing-policy/src/index.ts";

async function fixture() {
  const db = await openDatabase(":memory:");
  await migrate(db);
  const { app, service } = await createApp(db);
  await service.bootstrap({
    username: "queries",
    name: "查询测试",
    password: "Test-query-only-2026",
  });
  const login = await service.login("queries", "Test-query-only-2026");
  const org = await service.createInstitution(login.user, {
      name: "查询测试院",
    }),
    ctx = await service.context(login.user, org.id);
  const resident = await service.saveResident(ctx, {
    name: "住民百分号%甲",
    bed: "A-101",
  });
  await service.savePrescription(ctx, {
    residentId: resident.id,
    name: "药物甲",
    specification: "测试规格",
    form: "whole",
    unit: "片",
    meal: "none",
    doses: { morning: 1, noon: 0, evening: 0, bedtime: 0 },
    startDate: "2026-01-01",
  });
  const plan = (await service.preview(ctx, resident.id))!;
  const headers = {
    authorization: `Bearer ${login.token}`,
    "x-institution-id": org.id,
  };
  const insert = async (id: string, overrides: Partial<Task> = {}) => {
    const task: Task = {
      id,
      institutionId: org.id,
      residentId: resident.id,
      deviceId: "一号机",
      terminalId: "test-pc",
      userId: login.user.id,
      plan,
      status: "ended",
      started: true,
      executionMode: "simulator",
      results: plan.batches.map((b) => ({
        batchId: b.id,
        status: "machine",
        count: b.target,
      })),
      createdAt: "2026-10-09T16:30:00.000Z",
      endedAt: "2026-10-09T16:31:00.000Z",
      revision: 1,
      ...overrides,
    };
    await db.query(
      "INSERT INTO tasks(id,institution_id,resident_id,device_id,terminal_id,status,started,body,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      [
        task.id,
        task.institutionId,
        task.residentId,
        task.deviceId,
        task.terminalId,
        task.status,
        1,
        JSON.stringify(task),
        task.createdAt,
      ],
    );
    return task;
  };
  return {
    db,
    app,
    service,
    login,
    org,
    ctx,
    resident,
    plan,
    headers,
    insert,
    close: async () => {
      await app.close();
      await db.close();
    },
  };
}
test("history filters and export cover all pages, use literal search, and preserve oldest cursors", async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 53; i++)
      await f.insert(`row-${String(i).padStart(3, "0")}`);
    await f.insert("excluded", { deviceId: "二号机", results: [] });
    const filters = {
      q: "%",
      device: "一号",
      drug: "药物甲",
      mode: "simulator",
      result: "complete",
      sort: "oldest",
    } as const;
    const first = await f.service.recordPage(f.ctx, undefined, filters);
    assert.equal(first.items.length, 50);
    assert.equal(first.items[0].id, "row-000");
    const second = await f.service.recordPage(f.ctx, first.nextCursor, filters);
    assert.deepEqual(
      second.items.map((t) => t.id),
      ["row-050", "row-051", "row-052"],
    );
    const query = new URLSearchParams(filters).toString();
    const exported = await f.app.inject({
      method: "GET",
      url: `/api/records/export?${query}`,
      headers: f.headers,
    });
    assert.equal(exported.statusCode, 200, exported.body);
    assert.equal(exported.json().tasks.length, 53);
    assert.equal(
      (await f.service.recordPage(f.ctx, undefined, { result: "attention" }))
        .items[0].id,
      "excluded",
    );
    const bad = await f.app.inject({
      method: "GET",
      url: "/api/records?result=not-a-result",
      headers: f.headers,
    });
    assert.equal(bad.statusCode, 400);
  } finally {
    await f.close();
  }
});
test("record dates use institution calendar boundaries and queries remain isolated", async () => {
  const f = await fixture();
  try {
    await f.insert("inside");
    await f.insert("before", { createdAt: "2026-10-09T15:59:59.000Z" });
    await f.insert("after", { createdAt: "2026-10-10T16:00:00.000Z" });
    const rows = await f.service.recordPage(f.ctx, undefined, {
      dateFrom: "2026-10-10",
      dateTo: "2026-10-10",
    });
    assert.deepEqual(
      rows.items.map((t) => t.id),
      ["inside"],
    );
    const other = await f.service.createInstitution(f.login.user, {
        name: "其他院",
      }),
      ctx = await f.service.context(f.login.user, other.id);
    assert.equal(
      (await f.service.recordPage(ctx, undefined, { q: "住民" })).items.length,
      0,
    );
    assert.equal((await f.service.planningQueue(ctx)).items.length, 0);
  } finally {
    await f.close();
  }
});
test("preparation queue excludes simulated coverage and retains unresolved real work", async () => {
  const f = await fixture();
  try {
    await f.insert("practice", {
      plan: {
        ...f.plan,
        endDate: dateAdd(businessDate(f.org.settings.timezone), 20),
      },
    });
    let item = (await f.service.planningQueue(f.ctx)).items[0];
    assert.equal(item.coverageEnd, null);
    assert.equal(item.due, true);
    await f.insert("real-complete", {
      executionMode: "serial",
      plan: {
        ...f.plan,
        endDate: dateAdd(businessDate(f.org.settings.timezone), 6),
      },
    });
    item = (await f.service.planningQueue(f.ctx)).items[0];
    assert.equal(item.due, false);
    assert.equal(
      item.coverageEnd,
      dateAdd(businessDate(f.org.settings.timezone), 6),
    );
    await f.insert("real-unknown", {
      executionMode: "serial",
      plan: {
        ...f.plan,
        endDate: dateAdd(businessDate(f.org.settings.timezone), 13),
      },
      results: [],
    });
    item = (await f.service.planningQueue(f.ctx)).items[0];
    assert.equal(item.due, true);
    assert.match(item.reason, /未完成/);
    assert.ok(item.issue);
  } finally {
    await f.close();
  }
});
