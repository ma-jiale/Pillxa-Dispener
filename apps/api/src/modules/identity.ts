import { randomUUID, randomBytes } from 'node:crypto';
import type { Database, SqlConnection } from '../database.ts';
import { defaultSettings } from '../../../../packages/contracts/src/model.ts';
import type {
  Institution,
  User,
  Permission,
  Settings,
} from '../../../../packages/contracts/src/model.ts';
import { validateSettings } from '../../../../packages/dispensing-policy/src/index.ts';
import { fail, body, now, hash, string, passwordHash, passwordMatches } from '../core.ts';
import type { Context } from '../core.ts';
export class Identity {
  db: Database;
  constructor(db: Database) {
    this.db = db;
  }
  async setupRequired() {
    return (await this.db.query('SELECT id FROM users LIMIT 1')).rows.length === 0;
  }
  async bootstrap(input: Record<string, unknown>): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (this.db.dialect === 'postgres') await tx.query('SELECT pg_advisory_xact_lock(932451)');
      if ((await tx.query('SELECT id FROM users LIMIT 1')).rows.length)
        fail(409, 'SETUP_DONE', '平台管理员已创建');
      const user: User = {
        id: randomUUID(),
        username: string(input.username, 50),
        name: string(input.name, 50),
        role: 'platform',
        institutionId: null,
        permissions: [],
        active: true,
      };
      await tx.query(
        'INSERT INTO users(id,username,institution_id,role,active,password_hash,body) VALUES(?,?,?,?,?,?,?)',
        [
          user.id,
          user.username,
          null,
          user.role,
          1,
          await passwordHash(String(input.password ?? '')),
          JSON.stringify(user),
        ],
      );
    });
  }
  async login(username: string, password: string) {
    const row = (await this.db.query('SELECT * FROM users WHERE username=?', [username])).rows[0];
    if (
      !row ||
      Number(row.active) !== 1 ||
      !(await passwordMatches(password, String(row.password_hash)))
    )
      fail(401, 'LOGIN', '账号或密码错误');
    const user = body<User>(row);
    const token = randomBytes(32).toString('hex');
    await this.db.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)', [
      hash(token),
      user.id,
      new Date(Date.now() + 12 * 3600000).toISOString(),
    ]);
    return { token, user };
  }
  async authenticate(token: string): Promise<User> {
    const row = (
      await this.db.query(
        'SELECT u.body,u.active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',
        [hash(token), now()],
      )
    ).rows[0];
    if (!row || Number(row.active) !== 1) fail(401, 'SESSION', '登录已过期，请重新登录');
    return body<User>(row);
  }
  async logout(token: string) {
    await this.db.query('DELETE FROM sessions WHERE token_hash=?', [hash(token)]);
  }
  async context(user: User, institutionId: string): Promise<Context> {
    if (user.role !== 'platform' && user.institutionId !== institutionId)
      fail(403, 'INSTITUTION', '只能进入自己的养老院');
    const row = (await this.db.query('SELECT id FROM institutions WHERE id=?', [institutionId]))
      .rows[0];
    if (!row) fail(404, 'INSTITUTION', '机构不存在');
    return { user, institutionId };
  }
  require(ctx: Context, permission?: Permission) {
    if (permission && ctx.user.role === 'staff' && !ctx.user.permissions.includes(permission))
      fail(403, 'PERMISSION', '没有此操作权限');
  }
  admin(ctx: Context) {
    if (ctx.user.role === 'staff') fail(403, 'PERMISSION', '需要院内管理员权限');
  }
  async institutions(user: User): Promise<Institution[]> {
    return (
      await this.db.query(
        user.role === 'platform'
          ? 'SELECT body FROM institutions ORDER BY name'
          : 'SELECT body FROM institutions WHERE id=?',
        user.role === 'platform' ? [] : [user.institutionId],
      )
    ).rows.map(body<Institution>);
  }
  async createInstitution(user: User, input: Record<string, unknown>): Promise<Institution> {
    if (user.role !== 'platform') fail(403, 'PERMISSION', '仅平台管理员可创建机构');
    const org: Institution = {
      id: randomUUID(),
      name: string(input.name, 100),
      settings: structuredClone(defaultSettings),
    };
    await this.db.query('INSERT INTO institutions(id,name,body) VALUES(?,?,?)', [
      org.id,
      org.name,
      JSON.stringify(org),
    ]);
    return org;
  }
  async institution(ctx: Context): Promise<Institution> {
    return body<Institution>(
      (await this.db.query('SELECT body FROM institutions WHERE id=?', [ctx.institutionId]))
        .rows[0],
    );
  }
  async audit(
    ctx: Context,
    action: string,
    id: string,
    data: unknown,
    tx: SqlConnection = this.db,
  ) {
    await tx.query(
      'INSERT INTO audit(id,institution_id,user_id,action,object_id,body,created_at) VALUES(?,?,?,?,?,?,?)',
      [randomUUID(), ctx.institutionId, ctx.user.id, action, id, JSON.stringify(data), now()],
    );
  }
  async users(ctx: Context) {
    this.admin(ctx);
    return (
      await this.db.query('SELECT body FROM users WHERE institution_id=? ORDER BY username', [
        ctx.institutionId,
      ])
    ).rows.map(body<User>);
  }
  async saveUser(ctx: Context, input: Record<string, unknown>, id?: string): Promise<User> {
    this.admin(ctx);
    const old = id
      ? body<User>(
          (
            await this.db.query('SELECT body FROM users WHERE id=? AND institution_id=?', [
              id,
              ctx.institutionId,
            ])
          ).rows[0] ?? fail(404, 'USER', '账号不存在'),
        )
      : null;
    const role = input.role === 'admin' ? 'admin' : 'staff';
    if (role === 'admin' && ctx.user.role !== 'platform' && old?.role !== 'admin')
      fail(403, 'PERMISSION', '仅平台管理员创建院内管理员');
    const allowed = ['residents', 'prescriptions', 'parameters', 'export', 'devices'];
    const permissions = Array.isArray(input.permissions)
      ? (input.permissions.filter((p) => allowed.includes(String(p))) as Permission[])
      : (old?.permissions ?? []);
    const user: User = {
      id: old?.id ?? randomUUID(),
      username: old?.username ?? string(input.username, 50),
      name: string(input.name, 50),
      role: old?.role ?? role,
      institutionId: ctx.institutionId,
      permissions,
      active: input.active !== false,
    };
    if (user.id === ctx.user.id && !user.active) fail(400, 'SELF', '不能停用当前账号');
    await this.db.transaction(async (tx) => {
      if (old) {
        await tx.query('UPDATE users SET active=?,body=? WHERE id=? AND institution_id=?', [
          user.active ? 1 : 0,
          JSON.stringify(user),
          user.id,
          ctx.institutionId,
        ]);
        if (input.password)
          await tx.query('UPDATE users SET password_hash=? WHERE id=?', [
            await passwordHash(String(input.password)),
            user.id,
          ]);
      } else
        await tx.query(
          'INSERT INTO users(id,username,institution_id,role,active,password_hash,body) VALUES(?,?,?,?,?,?,?)',
          [
            user.id,
            user.username,
            ctx.institutionId,
            user.role,
            1,
            await passwordHash(String(input.password ?? '')),
            JSON.stringify(user),
          ],
        );
      await this.audit(ctx, 'user.save', user.id, user, tx);
    });
    return user;
  }
  async settings(ctx: Context, input: Settings): Promise<Institution> {
    this.admin(ctx);
    validateSettings(input);
    const old = await this.institution(ctx);
    if (input.version !== old.settings.version) fail(409, 'VERSION', '设置已变化，请刷新');
    const org = { ...old, settings: { ...input, version: old.settings.version + 1 } };
    await this.db.transaction(async (tx) => {
      const saved = await tx.query('UPDATE institutions SET body=? WHERE id=? AND body=?', [
        JSON.stringify(org),
        org.id,
        JSON.stringify(old),
      ]);
      if (saved.changes !== 1) fail(409, 'VERSION', '机构设置已变化，请刷新');
      await this.audit(
        ctx,
        'settings.save',
        org.id,
        { before: old.settings, after: org.settings },
        tx,
      );
    });
    return org;
  }
}
