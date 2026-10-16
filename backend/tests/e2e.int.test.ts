import fs from 'node:fs';
import { it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => { app = await buildApp({ logger: false, rateLimitMax: 1000, loginRateLimitMax: 1000, reportSubmitMax: 1000 }); await app.ready(); });
afterAll(async () => { await app.close(); await pool.end(); });

it('farmer verifies, reports; moderator confirms; admin sees audit', async () => {
  const cases = JSON.parse(fs.readFileSync('tests/testcases.json', 'utf8'));
  const code = cases.find((c: { expected: string }) => c.expected === 'verified').code;
  const v = await app.inject({ method: 'POST', url: '/api/verify', payload: { code } });
  expect(v.json().data.verdict).toBeTruthy();

  const boundary = 'xBOUNDARYx';
  const form = (n: string, val: string) => `--${boundary}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${val}\r\n`;
  const payload = form('code', `e2e-${Date.now()}`) + form('category', 'suspected_fake') + `--${boundary}--\r\n`;
  const rep = await app.inject({ method: 'POST', url: '/api/reports', payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
  expect(rep.statusCode).toBe(201);
  const id = rep.json().data.reportId;

  const login = async (email: string) =>
    (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'Demo@12345' } })).json().data.accessToken as string;
  const mod = await login('moderator@demo.test');
  const patch = await app.inject({ method: 'PATCH', url: `/api/moderation/reports/${id}`, payload: { status: 'confirmed' }, headers: { authorization: `Bearer ${mod}` } });
  expect(patch.statusCode).toBe(200);

  const admin = await login('admin@demo.test');
  const log = await app.inject({ method: 'GET', url: '/api/admin/audit-log?limit=50', headers: { authorization: `Bearer ${admin}` } });
  expect(log.json().data.map((a: { action: string }) => a.action)).toContain('report_confirmed');

  const mfr = await login('manufacturer@demo.test');
  const denied = await app.inject({ method: 'GET', url: '/api/moderation/reports', headers: { authorization: `Bearer ${mfr}` } });
  expect(denied.statusCode).toBe(403);
});