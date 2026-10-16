import { pool } from '../db/pool.js';

export async function audit(
  actorId: number | null,
  action: string,
  entity: string,
  entityId: string | null,
  details: Record<string, unknown> = {}
) {
  await pool.query(
    `INSERT INTO audit_log (actor_id, action, entity, entity_id, details)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [actorId, action, entity, entityId, JSON.stringify(details)]
  );
}