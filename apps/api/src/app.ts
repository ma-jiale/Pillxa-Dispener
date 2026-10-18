import Fastify from "fastify";
import cors from "@fastify/cors";
import { createBusiness, ApiError } from "./business.ts";
import type { Context } from "./business.ts";
import type { Database } from "./database.ts";
import type {
  User,
  Settings,
  RuntimeEvent,
  RecordFilters,
} from "../../../packages/contracts/src/model.ts";
import { labelsPdf } from "./labels.ts";
import { PlanError } from "../../../packages/dispensing-policy/src/index.ts";
import { registerContract } from "./http-contract.ts";
export async function createApp(db: Database) {
  const app = Fastify({ logger: false, bodyLimit: 15 * 1024 * 1024 });
  const service = createBusiness(db);
  registerContract(app);
  await app.register(cors, {
    origin: (origin, callback) =>
      callback(
        null,
        !origin ||
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
          [
            "tauri://localhost",
            "http://tauri.localhost",
            "https://tauri.localhost",
          ].includes(origin),
      ),
    allowedHeaders: ["content-type", "authorization", "x-institution-id"],
    methods: ["GET", "HEAD", "POST", "PUT", "OPTIONS"],
  });
  app.setErrorHandler((error, request, reply) => {
    if (error && typeof error === "object" && "validation" in error)
      return reply
        .code(400)
        .send({ code: "INPUT", message: "输入格式不正确，请检查必填项和数值" });
    if (error instanceof ApiError || error instanceof PlanError)
      return reply
        .code(error instanceof ApiError ? error.status : 400)
        .send({ code: error.code, message: error.message });
    if (
      /UNIQUE|unique|duplicate/i.test(
        error instanceof Error ? error.message : String(error),
      )
    )
      return reply.code(409).send({
        code: "CONFLICT",
        message: "账号、床位或记录身份已存在，请核对",
      });
    request.log.error(error);
    reply
      .code(500)
      .send({ code: "INTERNAL", message: "保存失败，请重试或导出诊断" });
  });
  const auth = async (request: any): Promise<User> => {
    const authorization = request.headers.authorization ?? "";
    if (!authorization.startsWith("Bearer "))
      throw new ApiError(401, "LOGIN", "请先登录");
    return service.authenticate(authorization.slice(7));
  };
  const context = async (request: any): Promise<Context> =>
    service.context(
      await auth(request),
      String(request.headers["x-institution-id"] ?? ""),
    );
  app.get("/api/health", async () => ({
    ok: true,
    version: "0.2.1",
    storage: db.dialect,
  }));
  app.get("/api/setup", async () => ({
    required: await service.setupRequired(),
  }));
  app.post("/api/setup", async (request, reply) => {
    await service.bootstrap(request.body as Record<string, unknown>);
    return reply.code(201).send({ ok: true });
  });
  app.post("/api/login", async (request) => {
    const input = request.body as {
      username: string;
      password: string;
    };
    return service.login(
      String(input.username ?? ""),
      String(input.password ?? ""),
    );
  });
  app.post("/api/logout", async (request) => {
    await service.logout(String(request.headers.authorization ?? "").slice(7));
    return { ok: true };
  });
  app.get("/api/me", async (request) => ({ user: await auth(request) }));
  app.get("/api/institutions", async (request) =>
    service.institutions(await auth(request)),
  );
  app.post("/api/institutions", async (request, reply) =>
    reply
      .code(201)
      .send(
        await service.createInstitution(
          await auth(request),
          request.body as Record<string, unknown>,
        ),
      ),
  );
  app.get("/api/workspace", async (request) => {
    const ctx = await context(request);
    const [institution, residents, prescriptions, tasks] = await Promise.all([
      service.institution(ctx),
      service.residents(ctx),
      service.prescriptions(ctx),
      service.tasks(ctx, db, { limit: 100, includeActive: true }),
    ]);
    return { institution, residents, prescriptions, tasks };
  });
  app.get("/api/planning/queue", async (request) =>
    service.planningQueue(await context(request)),
  );
  app.get("/api/users", async (request) =>
    service.users(await context(request)),
  );
  app.post("/api/users", async (request) =>
    service.saveUser(
      await context(request),
      request.body as Record<string, unknown>,
    ),
  );
  app.put<{
    Params: {
      id: string;
    };
  }>("/api/users/:id", async (request) =>
    service.saveUser(
      await context(request),
      request.body as Record<string, unknown>,
      request.params.id,
    ),
  );
  app.post("/api/residents", async (request) =>
    service.saveResident(
      await context(request),
      request.body as Record<string, unknown>,
    ),
  );
  app.put<{
    Params: {
      id: string;
    };
  }>("/api/residents/:id", async (request) =>
    service.saveResident(
      await context(request),
      request.body as Record<string, unknown>,
      request.params.id,
    ),
  );
  app.post("/api/prescriptions", async (request) =>
    service.savePrescription(
      await context(request),
      request.body as Record<string, unknown>,
    ),
  );
  app.put<{
    Params: {
      id: string;
    };
  }>("/api/prescriptions/:id", async (request) =>
    service.savePrescription(
      await context(request),
      request.body as Record<string, unknown>,
      request.params.id,
    ),
  );
  app.put("/api/settings", async (request) =>
    service.settings(await context(request), request.body as Settings),
  );
  app.post("/api/plans/preview", async (request) => {
    const input = request.body as {
      residentId: string;
      mealSplit?: boolean;
    };
    return {
      plan: await service.preview(
        await context(request),
        input.residentId,
        input.mealSplit,
      ),
    };
  });
  app.post("/api/tasks/claim", async (request) =>
    service.claim(await context(request), request.body as any),
  );
  app.post<{
    Params: {
      id: string;
    };
  }>("/api/tasks/:id/begin", async (request) =>
    service.begin(
      await context(request),
      request.params.id,
      (request.body as any).terminalId,
    ),
  );
  app.post<{
    Params: {
      id: string;
    };
  }>("/api/tasks/:id/cancel", async (request) =>
    service.cancel(
      await context(request),
      request.params.id,
      (request.body as any).terminalId,
    ),
  );
  app.post<{
    Params: {
      id: string;
    };
  }>("/api/tasks/:id/discard", async (request) => {
    const input = request.body as { terminalId: string; confirmed: boolean };
    return service.discard(
      await context(request),
      request.params.id,
      input.terminalId,
      input.confirmed,
    );
  });
  app.post<{ Params: { id: string } }>(
    "/api/tasks/:id/sync",
    async (request) => {
      const input = request.body as {
        terminalId: string;
        events: RuntimeEvent[];
      };
      return service.sync(
        await context(request),
        request.params.id,
        input.terminalId,
        input.events,
      );
    },
  );
  app.get<{
    Params: {
      id: string;
    };
  }>("/api/tasks/:id/events", async (request) =>
    service.events(await context(request), request.params.id),
  );
  app.put<{
    Params: {
      id: string;
    };
  }>("/api/prescriptions/:id/parameters", async (request) =>
    service.parameters(
      await context(request),
      request.params.id,
      request.body as any,
    ),
  );
  app.get<{ Querystring: RecordFilters & { before?: string } }>(
    "/api/records",
    async (request) =>
      service.recordPage(
        await context(request),
        request.query.before,
        request.query,
      ),
  );
  app.get<{ Querystring: RecordFilters }>(
    "/api/records/export",
    async (request, reply) => {
      const ctx = await context(request);
      service.require(ctx, "export");
      const tasks = await service.tasks(ctx, db, request.query);
      return reply
        .header(
          "Content-Disposition",
          'attachment; filename="pillxai-records.json"',
        )
        .type("application/json")
        .send(
          JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              institutionId: ctx.institutionId,
              fieldNote:
                "plan 表示目标；results 表示设备/人工结果，摆药不代表已服药",
              tasks,
            },
            null,
            2,
          ),
        );
    },
  );
  app.get<{
    Params: {
      id: string;
    };
  }>("/api/tasks/:id/samples/export", async (request, reply) => {
    const ctx = await context(request);
    service.require(ctx, "export");
    return reply
      .header(
        "Content-Disposition",
        'attachment; filename="pillxai-events.json"',
      )
      .type("application/json")
      .send(
        JSON.stringify(
          {
            institutionId: ctx.institutionId,
            events: await service.events(ctx, request.params.id),
          },
          null,
          2,
        ),
      );
  });
  app.post("/api/labels", async (request, reply) => {
    const ctx = await context(request);
    service.require(ctx, "export");
    const input = request.body as {
      residentIds: string[];
      copies: number;
    };
    if (
      !Array.isArray(input.residentIds) ||
      !Number.isInteger(input.copies) ||
      input.copies < 1 ||
      input.copies > 50
    )
      throw new ApiError(400, "LABELS", "标签选择或份数无效");
    const all = await service.residents(ctx);
    const residents = input.residentIds.map(
      (id) =>
        all.find((r) => r.id === id) ??
        (() => {
          throw new ApiError(404, "RESIDENT", "住民不存在");
        })(),
    );
    if (residents.length * input.copies > 2000)
      throw new ApiError(400, "LABELS", "单次最多导出 2000 张");
    const pdf = await labelsPdf(residents, input.copies);
    return reply
      .type("application/pdf")
      .header(
        "Content-Disposition",
        'attachment; filename="pillxai-labels.pdf"',
      )
      .send(pdf);
  });
  app.get("/api/releases/latest", async (request) => {
    await auth(request);
    return { available: false, message: "尚未发布可用更新", version: "0.2.1" };
  });
  app.post("/api/demo", async (request) => {
    const ctx = await context(request);
    service.admin(ctx);
    const existing = await service.residents(ctx);
    if (existing.length)
      throw new ApiError(409, "DEMO", "仅空机构可以添加示例资料");
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    for (let i = 1; i <= 4; i++) {
      const resident = await service.saveResident(ctx, {
        name: `示例住民 ${String(i).padStart(2, "0")}`,
        bed: `示例-${201 + i}`,
      });
      await service.savePrescription(ctx, {
        residentId: resident.id,
        name: "示例药物 A",
        specification: "10 mg",
        unit: "片",
        form: "whole",
        doses: { morning: 1, noon: 0, evening: 1, bedtime: 0 },
        meal: "before",
        startDate: date,
      });
      await service.savePrescription(ctx, {
        residentId: resident.id,
        name: "示例药物 B",
        specification: "20 mg",
        unit: "片",
        form: "half",
        doses: { morning: 0.5, noon: 0.5, evening: 0.5, bedtime: 0 },
        meal: "after",
        startDate: date,
      });
    }
    return { ok: true };
  });
  return { app, service };
}
