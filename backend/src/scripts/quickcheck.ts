import fs from 'node:fs';
import { verifyCode } from '../services/verdict.js';
import { pool } from '../db/pool.js';

const cases = JSON.parse(fs.readFileSync('tests/testcases.json', 'utf8'));
const fails: string[] = [];
let pass = 0;

for (const c of cases) {
  const r = await verifyCode(c.code, { location: c.location, scanMode: c.scanMode, record: false });
  if (r.verdict === c.expected) pass++;
  else fails.push(`${c.name}: expected ${c.expected}, got ${r.verdict}`);
}

console.log(`${pass}/${cases.length} passed`);
fails.forEach((f) => console.log('FAIL', f));
await pool.end();