import type { User } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { supabaseAdmin, type SupabaseIdentity } from '../../lib/supabase';
import { notFound } from '../../lib/errors';
import { logger } from '../../config/logger';

export function toPublicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    defaultSplitMode: user.defaultSplitMode,
    notificationsEnabled: user.notificationsEnabled,
    googleCalendarConnected: Boolean(user.googleRefreshToken),
    createdAt: user.createdAt,
  };
}

/**
 * Ensure a local profile row exists for a Supabase-authenticated user, creating
 * it from the token's identity on first sight. Idempotent — safe to call on any
 * entry point that needs a guaranteed profile.
 */
export async function ensureProfile(identity: SupabaseIdentity): Promise<User> {
  const fallbackName = identity.name || identity.email.split('@')[0] || 'You';
  return prisma.user.upsert({
    where: { id: identity.userId },
    update: { email: identity.email || undefined },
    create: {
      id: identity.userId,
      email: identity.email,
      name: fallbackName,
    },
  });
}

/** GET /me — syncs + returns the profile (the client calls this after login). */
export async function getMe(identity: SupabaseIdentity) {
  return toPublicUser(await ensureProfile(identity));
}

export async function updateSettings(
  userId: string,
  input: {
    name?: string;
    defaultSplitMode?: 'EVEN' | 'BY_SHARE' | 'BY_ITEM';
    notificationsEnabled?: boolean;
    expoPushToken?: string | null;
  },
) {
  const user = await prisma.user.update({ where: { id: userId }, data: input }).catch(() => {
    throw notFound('Profile not found — call GET /me first');
  });
  return toPublicUser(user);
}

/**
 * Delete the account: remove the local profile (cascades events, splits, chat,
 * etc.) AND delete the Supabase Auth user so the login can't be reused.
 */
export async function deleteAccount(userId: string): Promise<void> {
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) logger.warn({ err: error, userId }, 'failed to delete Supabase auth user');
}
