import type { Request, RequestHandler } from 'express';
import { verifySupabaseToken, type SupabaseIdentity } from '../lib/supabase';
import { unauthorized } from '../lib/errors';

/**
 * Requires a valid Supabase access token in `Authorization: Bearer <token>`.
 * On success attaches `req.auth = { userId, email, name? }`.
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(unauthorized('Missing bearer token'));
  }
  const token = header.slice('Bearer '.length).trim();
  verifySupabaseToken(token)
    .then((identity) => {
      req.auth = identity;
      next();
    })
    .catch(next);
};

/** Throws if used without `authenticate`; returns the full identity. */
export function requireAuth(req: Request): SupabaseIdentity {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

/** Convenience for handlers that only need the user id. */
export function requireUserId(req: Request): string {
  return requireAuth(req).userId;
}
