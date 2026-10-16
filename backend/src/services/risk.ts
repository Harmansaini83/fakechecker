import { haversineKm, type LatLng } from './geo.js';

export type { LatLng };
export type Reason = { code: string; message: string };

export const RULES = {
  maxScans30dFarmer: 20,
  maxScans30dRetailer: 60,
  maxSpeedKmh: 300,
  minDistanceKm: 50,
  pointsHighScanCount: 50,
  pointsGeoJump: 60,
};

export type ScanPatternInput = {
  scanCount30d: number;
  mode: 'farmer' | 'retailer';
  now: Date;
  current?: LatLng;
  last?: { at: Date; location: LatLng } | null;
};

export function evaluateScanPattern(input: ScanPatternInput): { score: number; reasons: Reason[] } {
  const reasons: Reason[] = [];
  let score = 0;

  const limit = input.mode === 'retailer' ? RULES.maxScans30dRetailer : RULES.maxScans30dFarmer;
  if (input.scanCount30d >= limit) {
    score += RULES.pointsHighScanCount;
    reasons.push({
      code: 'HIGH_SCAN_COUNT',
      message: `This package was scanned ${input.scanCount30d} times in 30 days, which is unusually high.`,
    });
  }

  if (input.current && input.last) {
    const km = haversineKm(input.current, input.last.location);
    const hours = Math.max((input.now.getTime() - input.last.at.getTime()) / 3_600_000, 1 / 60);
    const speed = km / hours;
    if (km >= RULES.minDistanceKm && speed > RULES.maxSpeedKmh) {
      score += RULES.pointsGeoJump;
      reasons.push({
        code: 'GEO_JUMP',
        message: `The same package was scanned ${Math.round(km)} km away a short time ago.`,
      });
    }
  }

  return { score: Math.min(score, 100), reasons };
}