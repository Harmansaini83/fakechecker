import fs from 'node:fs';
import path from 'node:path';
import { pool } from './pool.js';

const dir = path.resolve('migrations');

await pool.query(
  `CREATE TABLE IF NOT EXISTS schema_migrations (
     name TEXT PRIMARY KEY,
     applied_at TIMESTAMPTZ DEFAULT now()
   )`
);
const done = new Set(
  (await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name)
);

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  if (done.has(file)) continue;
  const sql = fs.readFileSync(path.join(dir, file), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [file]);
    await client.query('COMMIT');
    console.log('applied', file);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
await pool.end();
console.log('migrations done');