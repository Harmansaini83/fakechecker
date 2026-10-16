import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { ok, fail, validationFail } from '../http.js';
import { createUserBody, idParam, auditQuery } from '../schemas.js';
import { hashPassword } from '../services/password.js';
import { audit } from '../services/audit.js';
import { requireRole } from '../auth/guards.js';

const adminOnly = requireRole('admin');
const security = [{ bearerAuth: [] }];

export async function adminRoutes(app: FastifyInstance) {
  app.get(
    '/api/admin/users',
    { preHandler: adminOnly, schema: { tags: ['admin'], summary: 'List staff users', security } },
    async () => {
      const r = await pool.query(
        `SELECT id, email, role, manufacturer_id, is_active, created_at
         FROM admin_users ORDER BY id`
      );
      return ok(
        r.rows.map((u) => ({
          id: u.id,
          email: u.email,
          role: u.role,
          manufacturerId: u.manufacturer_id,
          isActive: u.is_active,
          createdAt: u.created_at,
        }))
      );
    }
  );

  app.post(
    '/api/admin/users',
    { preHandler: adminOnly, schema: { tags: ['admin'], summary: 'Create a staff user', security } },
    async (req, reply) => {
      const p = createUserBody.safeParse(req.body);
      if (!p.success) return reply.status(400).send(validationFail(p.error));
      const { email, password, role, manufacturerId } = p.data;

      try {
        const r = await pool.query(
          `INSERT INTO admin_users (email, password_hash, role, manufacturer_id)
           VALUES ($1,$2,$3,$4) RETURNING id, email, role, manufacturer_id`,
          [email, await hashPassword(password), role, manufacturerId ?? null]
        );
        const u = r.rows[0];
        await audit(req.user.uid, 'user_create', 'admin_user', String(u.id), { email: u.email, role: u.role });
        return reply
          .status(201)
          .send(ok({ id: u.id, email: u.email, role: u.role, manufacturerId: u.manufacturer_id }));
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === '23505') {
          return reply.status(409).send(fail('EMAIL_EXISTS', 'A user with this email already exists.'));
        }
        if (code === '23503') {
          return reply.status(400).send(fail('MANUFACTURER_NOT_FOUND', 'That manufacturer does not exist.'));
        }
        throw e;
      }
    }
  );

  app.patch(
    '/api/admin/users/:id/deactivate',
    { preHandler: adminOnly, schema: { tags: ['admin'], summary: 'Deactivate a staff user', security } },
    async (req, reply) => {
      const p = idParam.safeParse(req.params);
      if (!p.success) return reply.status(400).send(validationFail(p.error));
      const { id } = p.data;
      if (id === req.user.uid) {
        return reply.status(400).send(fail('CANNOT_DEACTIVATE_SELF', 'You cannot deactivate yourself.'));
      }
      const r = await pool.query('UPDATE admin_users SET is_active = false WHERE id = $1 RETURNING id', [id]);
      if (!r.rowCount) return reply.status(404).send(fail('NOT_FOUND', 'User not found.'));
      await pool.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [id]
      );
      await audit(req.user.uid, 'user_deactivate', 'admin_user', String(id));
      return ok({ id, isActive: false });
    }
  );

  app.get(
    '/api/admin/audit-log',
    { preHandler: adminOnly, schema: { tags: ['admin'], summary: 'Latest audit entries', security } },
    async (req, reply) => {
      const p = auditQuery.safeParse(req.query);
      if (!p.success) return reply.status(400).send(validationFail(p.error));
      const r = await pool.query(
        `SELECT a.id, a.created_at, a.action, a.entity, a.entity_id, a.details, u.email AS actor_email
         FROM audit_log a LEFT JOIN admin_users u ON u.id = a.actor_id
         ORDER BY a.id DESC LIMIT $1`,
        [p.data.limit]
      );
      return ok(
        r.rows.map((a) => ({
          id: a.id,
          at: a.created_at,
          actor: a.actor_email,
          action: a.action,
          entity: a.entity,
          entityId: a.entity_id,
          details: a.details,
        }))
      );
    }
  );
}