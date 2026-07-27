/**
 * Turns anything thrown by the API client (or Supabase) into a string that is safe
 * and useful to show a user.
 *
 * The backend only ever puts deliberate, user-facing copy in an `AppError` message;
 * everything else now comes back as a generic string plus an `errorId`. This helper
 * is the client-side half of that contract — including a last-resort guard, so an
 * internal dump can't reach the UI even if a server somewhere is running older code.
 */

const DEFAULT = 'Something went wrong. Try again.';

type ErrorLike = { code?: unknown; status?: unknown; message?: unknown; errorId?: unknown };

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/** Heuristics for text that is plainly an internal dump rather than a message. */
function looksInternal(message: string): boolean {
  return (
    message.length > 200 ||
    message.includes('\n') ||
    /Invalid `prisma\./.test(message) ||
    /[A-Za-z]:\\|\/node_modules\//.test(message) ||
    /postgres(ql)?:\/\//.test(message)
  );
}

export function friendlyError(e: unknown, fallback: string = DEFAULT): string {
  const err = (e ?? {}) as ErrorLike;
  const id = str(err.errorId);
  // The id is worthless to the user on its own, but it's what makes a screenshot or a
  // bug report matchable to the full stack trace in the server log.
  const withId = (text: string) => (id ? `${text} (${id})` : text);

  switch (str(err.code)) {
    case 'network_error':
      return "Couldn't reach Zenemic. Check your connection and try again.";
    case 'service_unavailable':
      return withId('Zenemic is having trouble right now. Try again in a moment.');
    case 'unauthorized':
      return 'Your session has expired. Log in again.';
    case 'not_configured':
      return "That feature isn't set up on the server yet.";
    case 'internal':
      return withId(fallback);
  }

  const message = str(err.message)?.trim();
  if (!message || looksInternal(message)) return withId(fallback);
  return message;
}
