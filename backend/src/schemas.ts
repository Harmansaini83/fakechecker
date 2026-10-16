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