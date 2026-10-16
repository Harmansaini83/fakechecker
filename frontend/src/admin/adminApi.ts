const RT = 'fc_admin_rt';
let access: string | null = null;
let refreshing: Promise<boolean> | null = null;

export type Role = 'admin' | 'moderator' | 'manufacturer';
export type Me = { id: number; email: string; role: Role; manufacturerId: number | null };

async function post(path: string, body: unknown) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { res, body: await res.json().catch(() => null) };
}

export async function login(email: string, password: string): Promise<Me> {
  const { res, body } = await post('/api/auth/login', { email, password });
  if (!res.ok || !body?.ok) {
    throw new Error(res.status === 429 ? 'Too many attempts. Wait a minute.' : body?.error?.message ?? 'Login failed.');
  }
  access = body.data.accessToken;
  sessionStorage.setItem(RT, body.data.refreshToken);
  return body.data.user as Me;
}

async function doRefresh(): Promise<boolean> {
  const rt = sessionStorage.getItem(RT);
  if (!rt) return false;
  try {
    const { res, body } = await post('/api/auth/refresh', { refreshToken: rt });
    if (!res.ok || !body?.ok) {
      sessionStorage.removeItem(RT);
      access = null;
      return false;
    }
    access = body.data.accessToken;
    sessionStorage.setItem(RT, body.data.refreshToken);
    return true;
  } catch {
    return false; // offline: keep the token for later
  }
}
const refresh = () => (refreshing ??= doRefresh().finally(() => { refreshing = null; }));

async function authed(path: string, init: RequestInit = {}): Promise<Response> {
  const run = () =>
    fetch(path, { ...init, headers: { ...(init.headers ?? {}), ...(access ? { Authorization: `Bearer ${access}` } : {}) } });
  let res = await run();
  if (res.status === 401 && (await refresh())) res = await run();
  return res;
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await authed(path, init);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) throw new Error(body?.error?.message ?? 'Request failed.');
  return body.data as T;
}

export async function apiBlob(path: string): Promise<Blob> {
  const res = await authed(path);
  if (!res.ok) throw new Error('Could not load the file.');
  return res.blob();
}

export async function restore(): Promise<Me | null> {
  if (!(await refresh())) return null;
  try { return await api<Me>('/api/auth/me'); } catch { return null; }
}

export async function logout() {
  const rt = sessionStorage.getItem(RT);
  sessionStorage.removeItem(RT);
  access = null;
  if (rt) await post('/api/auth/logout', { refreshToken: rt }).catch(() => undefined);
}