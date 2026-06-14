import type { RequestHandler } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { badRequest } from '../lib/errors';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validate (and coerce) request parts against zod schemas. Replaces req.body /
 * query / params with the parsed, typed result so handlers get clean input.
 */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) req.query = schemas.query.parse(req.query) as typeof req.query;
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return next(
          badRequest(
            'Validation failed',
            err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          ),
        );
      }
      next(err);
    }
  };
