import crypto from 'node:crypto';
import { env } from '../config/env';

/**
 * Capability URL for the static-map proxy (`GET /api/events/:id/map.png`). The
 * static map needs the Google Maps API key, which must stay server-side, so the
 * app can't build the Google URL itself — it loads the backend proxy instead.
 * That proxy is unauthenticated (an <Image> can't easily send a Bearer token),
 * so we gate it with a short-lived HMAC signature over the event id.
 *
 * HMAC (not the async `jose` JWT used for OAuth state) so `serializeEvent` can
 * mint the URL synchronously.
 */
const TTL_MS = 60 * 60 * 1000; // 1 hour — comfortably longer than a screen view

function sign(eventId: string, exp: number): string {
  return crypto
    .createHmac('sha256', env.APP_SECRET)
    .update(`${eventId}.${exp}`)
    .digest('base64url');
}

/** Relative, signed path the app loads as an <Image> source. */
export function signMapUrl(eventId: string): string {
  const exp = Date.now() + TTL_MS;
  return `/events/${eventId}/map.png?exp=${exp}&sig=${sign(eventId, exp)}`;
}

/** Verify a signed map request (constant-time, expiry-checked). */
export function verifyMapToken(eventId: string, exp: string | undefined, sig: string | undefined): boolean {
  if (!exp || !sig) return false;
  const expMs = Number(exp);
  if (!Number.isFinite(expMs) || expMs < Date.now()) return false;
  const expected = Buffer.from(sign(eventId, expMs));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
