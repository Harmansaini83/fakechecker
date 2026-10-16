import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { ok, fail, validationFail } from '../http.js';
import { loginBody, refreshBody } from '../schemas.js';
import { checkPassword, DUMMY_HASH } from '../services/password.js';
import { audit } from '../services/audit.js';
import { authenticate, type Role } from '../auth/guards.js';

const REFRESH_DAYS = 7;

const sha256 = (s: string) =>
  crypto.createHash('sha256').update(s).digest('hex');

type UserRow = {
  id: number;
  role: Role;
  manufacturer_id: number | null;
};

const loginSchema = {
  type: 'object',
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string' },
  },
} as const;

const refreshSchema = {
  type: 'object',
  required: ['refreshToken'],
  properties: {
    refreshToken: { type: 'string' },
  },
} as const;

async function issueTokens(app: FastifyInstance, user: UserRow) {
  const accessToken = app.jwt.sign(
    {
      uid: user.id,
      role: user.role,
      mid: user.manufacturer_id,
    },
    { expiresIn: '15m' }
  );

  const refreshToken = crypto.randomBytes(48).toString('base64url');

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(days => $3::int))`,
    [user.id, sha256(refreshToken), REFRESH_DAYS]
  );

  return {
    accessToken,
    refreshToken,
    expiresInSeconds: 900,
  };
}

export async function authRoutes(
  app: FastifyInstance,
  opts: { loginMax: number }
) {
  // LOGIN
  app.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          max: opts.loginMax,
          timeWindow: '1 minute',
        },
      },
      schema: {
        tags: ['auth'],
        summary: 'Staff login',
        body: loginSchema,
      },
    },
    async (req, reply) => {
      const p = loginBody.safeParse(req.body);

      if (!p.success) {
        return reply.status(400).send(validationFail(p.error));
      }

      const { email, password } = p.data;

      const r = await pool.query(
        `SELECT id, email, password_hash, role, manufacturer_id, is_active
         FROM admin_users
         WHERE email = $1`,
        [email]
      );

      const u = r.rows[0];

      const good = await checkPassword(
        password,
        u?.password_hash ?? DUMMY_HASH
      );

      if (!u || !u.is_active || !good) {
        await audit(null, 'login_failed', 'admin_user', null, { email });

        return reply
          .status(401)
          .send(fail('INVALID_CREDENTIALS', 'Wrong email or password.'));
      }

      const tokens = await issueTokens(app, u);

      await audit(u.id, 'login', 'admin_user', String(u.id));

      return ok({
        ...tokens,
        user: {
          id: u.id,
          email: u.email,
          role: u.role,
          manufacturerId: u.manufacturer_id,
        },
      });
    }
  );

  // REFRESH TOKEN
  app.post(
    '/api/auth/refresh',
    {
      schema: {
        tags: ['auth'],
        summary: 'Swap a refresh token for a new token pair',
        body: refreshSchema,
      },
    },
    async (req, reply) => {
      const p = refreshBody.safeParse(req.body);

      if (!p.success) {
        return reply.status(400).send(validationFail(p.error));
      }

      const r = await pool.query(
        `SELECT t.id, t.user_id, t.revoked_at,
                (t.expires_at < now()) AS expired,
                u.role, u.manufacturer_id, u.is_active
         FROM refresh_tokens t
         JOIN admin_users u ON u.id = t.user_id
         WHERE t.token_hash = $1`,
        [sha256(p.data.refreshToken)]
      );

      const t = r.rows[0];

      if (!t) {
        return reply
          .status(401)
          .send(fail('INVALID_TOKEN', 'Please log in again.'));
      }

      if (t.revoked_at) {
        await pool.query(
          `UPDATE refresh_tokens
           SET revoked_at = now()
           WHERE user_id = $1 AND revoked_at IS NULL`,
          [t.user_id]
        );

        await audit(
          t.user_id,
          'refresh_reuse_detected',
          'admin_user',
          String(t.user_id)
        );

        return reply
          .status(401)
          .send(fail('INVALID_TOKEN', 'Please log in again.'));
      }

      if (t.expired || !t.is_active) {
        return reply
          .status(401)
          .send(fail('INVALID_TOKEN', 'Please log in again.'));
      }

      await pool.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1',
        [t.id]
      );

      const tokens = await issueTokens(app, {
        id: t.user_id,
        role: t.role,
        manufacturer_id: t.manufacturer_id,
      });

      return ok(tokens);
    }
  );

  // LOGOUT
  app.post(
    '/api/auth/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'Revoke a refresh token',
        body: refreshSchema,
      },
    },
    async (req, reply) => {
      const p = refreshBody.safeParse(req.body);

      if (!p.success) {
        return reply.status(400).send(validationFail(p.error));
      }

      const r = await pool.query(
        `UPDATE refresh_tokens
         SET revoked_at = now()
         WHERE token_hash = $1 AND revoked_at IS NULL
         RETURNING user_id`,
        [sha256(p.data.refreshToken)]
      );

      if (r.rows[0]) {
        await audit(
          r.rows[0].user_id,
          'logout',
          'admin_user',
          String(r.rows[0].user_id)
        );
      }

      return ok({ loggedOut: true });
    }
  );

  // CURRENT USER
  app.get(
    '/api/auth/me',
    {
      preHandler: authenticate,
      schema: {
        tags: ['auth'],
        summary: 'Current user',
        security: [{ bearerAuth: [] }],
      },
    },
    async (req, reply) => {
      const r = await pool.query(
        `SELECT id, email, role, manufacturer_id, is_active
         FROM admin_users
         WHERE id = $1`,
        [req.user.uid]
      );

      const u = r.rows[0];

      if (!u || !u.is_active) {
        return reply
          .status(401)
          .send(fail('UNAUTHORIZED', 'Account not active.'));
      }

      return ok({
        id: u.id,
        email: u.email,
        role: u.role,
        manufacturerId: u.manufacturer_id,
      });
    }
  );
}