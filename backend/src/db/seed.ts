import fs from 'node:fs';
import crypto from 'node:crypto';
import { pool } from './pool.js';
import { hashPassword } from '../services/password.js';
import {
  generateKeyPair,
  loadPrivateKey,
  buildCode,
  signPayload,
} from '../services/signing.js';

const KEY_ID = 'k1';
generateKeyPair(KEY_ID);
const privateKey = loadPrivateKey(KEY_ID);

type Case = {
  name: string;
  code: string;
  expected: string;
  scanMode?: 'farmer' | 'retailer';
  location?: { lat: number; lng: number };
};
const cases: Case[] = [];

const NAGPUR = { lat: 21.1458, lng: 79.0882 };
const DELHI = { lat: 28.6139, lng: 77.209 };
const DAY = 24 * 60 * 60 * 1000;
const dateOffset = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
const newPublicId = () => 'PKG-' + crypto.randomBytes(4).toString('hex').toUpperCase();

async function insertBatch(
  productId: number,
  code: string,
  mfgDays: number,
  expDays: number,
  status: string,
  reason: string | null = null
): Promise<number> {
  const r = await pool.query(
    `INSERT INTO batches (product_id, batch_code, mfg_date, expiry_date, status, recall_reason)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [productId, code, dateOffset(mfgDays), dateOffset(expDays), status, reason]
  );
  return r.rows[0].id;
}

async function addPackage(batchId: number, status = 'active') {
  const publicId = newPublicId();
  const r = await pool.query(
    'INSERT INTO packages (public_id, batch_id, key_id, status) VALUES ($1,$2,$3,$4) RETURNING id',
    [publicId, batchId, KEY_ID, status]
  );
  return { id: r.rows[0].id as number, publicId, code: buildCode(KEY_ID, publicId, privateKey) };
}

async function addScan(pkgId: number, code: string, loc: { lat: number; lng: number }, minutesAgo: number) {
  await pool.query(
    `INSERT INTO scans (package_id, raw_code, location, verdict, scanned_at)
     VALUES ($1, $2, ST_SetSRID(ST_MakePoint($4::float8, $3::float8), 4326)::geography,
             'verified', now() - make_interval(mins => $5::int))`,
    [pkgId, code, loc.lat, loc.lng, minutesAgo]
  );
}

async function main() {
  await pool.query(
    'TRUNCATE audit_log, reports, scans, packages, batches, products, manufacturers RESTART IDENTITY CASCADE'
  );

  const mfrs: { name: string; lic: string; products: [string, string][] }[] = [
    { name: 'Demo AgroSeeds Pvt Ltd', lic: 'DEMO-LIC-001',
      products: [['Hybrid Cotton Seed H1', 'seed'], ['Soybean Seed S9', 'seed']] },
    { name: 'Demo GreenCrop Pesticides', lic: 'DEMO-LIC-002',
      products: [['Neem Shield 300', 'pesticide'], ['CropGuard Plus', 'pesticide']] },
    { name: 'Demo FertiPlus Industries', lic: 'DEMO-LIC-003',
      products: [['NPK 19-19-19', 'fertilizer'], ['Urea Prime 46', 'fertilizer']] },
  ];

  const genuine: { id: number; publicId: string; code: string }[] = [];
  const activeBatchIds: number[] = [];
  let n = 0;

  for (const m of mfrs) {
    const mr = await pool.query(
      'INSERT INTO manufacturers (name, license_no, verified) VALUES ($1,$2,true) RETURNING id',
      [m.name, m.lic]
    );
    let first = true;
    for (const [pname, cat] of m.products) {
      n++;
      const pr = await pool.query(
        `INSERT INTO products (manufacturer_id, name, category, registration_no, approved_states)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [mr.rows[0].id, pname, cat, `DEMO-REG-${String(n).padStart(3, '0')}`, ['Maharashtra', 'Madhya Pradesh']]
      );
      const pid = pr.rows[0].id;

      const active = await insertBatch(pid, `A${n}`, -60, 365, 'active');
      activeBatchIds.push(active);
      for (let i = 0; i < 5; i++) {
        const p = await addPackage(active);
        genuine.push(p);
        cases.push({ name: `genuine ${p.publicId}`, code: p.code, expected: 'verified' });
      }

      const expired = await insertBatch(pid, `E${n}`, -400, -30, 'active');
      const ex = await addPackage(expired);
      cases.push({ name: `expired ${pname}`, code: ex.code, expected: 'expired' });

      if (first) {
        const rec = await insertBatch(pid, `R${n}`, -90, 300, 'recalled', 'Demo recall: quality failure');
        const rp = await addPackage(rec);
        cases.push({ name: `recalled ${pname}`, code: rp.code, expected: 'recalled' });
        first = false;
      }
    }
  }

  // Forged: payload tampered
  genuine.slice(0, 5).forEach((g, i) => {
    const [a, b, c, d] = g.code.split('.');
    const bad = c.slice(0, -1) + (c.endsWith('A') ? 'B' : 'A');
    cases.push({ name: `forged payload ${i + 1}`, code: [a, b, bad, d].join('.'), expected: 'invalid' });
  });
  // Forged: signature tampered
  genuine.slice(5, 8).forEach((g, i) => {
    const [a, b, c, d] = g.code.split('.');
    cases.push({
      name: `forged signature ${i + 1}`,
      code: [a, b, c, d.split('').reverse().join('')].join('.'),
      expected: 'invalid',
    });
  });
  // Malformed
  ['hello world', 'FC1.k1.PKG-ZZZZ', 'https://example.com/p/123', 'FC1.k1.a.b.c.d', '1234567890'].forEach(
    (c, i) => cases.push({ name: `malformed ${i + 1}`, code: c, expected: 'invalid' })
  );

  // Unknown issuer (valid signature, key we do not trust)
  const rogue = crypto.generateKeyPairSync('ed25519').privateKey;
  for (let i = 0; i < 3; i++) {
    const payload = `FC1.k9.${newPublicId()}`;
    cases.push({
      name: `unknown issuer ${i + 1}`,
      code: `${payload}.${signPayload(payload, rogue)}`,
      expected: 'unverified',
    });
  }
  // Valid signature, package not in database
  for (let i = 0; i < 3; i++) {
    cases.push({
      name: `unknown package ${i + 1}`,
      code: buildCode(KEY_ID, newPublicId(), privateKey),
      expected: 'unverified',
    });
  }

  // Suspicious: too many scans
  for (let i = 0; i < 2; i++) {
    const p = await addPackage(activeBatchIds[i]);
    for (let s = 0; s < 40; s++) await addScan(p.id, p.code, NAGPUR, 60 + s * 60);
    cases.push({ name: `cloned high scan count ${i + 1}`, code: p.code, expected: 'suspicious', location: NAGPUR });
  }
  // Suspicious: scanned in Nagpur 10 min ago, now scanned from Delhi
  for (let i = 0; i < 2; i++) {
    const p = await addPackage(activeBatchIds[i + 2]);
    await addScan(p.id, p.code, NAGPUR, 10);
    cases.push({ name: `cloned geo jump ${i + 1}`, code: p.code, expected: 'suspicious', location: DELHI });
  }
  // Must NOT be suspicious: normal repeat scans, one per day, same city
  for (let i = 0; i < 2; i++) {
    const p = await addPackage(activeBatchIds[i + 4]);
    for (let s = 0; s < 8; s++) await addScan(p.id, p.code, NAGPUR, (s + 1) * 1440);
    cases.push({ name: `legit repeat scans ${i + 1}`, code: p.code, expected: 'verified', scanMode: 'retailer', location: NAGPUR });
  }

  // Confirmed counterfeit (set by moderator)
  for (let i = 0; i < 2; i++) {
    const p = await addPackage(activeBatchIds[i], 'counterfeit_confirmed');
    cases.push({ name: `confirmed counterfeit ${i + 1}`, code: p.code, expected: 'confirmed_counterfeit' });
  }
  // Demo staff accounts (local demo only)
  const demoHash = await hashPassword('Demo@12345');
  
  await pool.query(
    `INSERT INTO admin_users (email, password_hash, role, manufacturer_id) VALUES
     ('admin@demo.test', $1, 'admin', NULL),
     ('moderator@demo.test', $1, 'moderator', NULL),
     ('manufacturer@demo.test', $1, 'manufacturer', 1)`,
    [demoHash]
  );

  await pool.query(
    `UPDATE packages p SET scan_count = s.c, first_scan_at = s.f
     FROM (SELECT package_id, count(*) c, min(scanned_at) f FROM scans GROUP BY package_id) s
     WHERE s.package_id = p.id`
  );

  fs.mkdirSync('tests', { recursive: true });
  fs.writeFileSync('tests/testcases.json', JSON.stringify(cases, null, 2));

  const summary: Record<string, number> = {};
  cases.forEach((c) => (summary[c.expected] = (summary[c.expected] || 0) + 1));
  console.log('seed done. test cases:', cases.length, summary);
  await pool.end();
}

main();