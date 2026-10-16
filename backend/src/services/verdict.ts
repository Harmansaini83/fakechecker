import { pool } from '../db/pool.js';
import { parseCode, loadPublicKey, verifySignature } from './signing.js';
import { evaluateScanPattern, type LatLng, type Reason } from './risk.js';

export type Verdict =
  | 'verified'
  | 'suspicious'
  | 'unverified'
  | 'invalid'
  | 'expired'
  | 'recalled'
  | 'confirmed_counterfeit';

export type ScanMode = 'farmer' | 'retailer';
export type VerifyOptions = { location?: LatLng; scanMode?: ScanMode; record?: boolean };

export type ProductInfo = {
  name: string;
  category: string;
  manufacturer: string;
  batchCode: string;
  expiryDate: string;
};

export type VerifyResult = {
  verdict: Verdict;
  riskScore: number;
  reasons: Reason[];
  nextStep: string;
  product?: ProductInfo;
  checkedAt: string;
};

const NEXT_STEP: Record<Verdict, string> = {
  verified:
    'Digitally verified. This does not prove the contents are genuine. Buy from licensed shops and keep your bill.',
  suspicious:
    'Do not use yet. Ask the seller for the bill, compare the packaging, and report this product.',
  unverified:
    'We cannot confirm this product. It may still be genuine. Ask the seller for the licence and bill.',
  invalid: 'This code is not valid. Do not trust this packet. Please report it.',
  expired: 'Do not use. This batch is past its expiry date.',
  recalled: 'Do not use. This batch has been recalled. Return it to the seller.',
  confirmed_counterfeit:
    'Confirmed counterfeit after review. Do not use. Report where you bought it.',
};

export async function verifyCode(rawCode: string, opts: VerifyOptions = {}): Promise<VerifyResult> {
  const { location, scanMode = 'farmer', record = true } = opts;

  const finish = async (
    verdict: Verdict,
    riskScore: number,
    reasons: Reason[],
    packageId: number | null = null,
    product?: ProductInfo
  ): Promise<VerifyResult> => {
    if (record) {
      await pool.query(
        `INSERT INTO scans (package_id, raw_code, scan_mode, location, verdict, risk_score, reasons)
         VALUES ($1,$2,$3,
           CASE WHEN $4::float8 IS NULL THEN NULL
                ELSE ST_SetSRID(ST_MakePoint($5::float8,$4::float8),4326)::geography END,
           $6,$7,$8::jsonb)`,
        [
          packageId,
          rawCode.slice(0, 500),
          scanMode,
          location?.lat ?? null,
          location?.lng ?? null,
          verdict,
          riskScore,
          JSON.stringify(reasons),
        ]
      );
      if (packageId) {
        await pool.query(
          `UPDATE packages SET scan_count = scan_count + 1,
             first_scan_at = COALESCE(first_scan_at, now()) WHERE id = $1`,
          [packageId]
        );
      }
    }
    return {
      verdict,
      riskScore,
      reasons,
      nextStep: NEXT_STEP[verdict],
      product,
      checkedAt: new Date().toISOString(),
    };
  };

  // 1. Format
  const parsed = parseCode(rawCode);
  if (!parsed) {
    return finish('invalid', 90, [{ code: 'MALFORMED', message: 'The code format is not recognised.' }]);
  }

  // 2. Trusted issuer
  const publicKey = loadPublicKey(parsed.keyId);
  if (!publicKey) {
    return finish('unverified', 30, [
      { code: 'UNKNOWN_ISSUER', message: 'The issuer of this code is not recognised.' },
    ]);
  }

  // 3. Signature
  if (!verifySignature(parsed, publicKey)) {
    return finish('invalid', 90, [
      { code: 'BAD_SIGNATURE', message: 'The digital signature does not match. The code may be forged.' },
    ]);
  }

  // 4. Package record
  const found = await pool.query(
    `SELECT p.id, p.status AS package_status,
            b.batch_code, b.status AS batch_status, b.recall_reason,
            b.expiry_date::text AS expiry_date, (b.expiry_date < CURRENT_DATE) AS is_expired,
            pr.name AS product_name, pr.category, m.name AS manufacturer
     FROM packages p
     JOIN batches b ON b.id = p.batch_id
     JOIN products pr ON pr.id = b.product_id
     JOIN manufacturers m ON m.id = pr.manufacturer_id
     WHERE p.public_id = $1`,
    [parsed.publicId]
  );
  const row = found.rows[0];
  if (!row) {
    return finish('unverified', 30, [
      { code: 'PACKAGE_NOT_FOUND', message: 'This package is not in our records.' },
    ]);
  }

  const product: ProductInfo = {
    name: row.product_name,
    category: row.category,
    manufacturer: row.manufacturer,
    batchCode: row.batch_code,
    expiryDate: row.expiry_date,
  };

  // 5. Status checks
  if (row.package_status === 'counterfeit_confirmed') {
    return finish('confirmed_counterfeit', 100, [
      { code: 'COUNTERFEIT_CONFIRMED', message: 'A moderator confirmed this package as counterfeit.' },
    ], row.id, product);
  }
  if (row.package_status === 'revoked') {
    return finish('invalid', 90, [
      { code: 'PACKAGE_REVOKED', message: 'This package code was revoked by the manufacturer.' },
    ], row.id, product);
  }
  if (row.batch_status === 'recalled') {
    return finish('recalled', 95, [
      { code: 'BATCH_RECALLED', message: row.recall_reason || 'This batch has been recalled.' },
    ], row.id, product);
  }
  if (row.is_expired) {
    return finish('expired', 70, [
      { code: 'BATCH_EXPIRED', message: `This batch expired on ${row.expiry_date}.` },
    ], row.id, product);
  }

  // 6. Scan pattern
  const count = await pool.query(
    `SELECT count(*)::int AS c FROM scans
     WHERE package_id = $1 AND scanned_at > now() - interval '30 days'`,
    [row.id]
  );
  const lastQ = await pool.query(
    `SELECT scanned_at, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
     FROM scans WHERE package_id = $1 AND location IS NOT NULL
     ORDER BY scanned_at DESC LIMIT 1`,
    [row.id]
  );
  const last = lastQ.rows[0]
    ? { at: lastQ.rows[0].scanned_at as Date, location: { lat: lastQ.rows[0].lat, lng: lastQ.rows[0].lng } }
    : null;

  const pattern = evaluateScanPattern({
    scanCount30d: count.rows[0].c,
    mode: scanMode,
    now: new Date(),
    current: location,
    last,
  });

  if (pattern.reasons.length > 0) {
    return finish('suspicious', pattern.score, pattern.reasons, row.id, product);
  }

  return finish(
    'verified',
    0,
    [{ code: 'SIGNATURE_AND_BATCH_OK', message: 'Signature, product and batch records are valid.' }],
    row.id,
    product
  );
}