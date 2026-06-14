import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors';
import { logger } from '../config/logger';
import { isProd } from '../config/env';

/** 404 fallback for unmatched routes. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } });
};

/** Terminal error handler — converts any thrown error into a JSON envelope. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    return res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, details: err.details } });
  }

  // Prisma "record not found" on a required mutation.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: { code: 'not_found', message: 'Record not found' } });
    }
    if (err.code === 'P2002') {
      return res.status(409).json({ error: { code: 'conflict', message: 'Already exists' } });
    }
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    error: {
      code: 'internal',
      message: isProd ? 'Something went wrong' : String((err as Error)?.message ?? err),
    },
  });
};
