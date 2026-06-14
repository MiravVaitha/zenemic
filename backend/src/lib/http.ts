import type { NextFunction, Request, Response, RequestHandler } from 'express';

/**
 * Wrap an async route handler so rejected promises reach Express's error
 * pipeline instead of hanging the request.
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
