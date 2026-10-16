import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => { app = await buildApp({ logger: false }); await app.ready(); });
afterAll(async () => { await app.close(); });

describe('heatmap', () => {
  it('staff heatmap needs a token', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/moderation/heatmap' })).statusCode).toBe(401);
  });
  it('staff heatmap rejects a garbage token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/moderation/heatmap', headers: { authorization: 'Bearer x.y.z' } });
    expect(res.statusCode).toBe(401);
  });
});