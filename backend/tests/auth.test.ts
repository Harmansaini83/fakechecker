import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp({ logger: false, rateLimitMax: 1000, loginRateLimitMax: 1000 });
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('auth guards (no database needed)', () => {
  it('admin route without a token is 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/users' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('garbage token is 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: { authorization: 'Bearer not.a.token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('creating a user without a token is 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/admin/users', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('audit log without a token is 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/audit-log' });
    expect(res.statusCode).toBe(401);
  });

  it('login with an empty body is 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('login with a bad email is 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nope', password: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });
});