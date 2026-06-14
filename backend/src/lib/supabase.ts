import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { env } from '../config/env';
import { unauthorized } from './errors';

/**
 * Server-side Supabase admin client (service-role key). Used for admin user
 * management (e.g. deleting a user from Supabase Auth) — never exposed to clients.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const ISSUER = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;

// JWKS for asymmetric (RS256/ES256) verification — the modern Supabase default.
const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));
// HS256 secret for legacy projects (only if SUPABASE_JWT_SECRET is set).
const hsSecret = env.SUPABASE_JWT_SECRET
  ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
  : null;

export interface SupabaseIdentity {
  userId: string;
  email: string;
  name?: string;
}

/**
 * Verify a Supabase access token locally (no network call on the hot path) and
 * return the identity. Uses the shared secret if configured (legacy HS256),
 * otherwise the project's JWKS (asymmetric keys).
 */
export async function verifySupabaseToken(token: string): Promise<SupabaseIdentity> {
  let payload: JWTPayload;
  try {
    const verified = hsSecret
      ? await jwtVerify(token, hsSecret, { issuer: ISSUER, audience: 'authenticated' })
      : await jwtVerify(token, jwks, { issuer: ISSUER, audience: 'authenticated' });
    payload = verified.payload;
  } catch {
    throw unauthorized('Invalid or expired token');
  }

  const userId = payload.sub;
  if (!userId) throw unauthorized('Token missing subject');

  const meta = (payload.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    (typeof meta.name === 'string' && meta.name) ||
    (typeof meta.full_name === 'string' && meta.full_name) ||
    undefined;

  return {
    userId,
    email: typeof payload.email === 'string' ? payload.email : '',
    name: name || undefined,
  };
}
