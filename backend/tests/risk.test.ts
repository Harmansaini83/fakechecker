import { describe, it, expect } from 'vitest';
import { haversineKm } from '../src/services/geo.js';
import { evaluateScanPattern } from '../src/services/risk.js';

const NAGPUR = { lat: 21.1458, lng: 79.0882 };
const DELHI = { lat: 28.6139, lng: 77.209 };
const now = new Date();
const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000);

describe('haversineKm', () => {
  it('is 0 for the same point', () => {
    expect(haversineKm(NAGPUR, NAGPUR)).toBeCloseTo(0);
  });
  it('Nagpur to Delhi is roughly 850 km', () => {
    const d = haversineKm(NAGPUR, DELHI);
    expect(d).toBeGreaterThan(800);
    expect(d).toBeLessThan(900);
  });
});

describe('evaluateScanPattern', () => {
  it('normal scan has no reasons', () => {
    const r = evaluateScanPattern({ scanCount30d: 3, mode: 'farmer', now });
    expect(r.reasons).toHaveLength(0);
    expect(r.score).toBe(0);
  });
  it('flags high scan count for farmers', () => {
    const r = evaluateScanPattern({ scanCount30d: 25, mode: 'farmer', now });
    expect(r.reasons[0].code).toBe('HIGH_SCAN_COUNT');
  });
  it('same count is fine in retailer mode', () => {
    const r = evaluateScanPattern({ scanCount30d: 25, mode: 'retailer', now });
    expect(r.reasons).toHaveLength(0);
  });
  it('flags a fast geo jump', () => {
    const r = evaluateScanPattern({
      scanCount30d: 1,
      mode: 'farmer',
      now,
      current: DELHI,
      last: { at: minsAgo(10), location: NAGPUR },
    });
    expect(r.reasons[0].code).toBe('GEO_JUMP');
  });
  it('does not flag a slow, realistic trip', () => {
    const r = evaluateScanPattern({
      scanCount30d: 1,
      mode: 'farmer',
      now,
      current: DELHI,
      last: { at: minsAgo(60 * 48), location: NAGPUR },
    });
    expect(r.reasons).toHaveLength(0);
  });
  it('ignores geo check when no location is given', () => {
    const r = evaluateScanPattern({
      scanCount30d: 1,
      mode: 'farmer',
      now,
      last: { at: minsAgo(10), location: NAGPUR },
    });
    expect(r.reasons).toHaveLength(0);
  });
});