import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { pool } from './db/pool.js';
import { verifyRoutes } from './routes/verify.js';
import { ok, fail } from './http.js';

export type AppOptions = { rateLimitMax?: number; logger?: boolean };

export async function buildApp(opts: AppOptions = {}) {
  const app = Fastify({ logger: opts.logger ?? true, trustProxy: true });

  // Zod validates in the routes; the schemas below are for documentation only.
  app.setValidatorCompiler(() => (data: unknown) => ({ value: data }));

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' });
  await app.register(rateLimit, { max: opts.rateLimitMax ?? 60, timeWindow: '1 minute' });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'FakeChecker API',
        version: '1.0.0',
        description: 'Verification API for seeds, pesticides and fertilizers.',
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.setErrorHandler((err, req, reply) => {
    const status = err.statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    const code =
      status === 429 ? 'RATE_LIMITED' : status === 404 ? 'NOT_FOUND' : status < 500 ? 'BAD_REQUEST' : 'INTERNAL_ERROR';
    reply
      .status(status)
      .send(fail(code, status >= 500 ? 'Something went wrong. Please try again.' : err.message));
  });

  app.setNotFoundHandler((_req, reply) => reply.status(404).send(fail('NOT_FOUND', 'Route not found.')));

  app.get('/health', { schema: { tags: ['system'] } }, async (_req, reply) => {
    try {
      await pool.query('SELECT 1');
      return ok({ status: 'ok', db: 'up' });
    } catch {
      return reply.status(503).send(fail('DB_DOWN', 'Database unavailable.'));
    }
  });

  await app.register(verifyRoutes);
  return app;
}