import { createHash } from 'node:crypto';
import type {
  Batch,
  Plan,
  Prescription,
  Resident,
  Settings,
  Slot,
} from '../../contracts/src/model.ts';
export class PlanError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
export function dateAdd(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date)
    throw new PlanError('INVALID_DATE', '日期格式无效');
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}
export function businessDate(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day']
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join('-');
}
export function validateSettings(settings: Settings): void {
  if (!Number.isInteger(settings.days) || settings.days < 1 || settings.days > 7)
    throw new PlanError('DAYS', '准备天数必须为 1–7 天');
  if (
    !Number.isInteger(settings.reminderDays) ||
    settings.reminderDays < 0 ||
    settings.reminderDays > 30
  )
    throw new PlanError('REMINDER', '提醒阈值必须为 0–30 天');
  if (!['today', 'tomorrow'].includes(settings.startMode))
    throw new PlanError('START_MODE', '起点设置无效');
  if (
    settings.rows.length < 3 ||
    settings.rows.length > 4 ||
    new Set(settings.rows).size !== settings.rows.length ||
    !['morning', 'noon', 'evening'].every((slot) => settings.rows.includes(slot as Slot)) ||
    settings.rows.some((slot) => !['morning', 'noon', 'evening', 'bedtime'].includes(slot))
  )
    throw new PlanError('LAYOUT', '早晨、中午、晚上必须各有一行，可另外启用睡前');
  try {
    businessDate(settings.timezone);
  } catch {
    throw new PlanError('TIMEZONE', '机构时区无效');
  }
}
export function validatePrescription(rx: Prescription, rows: Slot[]): void {
  if (!rx.name.trim() || !rx.specification.trim() || !rx.unit.trim())
    throw new PlanError('REQUIRED', '药名、规格和单位必填');
  dateAdd(rx.startDate, 0);
  if (rx.endDate) {
    dateAdd(rx.endDate, 0);
    if (rx.endDate < rx.startDate) throw new PlanError('COURSE', '结束日期不能早于开始日期');
  }
  if (
    !['whole', 'half'].includes(rx.form) ||
    !['before', 'after', 'with', 'none'].includes(rx.meal)
  )
    throw new PlanError('FORM', '投料形态或餐食关系无效');
  let positive = false;
  for (const slot of ['morning', 'noon', 'evening', 'bedtime'] as Slot[]) {
    const value = rx.doses[slot];
    if (!Number.isFinite(value) || value < 0)
      throw new PlanError('DOSE', `${rx.name}：用量必须为非负数`);
    if (value === 0) continue;
    positive = true;
    if (!rows.includes(slot))
      throw new PlanError(
        'DISABLED_SLOT',
        `${rx.name}：需要启用${slot === 'bedtime' ? '睡前' : slot}位置`,
      );
    if (rx.form === 'half' ? value !== 0.5 : !Number.isInteger(value))
      throw new PlanError('PARTICLE', `${rx.name}：半片投料每次支持 0.5 片，整片投料支持整数片`);
    if ((rx.form === 'half' ? 1 : value) > 255)
      throw new PlanError('CAPACITY', `${rx.name}：单格颗粒数超过设备能力`);
  }
  if (!positive) throw new PlanError('EMPTY', '至少一个时段用量必须大于零');
}
export interface PlanInput {
  institutionId: string;
  resident: Resident;
  prescriptions: Prescription[];
  settings: Settings;
  lastCompleteEnd?: string | null;
  today?: string;
  mealSplit?: boolean;
  now?: string;
}
export function generatePlan(input: PlanInput): Plan | null {
  const { settings, resident } = input;
  validateSettings(settings);
  if (!resident.active) throw new PlanError('INACTIVE', '住民已离院');
  if (resident.institutionId !== input.institutionId)
    throw new PlanError('INSTITUTION', '住民不属于当前机构');
  const today = input.today ?? businessDate(settings.timezone);
  dateAdd(today, 0);
  const all = input.prescriptions.filter((rx) => rx.active);
  for (const rx of all) {
    if (rx.institutionId !== input.institutionId || rx.residentId !== resident.id)
      throw new PlanError('INSTITUTION', '处方归属不匹配');
    validatePrescription(rx, settings.rows);
  }
  let start =
    input.lastCompleteEnd && input.lastCompleteEnd >= today
      ? dateAdd(input.lastCompleteEnd, 1)
      : dateAdd(today, settings.startMode === 'tomorrow' ? 1 : 0);
  const candidates = all.filter((rx) => !rx.endDate || rx.endDate >= start);
  if (!candidates.length) return null;
  if (candidates.every((rx) => rx.startDate > start))
    start = candidates.map((rx) => rx.startDate).sort()[0];
  let dates = Array.from({ length: settings.days }, (_, i) => dateAdd(start, i));
  const participating = candidates.filter(
    (rx) => rx.startDate <= dates.at(-1)! && (!rx.endDate || rx.endDate >= start),
  );
  if (!participating.length) return null;
  let lastUsed = -1;
  for (let i = 0; i < dates.length; i++)
    if (
      participating.some(
        (rx) => rx.startDate <= dates[i] && (!rx.endDate || rx.endDate >= dates[i]),
      )
    )
      lastUsed = i;
  dates = dates.slice(0, lastUsed + 1);
  const split = input.mealSplit ?? settings.mealSplit;
  const before = participating.some((rx) => rx.meal === 'before');
  const other = participating.some((rx) => rx.meal !== 'before');
  const two = split && before && other;
  const trays = two
    ? [
        { number: 0, label: '饭前用药盘' },
        { number: 1, label: '其他餐食关系用药盘' },
      ]
    : [{ number: 0, label: split && before ? '饭前用药盘' : '本次用药盘' }];
  const batches: Batch[] = participating
    .map((rx) => {
      const matrix = settings.rows.map((slot) =>
        Array.from({ length: 7 }, (_, i) => {
          const day = dates[i];
          return day && rx.startDate <= day && (!rx.endDate || rx.endDate >= day)
            ? rx.form === 'half' && rx.doses[slot] > 0
              ? 1
              : rx.doses[slot]
            : 0;
        }),
      );
      const target = matrix.flat().reduce((sum, value) => sum + value, 0);
      return {
        id: rx.id + ':' + (two && rx.meal !== 'before' ? 1 : 0),
        prescriptionId: rx.id,
        prescriptionVersion: rx.version,
        name: rx.name,
        specification: rx.specification,
        image: rx.image,
        form: rx.form,
        tray: two && rx.meal !== 'before' ? 1 : 0,
        meal: rx.meal,
        matrix,
        target,
        originalTablets: target * (rx.form === 'half' ? 0.5 : 1),
        parameters: { ...rx.parameters },
      };
    })
    .filter((batch) => batch.target > 0)
    .sort((a, b) => a.tray - b.tray || a.prescriptionId.localeCompare(b.prescriptionId));
  if (!batches.length) return null;
  const sourceVersions = Object.fromEntries(participating.map((rx) => [rx.id, rx.version]));
  const plan = {
    institutionId: input.institutionId,
    residentId: resident.id,
    resident: { name: resident.name, bed: resident.bed },
    settings: structuredClone(settings),
    settingsVersion: settings.version,
    startDate: start,
    endDate: dates.at(-1)!,
    dates,
    rows: [...settings.rows],
    mealSplit: split,
    trays,
    batches,
    totalParticles: batches.reduce((sum, batch) => sum + batch.target, 0),
    sourceVersions,
  };
  const id = createHash('sha256').update(JSON.stringify(plan)).digest('hex');
  return { ...plan, id, createdAt: input.now ?? new Date().toISOString() };
}
