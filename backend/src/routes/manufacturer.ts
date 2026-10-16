import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { ok, fail } from '../http.js';
import { requireRole } from '../auth/guards.js';

export async function manufacturerRoutes(app: FastifyInstance) {
  app.get(
    '/api/manufacturer/batches',
    {
      preHandler: requireRole('manufacturer', 'admin'),
      schema: { tags: ['manufacturer'], summary: 'Own batches (admin sees all)', security: [{ bearerAuth: [] }] },
    },
    async (req, reply) => {
      // A manufacturer is always scoped to their own id, taken from the token, never from the request.
      let mid: number | null = null;
      if (req.user.role === 'manufacturer') {
        if (req.user.mid == null) return reply.status(403).send(fail('FORBIDDEN', 'No manufacturer linked to this account.'));
        mid = req.user.mid;
      }
      const r = await pool.query(
        `SELECT b.*, p.name AS product_name
         FROM batches b JOIN products p ON p.id = b.product_id
         WHERE ($1::int IS NULL OR p.manufacturer_id = $1::int)
         ORDER BY b.id DESC LIMIT 200`,
        [mid]
      );
      return ok(r.rows);
    }
  );
}