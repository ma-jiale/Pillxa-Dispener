import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export interface SqlResult {
  rows: Record<string, unknown>[];
  changes: number;
}
export interface SqlConnection {
  query(sql: string, params?: unknown[]): Promise<SqlResult>;
}
export interface Database extends SqlConnection {
  transaction<T>(fn: (connection: SqlConnection) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  dialect: 'sqlite' | 'postgres';
}
export async function openDatabase(url: string): Promise<Database> {
  if (url.startsWith('postgres')) {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: url });
    const adapt = (client: {
      query: (
        sql: string,
        params?: unknown[],
      ) => Promise<{
        rows: Record<string, unknown>[];
        rowCount: number | null;
      }>;
    }): SqlConnection => ({
      query: async (sql, params = []) => {
        let i = 0;
        const result = await client.query(
          sql.replace(/\?/g, () => `$${++i}`),
          params,
        );
        return { rows: result.rows, changes: result.rowCount ?? 0 };
      },
    });
    const connection = adapt(pool);
    return {
      ...connection,
      dialect: 'postgres',
      transaction: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const value = await fn(adapt(client));
          await client.query('COMMIT');
          return value;
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }
      },
      close: async () => {
        await pool.end();
      },
    };
  }
  const path = url === ':memory:' ? url : url.replace(/^sqlite:/, '');
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  const query: SqlConnection['query'] = async (sql, params = []) => {
    const statement = db.prepare(sql);
    if (/^\s*(SELECT|WITH|PRAGMA)/i.test(sql))
      return {
        rows: statement.all(...(params as never[])) as Record<string, unknown>[],
        changes: 0,
      };
    const result = statement.run(...(params as never[]));
    return { rows: [], changes: Number(result.changes) };
  };
  let tail: Promise<unknown> = Promise.resolve();
  const schedule = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = tail.then(fn, fn);
    tail = next.catch(() => {});
    return next;
  };
  return {
    dialect: 'sqlite',
    query: (sql, params) => schedule(() => query(sql, params)),
    transaction: (fn) =>
      schedule(async () => {
        db.exec('BEGIN IMMEDIATE');
        try {
          const value = await fn({ query });
          db.exec('COMMIT');
          return value;
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      }),
    close: async () => {
      await tail;
      db.close();
    },
  };
}
export async function migrate(db: Database): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS institutions (id TEXT PRIMARY KEY, name TEXT NOT NULL, body TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, institution_id TEXT REFERENCES institutions(id), role TEXT NOT NULL, active INTEGER NOT NULL, password_hash TEXT NOT NULL, body TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS residents (id TEXT PRIMARY KEY, institution_id TEXT NOT NULL REFERENCES institutions(id), name TEXT NOT NULL, bed TEXT NOT NULL, active INTEGER NOT NULL, body TEXT NOT NULL, UNIQUE(institution_id,id))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS residents_active_bed ON residents(institution_id,bed) WHERE active=1 AND bed<>''`,
    `CREATE TABLE IF NOT EXISTS prescriptions (id TEXT PRIMARY KEY, institution_id TEXT NOT NULL REFERENCES institutions(id), resident_id TEXT NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL, FOREIGN KEY(institution_id,resident_id) REFERENCES residents(institution_id,id))`,
    `CREATE TABLE IF NOT EXISTS prescription_versions (id TEXT NOT NULL, version INTEGER NOT NULL, institution_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(id,version))`,
    `CREATE TABLE IF NOT EXISTS parameter_versions (id TEXT NOT NULL, version INTEGER NOT NULL, institution_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(id,version))`,
    `CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, institution_id TEXT NOT NULL, resident_id TEXT NOT NULL, device_id TEXT NOT NULL, terminal_id TEXT NOT NULL, status TEXT NOT NULL, started INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(institution_id,resident_id) REFERENCES residents(institution_id,id))`,
    `CREATE INDEX IF NOT EXISTS tasks_institution_resident ON tasks(institution_id,resident_id,created_at)`,
    `CREATE INDEX IF NOT EXISTS tasks_history_page ON tasks(institution_id,created_at DESC,id DESC)`,
    `CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, institution_id TEXT NOT NULL, task_id TEXT NOT NULL REFERENCES tasks(id), terminal_id TEXT NOT NULL, sequence INTEGER NOT NULL, type TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(terminal_id,task_id,sequence))`,
    `CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, institution_id TEXT, user_id TEXT NOT NULL, action TEXT NOT NULL, object_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS terminals (id TEXT PRIMARY KEY, institution_id TEXT NOT NULL REFERENCES institutions(id), device_id TEXT NOT NULL, body TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS releases (id TEXT PRIMARY KEY, version TEXT NOT NULL, body TEXT NOT NULL)`,
  ];
  for (const sql of statements) await db.query(sql);
}
