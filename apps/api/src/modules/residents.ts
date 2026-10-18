import { randomUUID } from 'node:crypto';
import type { Database, SqlConnection } from '../database.ts';
import type { Resident } from '../../../../packages/contracts/src/model.ts';
import { fail, body, string, optionalString } from '../core.ts';
import type { Context } from '../core.ts';
import type { Identity } from './identity.ts';
export class Residents {
  db: Database;
  identity: Identity;
  constructor(db: Database, identity: Identity) {
    this.db = db;
    this.identity = identity;
  }
  async residents(ctx: Context): Promise<Resident[]> {
    return (
      await this.db.query('SELECT body FROM residents WHERE institution_id=? ORDER BY name', [
        ctx.institutionId,
      ])
    ).rows.map(body<Resident>);
  }
  async resident(ctx: Context, id: string, tx: SqlConnection = this.db): Promise<Resident> {
    const row = (
      await tx.query('SELECT body FROM residents WHERE id=? AND institution_id=?', [
        id,
        ctx.institutionId,
      ])
    ).rows[0];
    if (!row) fail(404, 'RESIDENT', '住民不存在');
    return body<Resident>(row);
  }
  async saveResident(ctx: Context, input: Record<string, unknown>, id?: string): Promise<Resident> {
    this.identity.require(ctx, 'residents');
    const old = id ? await this.resident(ctx, id) : null;
    if (old && input.version !== old.version) fail(409, 'VERSION', '资料已被修改，请刷新');
    const rfid = Array.isArray(input.rfid)
      ? [
          ...new Set(
            input.rfid.map((v) =>
              String(v)
                .replace(/[\s:-]/g, '')
                .toUpperCase(),
            ),
          ),
        ]
      : (old?.rfid ?? []);
    if (rfid.some((v) => !v || v.length > 64 || !/^[A-F0-9]+$/.test(v)))
      fail(400, 'RFID', 'RFID 须为有效十六进制标识');
    const resident: Resident = {
      id: old?.id ?? randomUUID(),
      institutionId: ctx.institutionId,
      name: string(input.name, 50),
      bed: optionalString(input.bed, 100),
      active: input.active !== false,
      photo: typeof input.photo === 'string' ? input.photo : (old?.photo ?? null),
      rfid,
      version: (old?.version ?? 0) + 1,
    };
    await this.db.transaction(async (tx) => {
      const others = (
        await tx.query('SELECT body FROM residents WHERE institution_id=?', [ctx.institutionId])
      ).rows.map(body<Resident>);
      if (others.some((r) => r.id !== resident.id && r.rfid.some((v) => rfid.includes(v))))
        fail(409, 'RFID', '此 RFID 已绑定另一住民');
      if (old) {
        const saved = await tx.query(
          'UPDATE residents SET name=?,bed=?,active=?,body=? WHERE id=? AND institution_id=? AND body=?',
          [
            resident.name,
            resident.bed,
            resident.active ? 1 : 0,
            JSON.stringify(resident),
            resident.id,
            ctx.institutionId,
            JSON.stringify(old),
          ],
        );
        if (saved.changes !== 1) fail(409, 'VERSION', '住民资料已变化，请刷新');
      } else
        await tx.query(
          'INSERT INTO residents(id,institution_id,name,bed,active,body) VALUES(?,?,?,?,?,?)',
          [
            resident.id,
            ctx.institutionId,
            resident.name,
            resident.bed,
            resident.active ? 1 : 0,
            JSON.stringify(resident),
          ],
        );
      await this.identity.audit(
        ctx,
        'resident.save',
        resident.id,
        { before: old, after: resident },
        tx,
      );
    });
    return resident;
  }
}
