import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env';
import { badRequest } from './errors';

/**
 * Short-lived signed "state" token for the Google OAuth round-trip, so the
 * callback can't be forged. Signed with the backend's internal APP_SECRET
 * (unrelated to Supabase Auth tokens).
 */
const secret = new TextEncoder().encode(env.APP_SECRET);
const PURPOSE = 'google_oauth';

export async function signOAuthState(userId: string): Promise<string> {
  return new SignJWT({ purpose: PURPOSE })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret);
}

export async function verifyOAuthState(state: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(state, secret);
    if (payload.purpose !== PURPOSE || !payload.sub) throw new Error('bad state');
    return payload.sub;
  } catch {
    throw badRequest('Invalid or expired OAuth state');
  }
}
