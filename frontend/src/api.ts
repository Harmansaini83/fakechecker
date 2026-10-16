export type Verdict =
  | 'verified' | 'suspicious' | 'unverified' | 'invalid'
  | 'expired' | 'recalled' | 'confirmed_counterfeit';

export type ScanMode = 'farmer' | 'retailer';
export type LatLng = { lat: number; lng: number };

export type VerifyData = {
  verdict: Verdict;
  reasons?: unknown[];
  nextStep?: string;
  product?: { name?: string; [k: string]: unknown };
  [k: string]: unknown;
};

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const BASE = import.meta.env.VITE_API_URL ?? '';

export async function verify(code: string, scanMode: ScanMode, location?: LatLng): Promise<VerifyData> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, scanMode, location }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError('NETWORK', 'Cannot reach the server. Check your internet connection and try again.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    throw new ApiError(
      body?.error?.code ?? 'ERROR',
      res.status === 429
        ? 'Too many checks in a short time. Please wait a minute and try again.'
        : body?.error?.message ?? 'Something went wrong. Please try again.'
    );
  }
  return body.data as VerifyData;
}