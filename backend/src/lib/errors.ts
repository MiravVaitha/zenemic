/**
 * Application error with an HTTP status. Thrown anywhere in the request path;
 * the global error middleware turns it into a JSON response.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg: string, details?: unknown) =>
  new AppError(400, msg, 'bad_request', details);

export const unauthorized = (msg = 'Not authenticated') =>
  new AppError(401, msg, 'unauthorized');

export const forbidden = (msg = 'Not allowed') => new AppError(403, msg, 'forbidden');

export const notFound = (msg = 'Not found') => new AppError(404, msg, 'not_found');

export const conflict = (msg: string) => new AppError(409, msg, 'conflict');

/**
 * Raised when an optional integration is used but its API key isn't configured.
 * Surfaces as 503 so the client can tell "this feature is off" from "this broke".
 */
export const notConfigured = (integration: string) =>
  new AppError(
    503,
    `${integration} is not configured on this server. Set the relevant keys in .env.local.`,
    'not_configured',
  );
