import pino from 'pino';
import { env, isDev } from './env';

export const logger = pino({
  level: env.LOG_LEVEL,
  // Pretty-print in dev; structured JSON in prod.
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
    : undefined,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.passwordHash',
      '*.password',
      '*.token',
    ],
    remove: true,
  },
});
