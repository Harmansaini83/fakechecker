import type { ZodError } from 'zod';

export const ok = <T>(data: T) => ({ ok: true as const, data });

export const fail = (code: string, message: string, details?: unknown) => ({
  ok: false as const,
  error: { code, message, details },
});

export const validationFail = (e: ZodError) =>
  fail(
    'VALIDATION_ERROR',
    'Invalid request.',
    e.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
  );