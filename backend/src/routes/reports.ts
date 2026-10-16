import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { ok, fail, validationFail } from '../http.js';
import { reportFields, reportListQuery, reviewBody, idParam } from '../schemas.js';
import { requireRole } from '../auth/guards.js';
import { audit } from '../services/audit.js';
import { sniff, saveFile, codeHash, UPLOAD_DIR } from '../services/evidence.js';

const staff = requireRole('moderator', 'admin');
const security = [{ bearerAuth: [] }];

export async function reportRoutes(app: FastifyInstance, opts: { submitMax: number }) {
  // Public: farmers need no account. Tight limit to stop spam.
  app.post(
    '/api/reports',
    {
      config: { rateLimit: { max: opts.submitMax, timeWindow: '1 hour' } },
      schema: {
        tags: ['reports'],
        summary: 'Submit a report (multipart/form-data)',
        description:
          'Fields: code, category, description?, purchasePlace?, contact?, lat?, lng?. Up to 3 images (jpg/png/webp, 5 MB each) in field "evidence".',
      },
    },
    async (req, reply) => {
      if (!req.isMultipart()) {
        return reply.status(400).send(fail('VALIDATION_ERROR', 'Send the report as multipart/form-data.'));
      }
      const raw: Record<string, string> = {};
      const files: { buf: Buffer; ext: string; mime: string }[] = [];

      for await (const part of req.parts()) {
        if (part.type === 'file') {
          const buf = await part.toBuffer(); // throws 413 if over the size limit
          if (!buf.length) continue;
          const kind = sniff(buf);
          if (!kind) return reply.status(400).send(fail('BAD_FILE', 'Only JPG, PNG or WebP images are allowed.'));
          files.push({ buf, ...kind });
        } else if (part.value !== '') {
          raw[part.fieldname] = String(part.value);
        }
      }

      const p = reportFields.safeParse(raw);
      if (!p.success) return reply.status(400).send(validationFail(p.error));
      const d = p.data;
      const hash = codeHash(d.code);

      // Duplicate detection: same code already has a live report -> link to it.
      const dup = await pool.query(
        `SELECT COALESCE(duplicate_of, id) AS root FROM fraud_reports
         WHERE code_hash = $1 AND status IN ('open','confirmed')
         ORDER BY id LIMIT 1`,
        [hash]
      );
      const dupOf: number | null = dup.rows[0]?.root ?? null;

      const r = await pool.query(
        `INSERT INTO fraud_reports (code, code_hash, category, description, purchase_place, contact, geom, status, duplicate_of)
         VALUES ($1,$2,$3,$4,$5,$6,
           CASE WHEN $7::float8 IS NULL THEN NULL
                ELSE ST_SetSRID(ST_MakePoint($8::float8, $7::float8), 4326)::geography END,
           CASE WHEN $9::bigint IS NULL THEN 'open' ELSE 'duplicate' END, $9)
         RETURNING id`,
        [d.code, hash, d.category, d.description ?? null, d.purchasePlace ?? null, d.contact ?? null,
         d.lat ?? null, d.lng ?? null, dupOf]
      );
      const id: number = r.rows[0].id;

      for (const f of files) {
        const name = await saveFile(f.buf, f.ext);
        await pool.query(
          'INSERT INTO report_evidence (report_id, stored_name, mime, size_bytes) VALUES ($1,$2,$3,$4)',
          [id, name, f.mime, f.buf.length]
        );
      }
      return reply.status(201).send(ok({ reportId: id, duplicate: dupOf !== null }));
    }
  );

  app.get(
    '/api/moderation/reports',
    { preHandler: staff, schema: { tags: ['moderation'], summary: 'Moderation queue', security } },
    async (req, reply) => {
      const p = reportListQuery.safeParse(req.query);
      if (!p.success) return reply.status(400).send(validationFail(p.error));
      const r = await pool.query(
        `SELECT f.id, f.code, f.category, f.description, f.purchase_place, f.contact, f.status,
                f.duplicate_of, f.created_at, ST_Y(f.geom::geometry) AS lat, ST_X(f.geom::geometry) AS lng,
                (SELECT count(*)::int FROM fraud_reports d WHERE d.duplicate_of = f.id) AS duplicates,
                COALESCE((SELECT json_agg(e.id) FROM report_evidence e WHERE e.report_id = f.id), '[]') AS evidence_ids
         FROM fraud_reports f WHERE f.status = $1
         ORDER BY f.created_at DESC LIMIT $2`,
        [p.data.status, p.data.limit]
      );
      return ok(r.rows);
    }
  );

  app.patch(
    '/api/moderation/reports/:id',
    { preHandler: staff, schema: { tags: ['moderation'], summary: 'Confirm or reject a report', security } },
    async (req, reply) => {
      const ip = idParam.safeParse(req.params);
      const bp = reviewBody.safeParse(req.body);
      if (!ip.success) return reply.status(400).send(validationFail(ip.error));
      if (!bp.success) return reply.status(400).send(validationFail(bp.error));
      const r = await pool.query(
        `UPDATE fraud_reports SET status=$2, review_note=$3, reviewed_by=$4, reviewed_at=now()
         WHERE id=$1 AND status IN ('open','duplicate') RETURNING id`,
        [ip.data.id, bp.data.status, bp.data.note ?? null, req.user.uid]
      );
      if (!r.rowCount) return reply.status(404).send(fail('NOT_FOUND', 'Report not found or already reviewed.'));
      await audit(req.user.uid, `report_${bp.data.status}`, 'fraud_report', String(ip.data.id), { note: bp.data.note });
      return ok({ id: ip.data.id, status: bp.data.status });
    }
  );

  app.get(
    '/api/moderation/evidence/:id',
    { preHandler: staff, schema: { tags: ['moderation'], summary: 'Download an evidence image', security } },
    async (req, reply) => {
      const p = idParam.safeParse(req.params);
      if (!p.success) return reply.status(400).send(validationFail(p.error));
      const r = await pool.query('SELECT stored_name, mime FROM report_evidence WHERE id = $1', [p.data.id]);
      const e = r.rows[0];
      if (!e) return reply.status(404).send(fail('NOT_FOUND', 'Evidence not found.'));
      return reply
        .header('Content-Type', e.mime)
        .header('X-Content-Type-Options', 'nosniff')
        .header('Cache-Control', 'private, no-store')
        .send(fs.createReadStream(path.join(UPLOAD_DIR, e.stored_name)));
    }
  );
}