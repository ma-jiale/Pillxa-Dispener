import { invoke } from '@tauri-apps/api/core';
export const desktop = '__TAURI_INTERNALS__' in window;
export const credentials = {
  get token() {
    return localStorage.getItem('pillxa.token') || '';
  },
  set token(value: string) {
    localStorage.setItem('pillxa.token', value);
  },
  get institution() {
    return localStorage.getItem('pillxa.institution') || '';
  },
  set institution(value: string) {
    localStorage.setItem('pillxa.institution', value);
  },
  get server() {
    return localStorage.getItem('pillxa.server') || (desktop ? 'http://127.0.0.1:4310' : '');
  },
  set server(value: string) {
    localStorage.setItem('pillxa.server', value.replace(/\/$/, ''));
  },
  get terminal() {
    let id = localStorage.getItem('pillxa.terminal');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('pillxa.terminal', id);
    }
    return id;
  },
  get device() {
    return localStorage.getItem('pillxa.device') || '试用摆药机';
  },
  set device(value: string) {
    localStorage.setItem('pillxa.device', value);
  },
};
export async function api<T = any>(path: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(`${credentials.server}/api${path}`, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${credentials.token}`,
      'x-institution-id': credentials.institution,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || result.error || '请求失败');
  return result;
}
export async function local<T = any>(method: string, params: unknown = {}): Promise<T> {
  if (desktop) return invoke<T>('runtime_request', { method, params });
  const response = await fetch(`/local/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || '本机执行服务不可用');
  return result;
}
export async function configureRuntime() {
  const workspace = await api('/workspace');
  const rfidBindings = Object.fromEntries(
    workspace.residents.flatMap((r: { id: string; rfid: string[] }) =>
      r.rfid.map((uid) => [uid, r.id]),
    ),
  );
  return local('configure', {
    apiUrl: credentials.server || 'http://127.0.0.1:4310',
    token: credentials.token,
    institutionId: credentials.institution,
    terminalId: credentials.terminal,
    deviceId: credentials.device,
    rfidBindings,
  });
}
export async function download(path: string, name: string, body?: unknown) {
  const response = await fetch(`${credentials.server}/api${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      authorization: `Bearer ${credentials.token}`,
      'x-institution-id': credentials.institution,
      'content-type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '导出失败');
  }
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
