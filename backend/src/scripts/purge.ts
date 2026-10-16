import 'dotenv/config';
import { pool } from '../db/pool.js';

const r = await pool.query(
  `UPDATE fraud_reports SET contact = NULL
   WHERE contact IS NOT NULL AND created_at < now() - interval '90 days'`
);
console.log(`contacts removed: ${r.rowCount}`);
await pool.end();