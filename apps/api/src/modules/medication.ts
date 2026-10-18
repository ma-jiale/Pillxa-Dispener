import { randomUUID } from 'node:crypto';
import type { Database, SqlConnection } from '../database.ts';
import type { Prescription } from '../../../../packages/contracts/src/model.ts';
import { validatePrescription } from '../../../../packages/dispensing-policy/src/index.ts';
import { fail, body, now, string } from '../core.ts';
import type { Context } from '../core.ts';
import type { Identity } from './identity.ts';
import type { Residents } from './residents.ts';
export class Medication {
  db: Database;
  identity: Identity;
  residents: Residents;
  constructor(db: Database, identity: Identity, residents: Residents) {
    this.db = db;
    this.identity = identity;
    this.residents = residents;
  }
  async prescriptions(
    ctx: Context,
    residentId?: string,
    tx: SqlConnection = this.db,
  ): Promise<Prescription[]> {
    return (
      await tx.query(
        'SELECT body FROM prescriptions WHERE institution_id=?' +
          (residentId ? ' AND resident_id=?' : ''),
        residentId ? [ctx.institutionId, residentId] : [ctx.institutionId],
      )
    ).rows.map(body<Prescription>);
  }
  async savePrescription(
    ctx: Context,
    input: Record<string, unknown>,
    id?: string,
  ): Promise<Prescription> {
    this.identity.require(ctx, 'prescriptions');
    const old = id
      ? ((await this.prescriptions(ctx)).find((rx) => rx.id === id) ??
        fail(404, 'PRESCRIPTION', '用药条目不存在'))
      : null;
    const residentId = old?.residentId ?? string(input.residentId);
    await this.residents.resident(ctx, residentId);
    if (old && input.version !== old.version) fail(409, 'VERSION', '处方已被修改，请刷新');
    const org = await this.identity.institution(ctx);
    const form = input.form === 'half' ? 'half' : 'whole';
    const name = string(input.name, 100);
    const specification = string(input.specification, 100);
    const reset =
      !!old && (old.name !== name || old.specification !== specification || old.form !== form);
    const rx: Prescription = {
      id: old?.id ?? randomUUID(),
      institutionId: ctx.institutionId,
      residentId,
      version: (old?.version ?? 0) + 1,
      name,
      specification,
      unit: string(input.unit ?? '片', 20),
      image: typeof input.image === 'string' ? input.image : (old?.image ?? null),
      form,
      doses: input.doses as Prescription['doses'],
      meal: input.meal as Prescription['meal'],
      startDate: string(input.startDate, 10),
      endDate: input.endDate ? string(input.endDate, 10) : null,
      active: input.active !== false,
      parameters:
        old && !reset
          ? old.parameters
          : {
              version: reset ? old!.parameters.version + 1 : 1,
              motor: 0.2,
              gate: 0.7,
              learning: false,
              needsCalibration: true,
            },
    };
    validatePrescription(rx, org.settings.rows);
    await this.db.transaction(async (tx) => {
      if (old) {
        const result = await tx.query(
          'UPDATE prescriptions SET version=?,body=? WHERE id=? AND institution_id=? AND version=? AND body=?',
          [
            rx.version,
            JSON.stringify(rx),
            rx.id,
            ctx.institutionId,
            old.version,
            JSON.stringify(old),
          ],
        );
        if (result.changes !== 1) fail(409, 'VERSION', '处方已变化');
      } else
        await tx.query(
          'INSERT INTO prescriptions(id,institution_id,resident_id,version,body) VALUES(?,?,?,?,?)',
          [rx.id, ctx.institutionId, rx.residentId, rx.version, JSON.stringify(rx)],
        );
      await tx.query(
        'INSERT INTO prescription_versions(id,version,institution_id,body,created_at) VALUES(?,?,?,?,?)',
        [rx.id, rx.version, ctx.institutionId, JSON.stringify(rx), now()],
      );
      if (!old || reset)
        await tx.query(
          'INSERT INTO parameter_versions(id,version,institution_id,body,created_at) VALUES(?,?,?,?,?)',
          [rx.id, rx.parameters.version, ctx.institutionId, JSON.stringify(rx.parameters), now()],
        );
      await this.identity.audit(ctx, 'prescription.save', rx.id, { before: old, after: rx }, tx);
    });
    return rx;
  }
  async parameters(
    ctx: Context,
    id: string,
    input: {
      version: number;
      motor: number;
      gate: number;
      learning: boolean;
    },
  ) {
    this.identity.require(ctx, 'parameters');
    return this.db.transaction(async (tx) => {
      const rx =
        (await this.prescriptions(ctx, undefined, tx)).find((r) => r.id === id) ??
        fail(404, 'PRESCRIPTION', '处方不存在');
      if (rx.parameters.version !== input.version)
        fail(409, 'VERSION', '参数已变化，请刷新后重新调整');
      if (
        !Number.isFinite(input.motor) ||
        input.motor < 0 ||
        input.motor > 1 ||
        !Number.isFinite(input.gate) ||
        input.gate < 0 ||
        input.gate > 1
      )
        fail(400, 'PARAMETERS', '参数范围须为 0–1');
      const before = JSON.stringify(rx);
      rx.parameters = {
        version: input.version + 1,
        motor: input.motor,
        gate: input.gate,
        learning: input.learning === true,
        needsCalibration: false,
      };
      const saved = await tx.query(
        'UPDATE prescriptions SET body=? WHERE id=? AND institution_id=? AND body=?',
        [JSON.stringify(rx), id, ctx.institutionId, before],
      );
      if (saved.changes !== 1) fail(409, 'VERSION', '处方或参数已变化，请刷新');
      await tx.query(
        'INSERT INTO parameter_versions(id,version,institution_id,body,created_at) VALUES(?,?,?,?,?)',
        [id, rx.parameters.version, ctx.institutionId, JSON.stringify(rx.parameters), now()],
      );
      await this.identity.audit(ctx, 'parameters.save', id, rx.parameters, tx);
      return rx.parameters;
    });
  }
}
