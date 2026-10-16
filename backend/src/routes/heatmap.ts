import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { ok, validationFail } from '../http.js';
import { heatmapQuery } from '../schemas.js';
import { requireRole } from '../auth/guards.js';

const THRESHOLD = Number(process.env.HEATMAP_THRESHOLD) || 3; // distinct packets per cell
const PUBLIC_GRID = 0.1; // about 11 km

async function cells(grid: number, days: number, min: number) {
  const r = await pool.query(
    `SELECT ST_Y(c) AS lat, ST_X(c) AS lng, n FROM (
       SELECT ST_SnapToGrid(geom::geometry, $1::float8) AS c,
              count(DISTINCT code_hash)::int AS n
       FROM fraud_reports
       WHERE geom IS NOT NULL AND status IN ('open','confirmed')
         AND created_at > now() - make_interval(days => $2::int)
       GROUP BY 1) g
     WHERE n >= $3::int ORDER BY n DESC LIMIT 500`,
    [grid, days, min]
  );
  return r.rows.map((x) => ({ lat: x.lat as number, lng: x.lng as number, n: x.n as number }));
}

export async function heatmapRoutes(app: FastifyInstance) {
  // Public: coarse grid, and only cells that pass the threshold are returned.
  app.get(
    '/api/heatmap',
    { schema: { tags: ['heatmap'], summary: 'Public hotspot map (coarse, thresholded)' } },
    async (_req, reply) => {
      const rows = await cells(PUBLIC_GRID, 30, THRESHOLD);
      reply.header('Cache-Control', 'public, max-age=300');
      return ok({ days: 30, gridDegrees: PUBLIC_GRID, threshold: THRESHOLD, cells: rows });
    }
  );

  // Staff: finer grid, all cells, with an alert flag.
  app.get(
    '/api/moderation/heatmap',
    {
      preHandler: requireRole('moderator', 'admin'),
      schema: { tags: ['moderation'], summary: 'Staff heatmap', security: [{ bearerAuth: [] }] },
    },
    async (req, reply) => {
      const p = heatmapQuery.safeParse(req.query);
      if (!p.success) return reply.status(400).send(validationFail(p.error));
      const rows = await cells(p.data.cell, p.data.days, p.data.min);
      return ok({
        days: p.data.days,
        gridDegrees: p.data.cell,
        threshold: THRESHOLD,
        cells: rows.map((c) => ({ ...c, alert: c.n >= THRESHOLD })),
      });
    }
  );
}