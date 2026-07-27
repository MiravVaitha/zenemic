/**
 * Shared throttling for the Supabase auth emails the app can trigger — the
 * password-reset link and the sign-up confirmation. Only the pure parts live
 * here; each screen keeps its own state, because what the cooldown is keyed to
 * differs (Forgot lets you change the address mid-flow, Sign-up does not).
 */

/**
 * Cooldown before another email may be requested, indexed by resend count
 * ([first send, resend 1, resend 2, resend 3]). The first entry matters: Supabase
 * opens its own ~60s per-address window on the *initial* send, so starting the
 * countdown only on resends would leave the UI out of step with the server.
 */
export const COOLDOWN_SECONDS = [60, 60, 120, 300];
export const MAX_RESENDS = 3;

export const cooldownFor = (resendCount: number) =>
  COOLDOWN_SECONDS[Math.min(resendCount, COOLDOWN_SECONDS.length - 1)];

/** Cooldowns are keyed to the address, so compare normalised forms. */
export const normalise = (email: string) => email.trim().toLowerCase();

/**
 * Supabase's raw auth errors are never shown as-is — they expose rate-limit
 * internals, and on the reset screen we don't want to differentiate a registered
 * address from an unknown one. `retryAfter` (seconds), when present, comes from
 * the server's own window and is preferred over our local guess.
 */
export function friendlyAuthEmailError(e: unknown): { message: string; retryAfter?: number } {
  const err = e as { message?: string; status?: number; code?: string };
  const raw = err?.message ?? '';
  // Resending a sign-up confirmation to an address that is already confirmed is
  // rejected outright. It isn't a rate limit, so never start a cooldown for it —
  // no amount of waiting makes it work.
  if (/already (been )?confirmed|already registered|already signed up/i.test(raw)) {
    return { message: 'That address is already confirmed — log in instead.' };
  }
  // "For security purposes, you can only request this after 51 seconds."
  const after = /after (\d+) seconds?/i.exec(raw);
  if (after) {
    return {
      message: 'Hang on a moment before requesting another email.',
      retryAfter: Number(after[1]),
    };
  }
  if (err?.status === 429 || err?.code === 'over_email_send_rate_limit' || /rate limit/i.test(raw)) {
    return { message: 'Too many requests. Wait a few minutes and try again.', retryAfter: 300 };
  }
  return { message: "Couldn't send the email right now. Check the address and try again." };
}
