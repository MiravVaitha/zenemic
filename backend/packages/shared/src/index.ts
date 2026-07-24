/**
 * Public surface of @zenemic/shared — everything both backend services
 * (main-app + keyboard) build on. Import infra/AI/integrations/domain from here
 * instead of reaching across packages.
 */

// ── Infra ──────────────────────────────────────────────────────────────────
export { prisma } from './lib/prisma';
export * from './lib/errors'; // AppError, badRequest, unauthorized, forbidden, notFound, conflict, notConfigured
export * from './lib/money'; // minorUnitFactor, toMinor, toMajor, parseBudgetToMinor, formatMoney, evenSplit
export { asyncHandler } from './lib/http';
export { signOAuthState, verifyOAuthState } from './lib/oauthState';
export { signMapUrl, verifyMapToken } from './lib/mapToken';
export { supabaseAdmin, verifySupabaseToken, type SupabaseIdentity } from './lib/supabase';
export { env, isProd, isDev, corsOrigins, features } from './config/env';
export { logger } from './config/logger';

// ── Middleware ─────────────────────────────────────────────────────────────
export { authenticate, requireAuth, requireUserId } from './middleware/auth';
export { validate } from './middleware/validate';
export { notFoundHandler, errorHandler } from './middleware/error';

// ── AI (Anthropic) ─────────────────────────────────────────────────────────
// anthropic, completeStructured, completeText, MODELS, extractEvent, generateChart,
// itemizeReceipt, runEventChat, draftMessage, prompts + their types.
export * from './ai';

// ── Integrations (namespaced) ──────────────────────────────────────────────
// stripe, googleCalendar, googleMaps, storage, push, email.
export * from './integrations';

// ── Domain services ────────────────────────────────────────────────────────
export * as events from './domain/events.service';
export * as resources from './domain/resources.service';
export * from './domain/events.serializer'; // serializeEvent/Stage/AlbumPhoto/Chart/Attendee/Split/Receipt
export { deriveEventKind, type EventKindValue } from './domain/eventKind';
export * from './domain/splitter.service'; // createOrUpdateSplit, sendSplitRequests, setSplitShares, getSplit, splitStatusSummary
export { ensureProfile, toPublicUser } from './domain/profile';

// ── Prisma types (re-exported so services don't import @prisma/client directly) ──
export type { EventKind, RsvpStatus, StageKind, StageTag, User, Prisma } from '@prisma/client';
