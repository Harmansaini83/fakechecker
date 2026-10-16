import 'dotenv/config';
import { pool } from '../db/pool.js';
import { codeHash } from '../services/evidence.js';

const pts = [[21.12, 79.09], [21.13, 79.10], [21.14, 79.11], [21.11, 79.08], [19.07, 72.88]];
await pool.query(`DELETE FROM fraud_reports WHERE code LIKE 'demo-heatmap-%'`);
for (const [i, [lat, lng]] of pts.entries()) {
  const code = `demo-heatmap-${i}`;
  await pool.query(
    `INSERT INTO fraud_reports (code, code_hash, category, geom)
     VALUES ($1,$2,'suspected_fake', ST_SetSRID(ST_MakePoint($3::float8,$4::float8),4326)::geography)`,
    [code, codeHash(code), lng, lat]
  );
}
console.log('demo reports inserted: 4 near Nagpur, 1 near Mumbai');
await pool.end();