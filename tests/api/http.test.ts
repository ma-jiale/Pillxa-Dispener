import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase, migrate } from "../../apps/api/src/database.ts";
import { createApp } from "../../apps/api/src/app.ts";
async function fixture() {
  const db = await openDatabase(":memory:");
  await migrate(db);
  const { app, service } = await createApp(db);
  await service.bootstrap({
    username: "test",
    name: "测试管理员",
    password: "Temporary-test-only",
  });
  const login = await service.login("test", "Temporary-test-only");
  const org = await service.createInstitution(login.user, { name: "测试机构" });
  const headers = {
    authorization: `Bearer ${login.token}`,
    "x-institution-id": org.id,
  };
  return {
    db,
    app,
    service,
    headers,
    org,
    login,
    ctx: await service.context(login.user, org.id),
    close: async () => {
      await app.close();
      await db.close();
    },
  };
}
test("HTTP discard requires explicit confirmation and deletes only the owned task", async () => {
  const f = await fixture();
  try {
    const resident = await f.service.saveResident(f.ctx, {
      name: "删除测试",
      bed: "301",
    });
    await f.service.savePrescription(f.ctx, {
      residentId: resident.id,
      name: "测试药",
      specification: "10mg",
      unit: "片",
      form: "whole",
      doses: { morning: 1, noon: 0, evening: 0, bedtime: 0 },
      meal: "none",
      startDate: "2026-01-01",
    });
    const plan = (await f.service.preview(f.ctx, resident.id))!;
    const task = await f.service.claim(f.ctx, {
      residentId: resident.id,
      planId: plan.id,
      mealSplit: true,
      deviceId: "test-machine",
      terminalId: "test-pc",
    });
    await f.service.begin(f.ctx, task.id, "test-pc");
    const request = (payload: { terminalId: string; confirmed?: boolean }) =>
      f.app.inject({
        method: "POST",
        url: `/api/tasks/${task.id}/discard`,
        headers: f.headers,
        payload,
      });
    assert.equal((await request({ terminalId: "test-pc" })).statusCode, 400);
    assert.equal(
      (await request({ terminalId: "other", confirmed: true })).statusCode,
      403,
    );
    assert.equal(
      (await request({ terminalId: "test-pc", confirmed: true })).statusCode,
      200,
    );
    assert.equal(
      (await request({ terminalId: "test-pc", confirmed: true })).statusCode,
      200,
    );
    assert.equal((await f.service.recordPage(f.ctx)).items.length, 0);
  } finally {
    await f.close();
  }
});

test("HTTP contract validates malformed input before business writes", async () => {
  const f = await fixture();
  try {
    const malformed = await f.app.inject({
      method: "POST",
      url: "/api/prescriptions",
      headers: f.headers,
      payload: { name: "缺少剂量" },
    });
    assert.equal(malformed.statusCode, 400);
    assert.equal(malformed.json().code, "INPUT");
    const login = await f.app.inject({
      method: "POST",
      url: "/api/login",
      payload: { username: "test" },
    });
    assert.equal(login.statusCode, 400);
    assert.equal((await f.service.prescriptions(f.ctx)).length, 0);
  } finally {
    await f.close();
  }
});
test("HTTP allows settings PUT from the Windows frontend origin", async () => {
  const f = await fixture();
  try {
    const origin = "http://tauri.localhost";
    const preflight = await f.app.inject({
      method: "OPTIONS",
      url: "/api/settings",
      headers: {
        origin,
        "access-control-request-method": "PUT",
        "access-control-request-headers":
          "content-type,authorization,x-institution-id",
      },
    });
    assert.equal(preflight.statusCode, 204);
    assert.equal(preflight.headers["access-control-allow-origin"], origin);
    assert.match(
      String(preflight.headers["access-control-allow-methods"]),
      /\bPUT\b/,
    );
    const response = await f.app.inject({
      method: "PUT",
      url: "/api/settings",
      headers: { ...f.headers, origin },
      payload: { ...f.org.settings, days: 6 },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.headers["access-control-allow-origin"], origin);
    assert.equal((await f.service.institution(f.ctx)).settings.days, 6);
  } finally {
    await f.close();
  }
});
test("HTTP labels create a real two-page A4 PDF with Chinese names", async () => {
  const f = await fixture();
  try {
    const a = await f.service.saveResident(f.ctx, {
        name: "示例住民甲",
        bed: "201-1",
      }),
      b = await f.service.saveResident(f.ctx, {
        name: "示例住民乙",
        bed: "201-2",
      });
    const response = await f.app.inject({
      method: "POST",
      url: "/api/labels",
      headers: f.headers,
      payload: { residentIds: [a.id, b.id], copies: 50 },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.match(
      response.headers["content-type"] as string,
      /application\/pdf/,
    );
    assert.equal(response.rawPayload.subarray(0, 4).toString(), "%PDF");
    assert.equal(
      [...response.rawPayload.toString("latin1").matchAll(/\/Type \/Page\b/g)]
        .length,
      2,
    );
  } finally {
    await f.close();
  }
});
test("HTTP institution context rejects direct cross-institution label IDs", async () => {
  const f = await fixture();
  try {
    const other = await f.service.createInstitution(f.login.user, {
      name: "另一机构",
    });
    const resident = await f.service.saveResident(
      await f.service.context(f.login.user, other.id),
      {
        name: "另一住民",
        bed: "1",
      },
    );
    const response = await f.app.inject({
      method: "POST",
      url: "/api/labels",
      headers: f.headers,
      payload: { residentIds: [resident.id], copies: 1 },
    });
    assert.equal(response.statusCode, 404);
  } finally {
    await f.close();
  }
});
