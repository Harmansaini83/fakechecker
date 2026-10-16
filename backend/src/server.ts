import 'dotenv/config';
import { buildApp } from './app.js';
import { pool } from './db/pool.js';

const app = await buildApp();
const port = Number(process.env.PORT) || 3000;

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port, host: '0.0.0.0' });