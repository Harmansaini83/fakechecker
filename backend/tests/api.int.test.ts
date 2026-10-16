import fs from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';

type Case = { name: string; code: string; expected: string };
const cases: Case[] = JSON.parse(fs.readFileSync('tests/testcases.json', 'utf8'));
const pick = (prefix: string) => cases.find((c) => c.name.startsWith(prefix))!;

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  app = await buildApp({ logger: false, rateLimitMax: 1000 });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

const verify = async (code: string) => {
  const res = await app.inject({ method: 'POST', url: '/api/verify', payload: { code } });
  return res.json();
};

describe('API with seeded data', () => {
  it('health is up', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.json().data.db).toBe('up');
  });

  it('genuine code is verified and includes product details', async () => {
    const body = await verify(pick('genuine').code);
    expect(body.data.verdict).toBe('verified');
    expect(body.data.product.name).toBeTruthy();
    expect(body.data.nextStep).toBeTruthy();
  });

  it('recalled batch is recalled', async () => {
    expect((await verify(pick('recalled').code)).data.verdict).toBe('recalled');
  });

  it('forged signature is invalid', async () => {
    expect((await verify(pick('forged signature').code)).data.verdict).toBe('invalid');
  });

  it('unknown issuer is unverified, not fake', async () => {
    expect((await verify(pick('unknown issuer').code)).data.verdict).toBe('unverified');
  });
});