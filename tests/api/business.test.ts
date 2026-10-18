import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase, migrate } from "../../apps/api/src/database.ts";
import { createBusiness, ApiError } from "../../apps/api/src/business.ts";
import type { Context } from "../../apps/api/src/business.ts";
import type { RuntimeEvent } from "../../packages/contracts/src/model.ts";
import { randomUUID } from "node:crypto";
async function fixture() {
  const db = await openDatabase(":memory:");
  await migrate(db);
  const business = createBusiness(db);
  await business.bootstrap({
    username: "owner",
    name: "平台管理员",
    password: "test-password-123",
  });
  const { user } = await business.login("owner", "test-password-123");
  const org = await business.createInstitution(user, { name: "甲院" });
  const ctx = await business.context(user, org.id);
  const resident = await business.saveResident(ctx, {
    name: "住民甲",
    bed: "201-1",
  });
  const rx = await business.savePrescription(ctx, {
    residentId: resident.id,
    name: "示例药",
    specification: "10 mg",
    unit: "片",
    form: "half",
    doses: { morning: 0.5, noon: 0.5, evening: 0.5, bedtime: 0 },
    meal: "none",
    startDate: "2026-01-01",
  });
  return { db, business, user, org, ctx, resident, rx };
}
test("discard removes task, events and task audit; retries do not restore coverage or accept late feedback", async () => {
  const f = await fixture();
  try {
    const plan = (await f.business.preview(f.ctx, f.resident.id))!;
    const task = await f.business.claim(f.ctx, {
      residentId: f.resident.id,
      planId: plan.id,
      mealSplit: true,
      deviceId: "dev",
      terminalId: "pc",
      executionMode: "serial",
    });
    await f.business.begin(f.ctx, task.id, "pc");
    const event: RuntimeEvent = {
      id: randomUUID(),
      sequence: 1,
      type: "device.progress",
      data: { count: 2 },
      taskId: task.id,
      institutionId: f.org.id,
      terminalId: "pc",
      deviceId: "dev",
      receivedAt: new Date().toISOString(),
    };
    await f.business.sync(f.ctx, task.id, "pc", [event]);
    await assert.rejects(f.business.discard(f.ctx, task.id, "pc", false));
    await assert.rejects(f.business.discard(f.ctx, task.id, "other", true));
    const otherOrg = await f.business.createInstitution(f.user, {
      name: "乙院",
    });
    const otherCtx = await f.business.context(f.user, otherOrg.id);
    await assert.rejects(f.business.discard(otherCtx, task.id, "pc", true));
    assert.equal((await f.business.events(f.ctx, task.id)).length, 1);
    await f.business.discard(f.ctx, task.id, "pc", true);
    await f.business.discard(f.ctx, task.id, "pc", true);
    assert.equal(
      (await f.db.query("SELECT * FROM tasks WHERE id=?", [task.id])).rows
        .length,
      0,
    );
    assert.equal(
      (await f.db.query("SELECT * FROM events WHERE task_id=?", [task.id])).rows
        .length,
      0,
    );
    assert.equal(
      (await f.db.query("SELECT * FROM audit WHERE object_id=?", [task.id]))
        .rows.length,
      0,
    );
    await assert.rejects(f.business.sync(f.ctx, task.id, "pc", [event]));
    assert.equal((await f.business.recordPage(f.ctx)).items.length, 0);
    assert.equal(
      (await f.business.preview(f.ctx, f.resident.id))!.startDate,
      plan.startDate,
    );
    const next = await f.business.claim(f.ctx, {
      residentId: f.resident.id,
      planId: plan.id,
      mealSplit: true,
      deviceId: "dev",
      terminalId: "pc",
    });
    assert.notEqual(next.id, task.id);
  } finally {
    await f.db.close();
  }
});

test("simulated completion remains in history and never advances real coverage", async () => {
  const f = await fixture();
  try {
    const plan = (await f.business.preview(f.ctx, f.resident.id))!;
    const task = await f.business.claim(f.ctx, {
      residentId: f.resident.id,
      planId: plan.id,
      mealSplit: true,
      deviceId: "dev",
      terminalId: "pc",
      executionMode: "simulator",
    });
    await f.business.begin(f.ctx, task.id, "pc");
    const makeEvent = (
      sequence: number,
      type: string,
      data: Record<string, unknown>,
    ): RuntimeEvent => ({
      id: randomUUID(),
      sequence,
      type,
      data,
      taskId: task.id,
      institutionId: f.org.id,
      terminalId: "pc",
      deviceId: "dev",
      receivedAt: new Date().toISOString(),
    });
    const events = plan.batches.map((b, i) =>
      makeEvent(i + 1, "batch.result", {
        batchId: b.id,
        status: "machine",
        count: b.target,
      }),
    );
    events.push(makeEvent(events.length + 1, "task.ended", {}));
    const completed = await f.business.sync(f.ctx, task.id, "pc", events);
    assert.equal(completed.task.status, "ended");
    assert.equal(completed.task.executionMode, "simulator");
    assert.equal(
      (await f.business.preview(f.ctx, f.resident.id))!.startDate,
      plan.startDate,
    );
  } finally {
    await f.db.close();
  }
});
test("history pagination preserves equal-time ordering without duplicating or deleting records", async () => {
  const f = await fixture();
  try {
    const plan = (await f.business.preview(f.ctx, f.resident.id))!;
    for (let i = 0; i < 53; i++) {
      const id = `task-${String(i).padStart(3, "0")}`,
        createdAt = "2026-10-04T08:00:00.000Z";
      const task = {
        id,
        institutionId: f.org.id,
        residentId: f.resident.id,
        deviceId: "dev",
        terminalId: "pc",
        plan,
        status: "ended",
        started: true,
        executionMode: "simulator",
        results: [],
        createdAt,
      };
      await f.db.query(
        "INSERT INTO tasks(id,institution_id,resident_id,device_id,terminal_id,status,started,body,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        [
          id,
          f.org.id,
          f.resident.id,
          "dev",
          "pc",
          "ended",
          1,
          JSON.stringify(task),
          createdAt,
        ],
      );
    }
    const first = await f.business.recordPage(f.ctx),
      second = await f.business.recordPage(f.ctx, first.nextCursor);
    assert.equal(first.items.length, 50);
    assert.equal(second.items.length, 3);
    assert.equal(second.nextCursor, undefined);
    assert.equal(
      new Set([...first.items, ...second.items].map((t) => t.id)).size,
      53,
    );
    assert.equal((await f.business.tasks(f.ctx)).length, 53);
  } finally {
    await f.db.close();
  }
});
test("institution isolation checks direct IDs and context", async () => {
  const f = await fixture();
  try {
    const other = await f.business.createInstitution(f.user, { name: "乙院" });
    const ctx = await f.business.context(f.user, other.id);
    await assert.rejects(
      () => f.business.resident(ctx, f.resident.id),
      (e: ApiError) => e.status === 404,
    );
    await assert.rejects(
      () =>
        f.business.context(
          { ...f.user, role: "staff", institutionId: f.org.id },
          other.id,
        ),
      (e: ApiError) => e.status === 403,
    );
  } finally {
    await f.db.close();
  }
});
test("half-to-whole resets only that prescription parameters", async () => {
  const f = await fixture();
  try {
    await f.business.parameters(f.ctx, f.rx.id, {
      version: 1,
      motor: 0.3,
      gate: 0.4,
      learning: false,
    });
    const other = await f.business.savePrescription(f.ctx, {
      ...f.rx,
      id: undefined,
      name: f.rx.name,
    });
    const changed = await f.business.savePrescription(
      f.ctx,
      {
        ...f.rx,
        form: "whole",
        doses: { morning: 1, noon: 0, evening: 1, bedtime: 0 },
      },
      f.rx.id,
    );
    assert.equal(changed.parameters.needsCalibration, true);
    assert.equal(other.parameters.version, 1);
    assert.equal(changed.parameters.version, 3);
  } finally {
    await f.db.close();
  }
});
test("concurrent claim has one owner, running task cannot be released", async () => {
  const f = await fixture();
  try {
    const plan = (await f.business.preview(f.ctx, f.resident.id))!;
    const input = {
      residentId: f.resident.id,
      planId: plan.id,
      mealSplit: true,
      deviceId: "dev-a",
      terminalId: "pc-a",
    };
    const outcomes = await Promise.allSettled([
      f.business.claim(f.ctx, input),
      f.business.claim(f.ctx, {
        ...input,
        deviceId: "dev-b",
        terminalId: "pc-b",
      }),
    ]);
    assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
    const task = (
      outcomes.find(
        (x) => x.status === "fulfilled",
      ) as PromiseFulfilledResult<any>
    ).value;
    await f.business.begin(f.ctx, task.id, task.terminalId);
    await assert.rejects(
      () => f.business.cancel(f.ctx, task.id, task.terminalId),
      (e: ApiError) => e.code === "STARTED",
    );
  } finally {
    await f.db.close();
  }
});
test("repeat event upload preserves one fact; ACK or target count alone not result", async () => {
  const f = await fixture();
  try {
    const plan = (await f.business.preview(f.ctx, f.resident.id))!;
    const task = await f.business.claim(f.ctx, {
      residentId: f.resident.id,
      planId: plan.id,
      mealSplit: true,
      deviceId: "dev",
      terminalId: "pc",
    });
    await f.business.begin(f.ctx, task.id, "pc");
    const event: RuntimeEvent = {
      id: "event1",
      sequence: 1,
      taskId: task.id,
      institutionId: f.org.id,
      terminalId: "pc",
      deviceId: "dev",
      type: "device.progress",
      data: { count: plan.batches[0].target },
      receivedAt: new Date().toISOString(),
    };
    await f.business.sync(f.ctx, task.id, "pc", [event]);
    await f.business.sync(f.ctx, task.id, "pc", [event]);
    assert.equal((await f.business.events(f.ctx, task.id)).length, 1);
    assert.equal((await f.business.task(f.ctx, task.id)).results.length, 0);
    await assert.rejects(
      () =>
        f.business.sync(f.ctx, task.id, "pc", [
          { ...event, data: { count: 1 } },
        ]),
      (e: ApiError) => e.code === "EVENT_CONFLICT",
    );
  } finally {
    await f.db.close();
  }
});
test("prescription version change invalidates an unstarted plan", async () => {
  const f = await fixture();
  try {
    const plan = (await f.business.preview(f.ctx, f.resident.id))!;
    await f.business.savePrescription(
      f.ctx,
      { ...f.rx, name: "修改后药名" },
      f.rx.id,
    );
    await assert.rejects(
      () =>
        f.business.claim(f.ctx, {
          residentId: f.resident.id,
          planId: plan.id,
          mealSplit: true,
          deviceId: "dev",
          terminalId: "pc",
        }),
      (e: ApiError) => e.code === "PLAN_CHANGED",
    );
  } finally {
    await f.db.close();
  }
});
test("staff cannot edit prescriptions without permission; bed uniqueness is institutional", async () => {
  const f = await fixture();
  try {
    const staff: Context = {
      user: {
        ...f.user,
        role: "staff",
        institutionId: f.org.id,
        permissions: [],
      },
      institutionId: f.org.id,
    };
    await assert.rejects(
      () => f.business.savePrescription(staff, { ...f.rx }),
      (e: ApiError) => e.status === 403,
    );
    await assert.rejects(() =>
      f.business.saveResident(f.ctx, { name: "另一住民", bed: " 201-1 " }),
    );
    const other = await f.business.createInstitution(f.user, { name: "乙院" });
    const otherCtx = await f.business.context(f.user, other.id);
    assert.equal(
      (
        await f.business.saveResident(otherCtx, {
          name: "乙住民",
          bed: "201-1",
        })
      ).bed,
      "201-1",
    );
  } finally {
    await f.db.close();
  }
});
