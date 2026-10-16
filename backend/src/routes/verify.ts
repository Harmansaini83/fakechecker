import type { FastifyInstance } from 'fastify';
import { verifyBody } from '../schemas.js';
import { verifyCode } from '../services/verdict.js';
import { ok, fail } from '../http.js';

export async function verifyRoutes(app: FastifyInstance) {
  app.post(
    '/api/verify',
    {
      schema: {
        tags: ['verify'],
        summary: 'Verify a scanned or manually entered package code',
        description:
          'Returns one of: verified, suspicious, unverified, invalid, expired, recalled, confirmed_counterfeit.',
        body: {
          type: 'object',
          required: ['code'],
          properties: {
            code: { type: 'string', description: 'Code from the QR or printed on the packet' },
            scanMode: { type: 'string', enum: ['farmer', 'retailer'], default: 'farmer' },
            location: {
              type: 'object',
              description: 'Optional',
              properties: { lat: { type: 'number' }, lng: { type: 'number' } },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const parsed = verifyBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send(
          fail(
            'VALIDATION_ERROR',
            'Invalid request.',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
          )
        );
      }
      const { code, scanMode, location } = parsed.data;
      const result = await verifyCode(code, { scanMode, location });
      return ok(result);
    }
  );
}