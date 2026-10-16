import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { sniff } from '../src/services/evidence.js';

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => { app = await buildApp({ logger: false, rateLimitMax: 1000 }); await app.ready(); });
afterAll(async () => { await app.close(); });

describe('reports', () => {
  it('rejects non-multipart submissions', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/reports', payload: { code: 'x' } });
    expect(res.statusCode).toBe(400);
  });
  it('moderation queue needs a token', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/moderation/reports' })).statusCode).toBe(401);
  });
  it('detects image types by content', () => {
    expect(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))?.ext).toBe('jpg');
    expect(sniff(Buffer.from('<?php echo 1; ?> not an image'))).toBeNull();
  });
});