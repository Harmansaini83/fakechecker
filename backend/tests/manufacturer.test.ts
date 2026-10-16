import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => { app = await buildApp({ logger: false }); await app.ready(); });
afterAll(async () => { await app.close(); });

it('manufacturer batches need a token', async () => {
  expect((await app.inject({ method: 'GET', url: '/api/manufacturer/batches' })).statusCode).toBe(401);
});