const BASE_URL = '/api';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  if (res.status === 204 || res.status === 202) return undefined as T;
  return res.json() as Promise<T>;
}

export async function login(token: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error('Invalid token');
}

export async function logout(): Promise<void> {
  await fetch(`${BASE_URL}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  window.location.href = '/login';
}

export interface Prompt {
  key: string;
  content: string;
  updated_at: string;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),

  prompts: {
    list: () => request<Prompt[]>('GET', '/prompts'),
    update: (key: string, content: string) =>
      request<void>('PATCH', `/prompts/${key}`, { content }),
  },
};
