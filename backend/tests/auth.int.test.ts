import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp({ logger: false, rateLimitMax: 1000, loginRateLimitMax: 1000 });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

const PASSWORD = 'Demo@12345';

const login = (email: string, password = PASSWORD) =>
  app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });

const authed = (token: string, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
  app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });

const tokenFor = async (email: string) => (await login(email)).json().data.accessToken as string;

describe('auth with seeded users', () => {
  it('admin can log in', async () => {
    const res = await login('admin@demo.test');
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.accessToken).toBeTruthy();
    expect(d.refreshToken).toBeTruthy();
    expect(d.user.role).toBe('admin');
  });

  it('wrong password is rejected', async () => {
    const res = await login('admin@demo.test', 'wrong-password');
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('unknown email gets the same error', async () => {
    const res = await login('nobody@demo.test');
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('/me returns the logged-in user', async () => {
    const res = await authed(await tokenFor('moderator@demo.test'), 'GET', '/api/auth/me');
    expect(res.statusCode).toBe(200);
    expect(res.json().data.role).toBe('moderator');
  });

  it('moderator cannot list users (403)', async () => {
    const res = await authed(await tokenFor('moderator@demo.test'), 'GET', '/api/admin/users');
    expect(res.statusCode).toBe(403);
  });

  it('admin can create a user, duplicate email is 409', async () => {
    const t = await tokenFor('admin@demo.test');
    const body = { email: `new${Date.now()}@demo.test`, password: 'LongPass#2026', role: 'moderator' };
    expect((await authed(t, 'POST', '/api/admin/users', body)).statusCode).toBe(201);
    expect((await authed(t, 'POST', '/api/admin/users', body)).statusCode).toBe(409);
  });

  it('refresh rotates tokens and detects reuse', async () => {
    const first = (await login('admin@demo.test')).json().data;
    const refresh = (token: string) =>
      app.inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken: token } });

    const r1 = await refresh(first.refreshToken);
    expect(r1.statusCode).toBe(200);
    const second = r1.json().data;
    expect(second.refreshToken).not.toBe(first.refreshToken);

    expect((await refresh(first.refreshToken)).statusCode).toBe(401);
    expect((await refresh(second.refreshToken)).statusCode).toBe(401);
  });

  it('deactivated user cannot log in', async () => {
    const t = await tokenFor('admin@demo.test');
    const email = `temp${Date.now()}@demo.test`;
    const created = await authed(t, 'POST', '/api/admin/users', {
      email,
      password: 'LongPass#2026',
      role: 'moderator',
    });
    const id = created.json().data.id;
    expect((await login(email, 'LongPass#2026')).statusCode).toBe(200);
    expect((await authed(t, 'PATCH', `/api/admin/users/${id}/deactivate`)).statusCode).toBe(200);
    expect((await login(email, 'LongPass#2026')).statusCode).toBe(401);
  });

  it('audit log records logins', async () => {
    const t = await tokenFor('admin@demo.test');
    const res = await authed(t, 'GET', '/api/admin/audit-log?limit=100');
    expect(res.statusCode).toBe(200);
    const actions = res.json().data.map((a: { action: string }) => a.action);
    expect(actions).toContain('login');
  });
});