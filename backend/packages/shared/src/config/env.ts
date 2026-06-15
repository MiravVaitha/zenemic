import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

/**
 * The WHOLE repo shares ONE env file at the repository root, so the backend
 * services and the Expo app (via main-app/app.config.js) read the same
 * secrets/config. Resolve it relative to this file (works from src in dev and
 * dist in build). `.env.local` wins over `.env`; anything already in process.env
 * (e.g. a platform-injected PORT) wins over both.
 */
const ENV_ROOT = path.resolve(__dirname, '../../../../..'); // packages/shared/{src,dist}/config -> repo root
loadEnv({ path: path.join(ENV_ROOT, '.env.local') });
loadEnv({ path: path.join(ENV_ROOT, '.env') });

/**
 * Central, validated view of the environment. Import `env` from here instead of
 * reading `process.env` directly so the whole app fails fast (at boot) with a
 * readable error when a required variable is missing or malformed.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Per-service ports — both live in the one shared env file without colliding.
  MAIN_APP_PORT: z.coerce.number().int().positive().default(4000),
  KEYBOARD_PORT: z.coerce.number().int().positive().default(4100),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('*'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Required infra. DATABASE_URL = Supabase pooled connection (used at runtime).
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Direct (non-pooled) connection — used by Prisma migrate/introspect only.
  DIRECT_URL: z.string().optional(),

  // Auth — Supabase owns identity; the backend verifies Supabase access tokens.
  SUPABASE_URL: z.string().url('SUPABASE_URL is required, e.g. https://xxxx.supabase.co'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  // Optional: only for LEGACY (HS256) projects. Leave blank to verify via JWKS.
  SUPABASE_JWT_SECRET: z.string().optional(),
  // Internal secret used to sign short-lived Google OAuth "state" tokens.
  APP_SECRET: z.string().min(16, 'APP_SECRET must be set (>=16 chars)'),

  // Anthropic (required — it's the core of the product).
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  ANTHROPIC_MODEL: z.string().default('claude-opus-4-8'),
  ANTHROPIC_EXTRACTION_MODEL: z.string().optional(),
  ANTHROPIC_MAX_TOKENS: z.coerce.number().int().positive().default(4096),

  // Google (optional).
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z
    .string()
    .default('http://localhost:4000/api/integrations/google/callback'),
  GOOGLE_MAPS_API_KEY: z.string().optional(),

  // Stripe (optional).
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_CURRENCY: z.string().default('gbp'),

  // Transport for London (optional).
  TFL_APP_KEY: z.string().optional(),

  // Object storage (optional).
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().optional(),

  // Expo push (optional).
  EXPO_ACCESS_TOKEN: z.string().optional(),

  // Email (optional).
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Zenemic <no-reply@zenemic.app>'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`\n✖ Invalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';

/** Allowed CORS origins as an array, or true for "*". */
export const corsOrigins: string[] | boolean =
  env.CORS_ORIGINS.trim() === '*'
    ? true
    : env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);

/** Feature flags derived from which integration keys are present. */
export const features = {
  anthropic: Boolean(env.ANTHROPIC_API_KEY),
  googleCalendar: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  googleMaps: Boolean(env.GOOGLE_MAPS_API_KEY),
  stripe: Boolean(env.STRIPE_SECRET_KEY),
  tfl: Boolean(env.TFL_APP_KEY),
  storage: Boolean(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY),
  push: true, // Expo push works without an access token unless security is enabled.
  email: Boolean(env.RESEND_API_KEY),
} as const;
