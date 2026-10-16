import type { FastifyReply, FastifyRequest } from 'fastify';
import { fail } from '../http.js';

export type Role = 'manufacturer' | 'moderator' | 'admin';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { uid: number; role: Role; mid: number | null };
    user: { uid: number; role: Role; mid: number | null };
  }
}

export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send(fail('UNAUTHORIZED', 'Login required, or your session expired.'));
    }
    if (!roles.includes(req.user.role)) {
      return reply.status(403).send(fail('FORBIDDEN', 'You do not have permission to do this.'));
    }
  };
}

export const authenticate = requireRole('manufacturer', 'moderator', 'admin');