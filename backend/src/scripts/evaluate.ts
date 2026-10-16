import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { verifyCode } from '../services/verdict.js';
import { pool } from '../db/pool.js';

type Case = {
  name: string;
  code: string;
  expected: string;
  scanMode?: 'farmer' | 'retailer';
  location?: { lat: number; lng: number };
};
type Result = { name: string; category: string; expected: string; actual: string; ms: number };

const cases: Case[] = JSON.parse(fs.readFileSync('tests/testcases.json', 'utf8'));

const CATEGORIES = [
  'genuine', 'expired', 'recalled', 'legit repeat scans',
  'forged payload', 'forged signature', 'malformed', 'unknown issuer',
  'unknown package', 'cloned high scan count', 'cloned geo jump', 'confirmed counterfeit',
];
const NORMAL = new Set(['genuine', 'expired', 'recalled', 'legit repeat scans']);
const categoryOf = (n: string) => CATEGORIES.find((c) => n.startsWith(c)) ?? 'other';

const results: Result[] = [];
for (const c of cases) {
  const t0 = performance.now();
  const r = await verifyCode(c.code, { location: c.location, scanMode: c.scanMode, record: false });
  results.push({
    name: c.name,
    category: categoryOf(c.name),
    expected: c.expected,
    actual: r.verdict,
    ms: performance.now() - t0,
  });
}

const rate = (a: number, b: number) => (b === 0 ? 0 : a / b);
const pct = (x: number) => (x * 100).toFixed(1) + '%';
const accuracy = (rs: Result[]) => rate(rs.filter((r) => r.expected === r.actual).length, rs.length);

const normal = results.filter((r) => NORMAL.has(r.category));
const adversarial = results.filter((r) => !NORMAL.has(r.category));

// False positive: genuine package NOT returned as verified
const genuine = results.filter((r) => r.expected === 'verified');
const fp = genuine.filter((r) => r.actual !== 'verified').length;
// False negative: bad package (forged, cloned, recalled, expired, counterfeit) returned as verified
const bad = results.filter((r) => !['verified', 'unverified'].includes(r.expected));
const fn = bad.filter((r) => r.actual === 'verified').length;

const times = results.map((r) => r.ms).sort((a, b) => a - b);
const p50 = times[Math.floor(0.5 * (times.length - 1))];
const p95 = times[Math.ceil(0.95 * times.length) - 1];

const summary = {
  generatedAt: new Date().toISOString(),
  dataType: 'synthetic demo data',
  totalCases: results.length,
  overallAccuracy: accuracy(results),
  normalAccuracy: accuracy(normal),
  adversarialAccuracy: accuracy(adversarial),
  falsePositiveRate: rate(fp, genuine.length),
  falseNegativeRate: rate(fn, bad.length),
  latencyMs: { p50: +p50.toFixed(1), p95: +p95.toFixed(1), max: +times[times.length - 1].toFixed(1) },
};

console.log('\n=== EVALUATION (synthetic demo data) ===');
console.log(`Total cases:           ${summary.totalCases}`);
console.log(`Overall accuracy:      ${pct(summary.overallAccuracy)}`);
console.log(`Normal subset:         ${pct(summary.normalAccuracy)}  (${normal.length} cases)`);
console.log(`Adversarial subset:    ${pct(summary.adversarialAccuracy)}  (${adversarial.length} cases)`);
console.log(`False-positive rate:   ${pct(summary.falsePositiveRate)}  (${fp}/${genuine.length} genuine flagged)`);
console.log(`False-negative rate:   ${pct(summary.falseNegativeRate)}  (${fn}/${bad.length} bad passed as verified)`);
console.log(`Latency (server-side): p50 ${summary.latencyMs.p50} ms, p95 ${summary.latencyMs.p95} ms, max ${summary.latencyMs.max} ms\n`);

console.table(
  CATEGORIES.map((cat) => {
    const rs = results.filter((r) => r.category === cat);
    return { category: cat, cases: rs.length, accuracy: pct(accuracy(rs)) };
  })
);

const failures = results.filter((r) => r.expected !== r.actual);
failures.forEach((f) => console.log(`FAIL ${f.name}: expected ${f.expected}, got ${f.actual}`));

fs.mkdirSync('../docs', { recursive: true });
fs.writeFileSync('../docs/evaluation-latest.json', JSON.stringify({ summary, failures }, null, 2));

await pool.end();
process.exitCode = summary.overallAccuracy < 0.95 || fn > 0 ? 1 : 0;