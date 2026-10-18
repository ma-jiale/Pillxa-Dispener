// Business defaults and labels; transport types are generated from main.tsp.
export type {
  Slot,
  Meal,
  Role,
  Permission,
  Settings,
  Institution,
  User,
  Resident,
  Parameters,
  Prescription,
  Batch,
  Plan,
  BatchResult,
  ExecutionPhase,
  ExecutionSnapshot,
  Task,
  RuntimeEvent,
  RecordFilters,
  PlanningQueueItem,
} from "../generated/models.ts";
import type { Settings, Slot, Meal } from "../generated/models.ts";
export const defaultSettings: Settings = {
  version: 1,
  timezone: "Asia/Shanghai",
  days: 7,
  startMode: "today",
  reminderDays: 2,
  mealSplit: true,
  rows: ["morning", "noon", "evening"],
};
export const slotLabels: Record<Slot, string> = {
  morning: "早晨",
  noon: "中午",
  evening: "晚上",
  bedtime: "睡前",
};
export const mealLabels: Record<Meal, string> = {
  before: "饭前",
  after: "饭后",
  with: "随餐",
  none: "无餐食限制",
};
// Shared label identity and physical layout, used by PDF export and on-screen preview.
export const labelLayout = {
  columns: 8,
  rows: 12,
  widthMm: 22,
  gapMm: 2,
  leftMm: 10,
  topMm: 5,
  qrMm: 14,
};
export const residentBarcode = (id: string) => `PX:${id}`;
