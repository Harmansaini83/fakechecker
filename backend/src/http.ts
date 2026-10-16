export const ok = <T>(data: T) => ({ ok: true as const, data });

export const fail = (code: string, message: string, details?: unknown) => ({
  ok: false as const,
  error: { code, message, details },
});