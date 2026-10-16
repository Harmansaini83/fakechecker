import { z } from 'zod';

export const verifyBody = z.object({
  code: z.string().trim().min(1).max(500),
  scanMode: z.enum(['farmer', 'retailer']).default('farmer'),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
});
export const loginBody = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export const refreshBody = z.object({
  refreshToken: z.string().min(10).max(200),
});

export const createUserBody = z
  .object({
    email: z.string().trim().toLowerCase().email().max(200),
    password: z.string().min(10).max(72),
    role: z.enum(['manufacturer', 'moderator', 'admin']),
    manufacturerId: z.number().int().positive().optional(),
  })
  .refine(
    (d) => (d.role === 'manufacturer' ? d.manufacturerId !== undefined : d.manufacturerId === undefined),
    { message: 'manufacturerId is required for the manufacturer role and not allowed for others', path: ['manufacturerId'] }
  );

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const auditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});