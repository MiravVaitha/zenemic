import { randomBytes } from 'node:crypto';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors';
import { logger } from '../config/logger';

/** 404 fallback for unmatched routes. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } });
};

/**
 * Short correlation id. It goes in the response AND the log line, so a screenshot
 * from a phone can be matched to the full stack trace in the server log.
 */
const newErrorId = () => randomBytes(4).toString('hex');

/**
 * Terminal error handler — converts any thrown error into a JSON envelope.
 *
 * Only `AppError` messages reach the client: those are written for users. Anything
 * else is replaced with a generic string and logged in full server-side. This is
 * deliberately NOT gated on NODE_ENV — the repo shares one root env file, so the
 * phone talks to a `NODE_ENV=development` server during normal development and a
 * dev-only branch would leak Prisma's file paths and source frames into the UI.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    // 5xx AppErrors are still our bug; 4xx are the client's. Both were previously silent.
    if (err.status >= 500) logger.error({ err }, 'AppError');
    else logger.warn({ status: err.status, code: err.code, message: err.message }, 'Request rejected');
    return res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, details: err.details } });
  }

  // Prisma couldn't open a connection at all (bad credentials, pooler down, DB paused).
  // Nothing the client did — tell it to retry rather than dumping the connection string.
  if (err instanceof Prisma.PrismaClientInitializationError) {
    const errorId = newErrorId();
    logger.error({ err, errorId, prismaCode: err.errorCode }, 'Database unavailable');
    return res.status(503).json({
      error: {
        code: 'service_unavailable',
        message: 'Zenemic is having trouble reaching its database. Try again in a moment.',
        errorId,
      },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: { code: 'not_found', message: 'Record not found' } });
    }
    if (err.code === 'P2002') {
      return res.status(409).json({ error: { code: 'conflict', message: 'Already exists' } });
    }
    logger.warn({ err, prismaCode: err.code }, 'Unhandled Prisma request error');
  }

  const errorId = newErrorId();
  logger.error({ err, errorId }, 'Unhandled error');
  res.status(500).json({
    error: { code: 'internal', message: 'Something went wrong', errorId },
  });
};
