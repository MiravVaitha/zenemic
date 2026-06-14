import { PrismaClient } from '@prisma/client';
import { isDev } from '../config/env';

/**
 * Single shared PrismaClient. In dev we stash it on globalThis so `tsx watch`
 * hot-reloads don't open a new connection pool on every file change.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isDev ? ['warn', 'error'] : ['error'],
  });

if (isDev) globalForPrisma.prisma = prisma;
