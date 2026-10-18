import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan, dateAdd, businessDate } from '../../packages/dispensing-policy/src/index.ts';
import { defaultSettings } from '../../packages/contracts/src/model.ts';
import type { Prescription } from '../../packages/contracts/src/model.ts';
import type { PlanInput } from '../../packages/dispensing-policy/src/index.ts';
const rx = (overrides: Partial<Prescription> = {}): Prescription => ({
  id: 'rx-1',
  institutionId: 'a',
  residentId: 'r',
  version: 1,
  name: '示例药物',
  specification: '10 mg',
  unit: '片',
  image: null,
  form: 'whole',
  doses: { morning: 1, noon: 0, evening: 2, bedtime: 0 },
  meal: 'none',
  startDate: '2026-10-04',
  endDate: null,
  active: true,
  parameters: { version: 1, motor: 0.2, gate: 0.7, learning: false, needsCalibration: true },
  ...overrides,
});
const input = (overrides: Partial<PlanInput> = {}): PlanInput => ({
  institutionId: 'a',
  resident: {
    id: 'r',
    institutionId: 'a',
    name: '住民甲',
    bed: '201-1',
    active: true,
    photo: null,
    rfid: [],
    version: 1,
  },
  prescriptions: [rx()],
  settings: { ...defaultSettings, days: 3 },
  today: '2026-10-04',
  ...overrides,
});
test('A09: dates and integer whole-particle matrix', () => {
  const p = generatePlan(input())!;
  assert.deepEqual(p.dates, ['2026-10-04', '2026-10-05', '2026-10-06']);
  assert.equal(p.totalParticles, 9);
  assert.deepEqual(p.batches[0].matrix[2], [2, 2, 2, 0, 0, 0, 0]);
});
test('A59: 21 half particles mean 10.5 tablets', () => {
  const p = generatePlan(
    input({
      settings: { ...defaultSettings },
      prescriptions: [
        rx({ form: 'half', doses: { morning: 0.5, noon: 0.5, evening: 0.5, bedtime: 0 } }),
      ],
    }),
  )!;
  assert.equal(p.totalParticles, 21);
  assert.equal(p.batches[0].originalTablets, 10.5);
});
test('A15: early preparation follows completed common cycle', () => {
  assert.equal(generatePlan(input({ lastCompleteEnd: '2026-10-07' }))!.startDate, '2026-10-08');
});
test('A14: missed preparation follows saved start rule', () => {
  assert.equal(
    generatePlan(
      input({
        lastCompleteEnd: '2026-09-30',
        settings: { ...defaultSettings, startMode: 'tomorrow' },
      }),
    )!.startDate,
    '2026-10-05',
  );
});
test('A13: all future prescriptions use earliest effective date', () => {
  assert.equal(
    generatePlan(input({ prescriptions: [rx({ startDate: '2026-10-06' })] }))!.startDate,
    '2026-10-06',
  );
});
test('A82: finite course trims trailing empty dates', () => {
  assert.equal(
    generatePlan(
      input({ settings: { ...defaultSettings }, prescriptions: [rx({ endDate: '2026-10-06' })] }),
    )!.dates.length,
    3,
  );
});
test('future drug retains its date column', () => {
  const p = generatePlan(
    input({ prescriptions: [rx(), rx({ id: 'rx-2', startDate: '2026-10-06' })] }),
  )!;
  assert.deepEqual(p.batches[1].matrix[0], [0, 0, 1, 0, 0, 0, 0]);
});
test('A55/A56: meal toggle and bedtime are distinct', () => {
  const base = input({
    settings: { ...defaultSettings, rows: ['bedtime', 'morning', 'evening', 'noon'] },
    prescriptions: [
      rx({ meal: 'before' }),
      rx({ id: 'rx-2', meal: 'with', doses: { morning: 0, noon: 0, evening: 0, bedtime: 1 } }),
    ],
  });
  const split = generatePlan(base)!;
  assert.equal(split.trays.length, 2);
  assert.equal(split.batches[1].matrix[0][0], 1);
  assert.equal(generatePlan({ ...base, mealSplit: false })!.trays.length, 1);
});
test('invalid half dose cannot silently truncate', () => {
  assert.throws(() => generatePlan(input({ prescriptions: [rx({ form: 'half' })] })), /半片投料/);
});
test('cross institution cannot create a plan', () => {
  assert.throws(() => generatePlan(input({ institutionId: 'b' })), /不属于/);
});
test('date across month boundary and timezone', () => {
  assert.equal(dateAdd('2026-12-31', 1), '2027-01-01');
  assert.equal(businessDate('Asia/Shanghai', new Date('2026-10-03T17:00:00Z')), '2026-10-04');
});
test('disabled bedtime is explicit and malformed dates fail', () => {
  assert.throws(
    () =>
      generatePlan(
        input({ prescriptions: [rx({ doses: { morning: 1, noon: 0, evening: 0, bedtime: 1 } })] }),
      ),
    /睡前/,
  );
  assert.throws(() => dateAdd('2026-02-30', 1), /日期格式/);
});
test('plan identity changes with source version, not generation clock', () => {
  const a = generatePlan(input({ now: 'a' }))!;
  const b = generatePlan(input({ now: 'b' }))!;
  assert.equal(a.id, b.id);
  assert.notEqual(a.id, generatePlan(input({ prescriptions: [rx({ version: 2 })] }))!.id);
});
