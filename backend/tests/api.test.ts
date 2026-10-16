import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp({ logger: false });
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

const post = (payload: unknown, a = app) =>
  a.inject({ method: 'POST', url: '/api/verify', payload: payload as object });

describe('POST /api/verify validation', () => {
  it('rejects a missing code', async () => {
    const res = await post({});
    expect(res.statusCode).toBe(400);
    expect(res.json().ok).toBe(false);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an invalid latitude', async () => {
    const res = await post({ code: 'x', location: { lat: 200, lng: 10 } });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an oversized code', async () => {
    const res = await post({ code: 'a'.repeat(501) });
    expect(res.statusCode).toBe(400);
  });
});

describe('error format', () => {
  it('unknown route returns the standard error shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});

describe('rate limiting', () => {
  it('returns 429 after the limit', async () => {
    const limited = await buildApp({ logger: false, rateLimitMax: 2 });
    await limited.ready();
    await post({}, limited);
    await post({}, limited);
    const third = await post({}, limited);
    expect(third.statusCode).toBe(429);
    expect(third.json().error.code).toBe('RATE_LIMITED');
    await limited.close();
  });
});