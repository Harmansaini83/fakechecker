import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { pool } from './db/pool.js';
import { verifyRoutes } from './routes/verify.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { reportRoutes } from './routes/reports.js';
import { heatmapRoutes } from './routes/heatmap.js';
import { ok, fail } from './http.js';
import { manufacturerRoutes } from './routes/manufacturer.js';

export type AppOptions = {
  rateLimitMax?: number;
  loginRateLimitMax?: number;
  reportSubmitMax?: number;
  logger?: boolean;
};

export async function buildApp(opts: AppOptions = {}) {
  const app = Fastify({
    logger: opts.logger ?? true,
    trustProxy: true,
  });

  const secret =
    process.env.JWT_SECRET ??
    (process.env.NODE_ENV === 'production'
      ? ''
      : 'dev-only-secret-change-me');

  if (!secret) {
    throw new Error('JWT_SECRET must be set in production');
  }

  // Zod validates inside the routes; schemas are for documentation only.
  app.setValidatorCompiler(() => (data: unknown) => ({ value: data }));

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(cors, {
    origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(rateLimit, {
    max: opts.rateLimitMax ?? 60,
    timeWindow: '1 minute',
  });

  await app.register(jwt, { secret });

  // Support multipart requests and limit uploaded files.
  await app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 3,
      fields: 10,
    },
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'FakeChecker API',
        version: '1.0.0',
        description:
          'Verification API for seeds, pesticides and fertilizers.',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  // Centralized error handler.
  app.setErrorHandler((err: unknown, req, reply) => {
    const error = err instanceof Error ? err : new Error(String(err));

    const statusCode =
      typeof (err as { statusCode?: unknown } | null)?.statusCode ===
      'number'
        ? (err as { statusCode: number }).statusCode
        : 500;

    const status =
      statusCode >= 400 && statusCode <= 599 ? statusCode : 500;

    if (status >= 500) {
      req.log.error({ err: error }, 'Request failed');
    }

    const code =
      status === 429
        ? 'RATE_LIMITED'
        : status === 404
          ? 'NOT_FOUND'
          : status < 500
            ? 'BAD_REQUEST'
            : 'INTERNAL_ERROR';

    return reply.status(status).send(
      fail(
        code,
        status >= 500
          ? 'Something went wrong. Please try again.'
          : error.message
      )
    );
  });

  app.setNotFoundHandler((_req, reply) =>
    reply.status(404).send(fail('NOT_FOUND', 'Route not found.'))
  );

  app.get(
    '/health',
    { schema: { tags: ['system'] } },
    async (_req, reply) => {
      try {
        await pool.query('SELECT 1');
        return ok({ status: 'ok', db: 'up' });
      } catch {
        return reply
          .status(503)
          .send(fail('DB_DOWN', 'Database unavailable.'));
      }
    }
  );

  await app.register(verifyRoutes);

  await app.register(authRoutes, {
    loginMax: opts.loginRateLimitMax ?? 5,
  });

  await app.register(adminRoutes);

  // Register report routes.
  await app.register(reportRoutes, {
    submitMax: opts.reportSubmitMax ?? 5,
  });

  // Register heatmap routes.
  await app.register(heatmapRoutes);

  await app.register(manufacturerRoutes);

  return app;
}