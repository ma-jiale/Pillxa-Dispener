// Isolated fictional data for the actual UI review. Never open production databases.
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { openDatabase, migrate } from "../apps/api/src/database.ts";
import { createBusiness } from "../apps/api/src/business.ts";
import {
  businessDate,
  dateAdd,
} from "../packages/dispensing-policy/src/index.ts";
import type { Task } from "../packages/contracts/src/model.ts";
const db = await openDatabase(
  `sqlite:${resolve(".var/ui-modern-central.sqlite")}`,
);
await migrate(db);
const service = createBusiness(db);
if (await service.setupRequired()) {
  await service.bootstrap({
    username: "ui-review",
    name: "演示工作人员",
    password: "UI-Review-only-2026",
  });
  const login = await service.login("ui-review", "UI-Review-only-2026");
  const org = await service.createInstitution(login.user, {
    name: "晴和养老院 · 演示",
  });
  const ctx = await service.context(login.user, org.id),
    today = businessDate(org.settings.timezone);
  const names = [
    "陈秀兰",
    "王建国",
    "李淑芬",
    "张国华",
    "刘桂英",
    "赵文清",
    "周玉琴",
    "吴志远",
    "徐慧芳",
    "孙德明",
    "黄美玲",
    "郑荣华",
  ];
  for (let i = 0; i < names.length; i++) {
    const resident = await service.saveResident(ctx, {
      name: names[i],
      bed: `A楼-${201 + Math.floor(i / 2)}-${(i % 2) + 1}`,
      rfid: [`0000AB${String(i + 10).padStart(2, "0")}`],
    });
    const prescriptions = [
      {
        name: "维生素 B1片",
        specification: "10 mg",
        form: "whole",
        meal: "after",
        doses: { morning: 1, noon: 0, evening: 1, bedtime: 0 },
      },
      {
        name: "维生素 C片",
        specification: "100 mg",
        form: "half",
        meal: "none",
        doses: { morning: 0.5, noon: 0, evening: 0, bedtime: 0 },
      },
      {
        name: "钙片",
        specification: "演示规格",
        form: "whole",
        meal: "before",
        doses: { morning: 1, noon: 0, evening: 0, bedtime: 0 },
      },
    ];
    for (const p of prescriptions.slice(0, i === 0 ? 3 : (i % 3) + 1))
      await service.savePrescription(ctx, {
        ...p,
        residentId: resident.id,
        unit: "片",
        startDate: dateAdd(today, -60),
      });
    const plan = (await service.preview(ctx, resident.id))!;
    // These are fabricated review records, kept only in the explicitly named review database.
    for (let j = 0; j < (i === 0 ? 53 : 2); j++) {
      const id = randomUUID(),
        createdAt = new Date(
          Date.now() - (j + i) * 86400000 - 5400000,
        ).toISOString();
      const results = plan.batches.map((b, index) => ({
        batchId: b.id,
        status: (i === 2 && index === 0
          ? "unknown"
          : i === 3 && index === 0
            ? "manual"
            : "machine") as "machine" | "manual" | "unknown",
        count: i === 2 && index === 0 ? 2 : b.target,
        ...(i === 3 && index === 0
          ? { reason: "现场核对后人工补齐，演示数据" }
          : {}),
      }));
      const startDate = dateAdd(today, -7 - j * 7);
      const task: Task = {
        id,
        institutionId: org.id,
        residentId: resident.id,
        plan: {
          ...plan,
          startDate,
          endDate: dateAdd(startDate, 6),
          dates: plan.dates.map((_, index) => dateAdd(startDate, index)),
        },
        deviceId: `${(i % 3) + 1}号摆药机`,
        terminalId: "ui-review-history",
        userId: login.user.id,
        status: "ended",
        started: true,
        executionMode: "simulator",
        results,
        createdAt,
        endedAt: createdAt,
        revision: 1,
      };
      await db.query(
        "INSERT INTO tasks(id,institution_id,resident_id,device_id,terminal_id,status,started,body,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        [
          id,
          org.id,
          resident.id,
          task.deviceId,
          task.terminalId,
          task.status,
          1,
          JSON.stringify(task),
          createdAt,
        ],
      );
    }
  }
  await service.saveUser(ctx, {
    username: "review-nurse",
    name: "林晓梅",
    password: "UI-Review-only-2026",
    role: "staff",
    permissions: [],
  });
  await service.saveUser(ctx, {
    username: "review-admin",
    name: "周主管",
    password: "UI-Review-only-2026",
    role: "admin",
    permissions: [],
  });
  console.log("Isolated UI review data created.");
} else console.log("Isolated UI review data already exists.");
await db.close();
