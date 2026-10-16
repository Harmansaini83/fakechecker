import 'dotenv/config';
import Fastify from 'fastify';
import pg from 'pg';

const app = Fastify({ logger: true });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

app.get('/health', async () => ({ status: 'ok' }));

app.get('/db-check', async () => {
  const r = await pool.query('SELECT PostGIS_Version() AS postgis');
  return { postgis: r.rows[0].postgis };
});

app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });