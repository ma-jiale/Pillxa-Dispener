import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
const derivePassword = (password: string, salt: string): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scrypt(password, salt, 32, (error, key) => (error ? reject(error) : resolve(key))),
  );
import type { User } from '../../../packages/contracts/src/model.ts';
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function fail(status: number, code: string, message: string): never {
  throw new ApiError(status, code, message);
}
export const body = <T>(row: Record<string, unknown>): T => JSON.parse(String(row.body)) as T;
export const now = () => new Date().toISOString();
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const string = (value: unknown, max = 200) =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max
    ? value.trim()
    : fail(400, 'INPUT', '请填写有效内容');
export const optionalString = (value: unknown, max = 200) =>
  value == null || value === '' ? '' : string(value, max);
export async function passwordHash(password: string): Promise<string> {
  if (password.length < 8 || password.length > 200)
    fail(400, 'PASSWORD', '密码长度须为 8–200 个字符');
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derivePassword(password, salt)).toString('hex')}`;
}
export async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [salt, encoded] = stored.split(':');
  if (!salt || !encoded || password.length > 200) return false;
  const actual = await derivePassword(password, salt);
  const expected = Buffer.from(encoded, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export interface Context {
  user: User;
  institutionId: string;
}
