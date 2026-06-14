import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { evenSplit } from '../../lib/money';
import { notFound, badRequest } from '../../lib/errors';
import { createSplitPaymentLink, deactivatePaymentLink, stripeEnabled } from '../../integrations/stripe';
import { logger } from '../../config/logger';

const splitInclude = {
  shares: { include: { attendee: true }, orderBy: { id: 'asc' } },
} satisfies Prisma.SplitInclude;

export type SplitWithShares = Prisma.SplitGetPayload<{ include: typeof splitInclude }>;

/**
 * Create or recompute the payment split for an event. Shares are distributed
 * evenly across the event's attendees in exact minor units. Existing Stripe
 * links are deactivated and shares reset to PENDING so they can be re-sent.
 */
export async function createOrUpdateSplit(
  eventId: string,
  input: { totalMinor: number; mode?: 'EVEN' | 'BY_SHARE' | 'BY_ITEM' },
): Promise<SplitWithShares> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { attendees: { orderBy: { id: 'asc' } }, split: { include: { shares: true } } },
  });
  if (!event) throw notFound('Event not found');
  if (event.attendees.length === 0) throw badRequest('Event has no attendees to split between');

  const amounts = evenSplit(input.totalMinor, event.attendees.length);

  // Deactivate any previously-issued Stripe links before recomputing.
  if (stripeEnabled && event.split) {
    for (const share of event.split.shares) {
      if (share.stripePaymentLinkId) {
        await deactivatePaymentLink(share.stripePaymentLinkId).catch((err) =>
          logger.warn({ err }, 'failed to deactivate stale payment link'),
        );
      }
    }
  }

  return prisma.split.upsert({
    where: { eventId },
    create: {
      eventId,
      mode: input.mode ?? event.splitMode,
      totalMinor: input.totalMinor,
      currency: event.currency,
      shares: {
        create: event.attendees.map((a, i) => ({
          attendeeId: a.id,
          amountMinor: amounts[i] ?? 0,
          status: a.isHost ? 'PAID' : 'PENDING', // host has already covered their part
        })),
      },
    },
    update: {
      mode: input.mode ?? event.splitMode,
      totalMinor: input.totalMinor,
      currency: event.currency,
      shares: {
        deleteMany: {},
        create: event.attendees.map((a, i) => ({
          attendeeId: a.id,
          amountMinor: amounts[i] ?? 0,
          status: a.isHost ? 'PAID' : 'PENDING',
        })),
      },
    },
    include: splitInclude,
  });
}

/** Issue Stripe payment links for every outstanding share and mark them REQUESTED. */
export async function sendSplitRequests(eventId: string): Promise<SplitWithShares> {
  const split = await prisma.split.findUnique({
    where: { eventId },
    include: { ...splitInclude, event: true },
  });
  if (!split) throw notFound('No split for this event');

  for (const share of split.shares) {
    if (share.status !== 'PENDING' || share.amountMinor <= 0) continue;
    const link = await createSplitPaymentLink({
      amountMinor: share.amountMinor,
      currency: split.currency,
      description: `${split.event.title} — ${share.attendee?.name ?? 'your share'}`,
      metadata: { eventId, shareId: share.id, splitId: split.id },
    });
    await prisma.splitShare.update({
      where: { id: share.id },
      data: {
        status: 'REQUESTED',
        stripePaymentLinkId: link.paymentLinkId,
        stripePaymentLinkUrl: link.url,
      },
    });
  }

  return prisma.split.findUniqueOrThrow({ where: { eventId }, include: splitInclude });
}

/**
 * Set explicit per-person amounts (the keyboard PaymentDetail +/- steppers and
 * "By share" mode). Recomputes the total from the shares; non-paid shares reset
 * to PENDING with any stale Stripe link cleared so they can be re-sent.
 */
export async function setSplitShares(
  eventId: string,
  input: { shares: { shareId: string; amountMinor: number }[]; mode?: 'EVEN' | 'BY_SHARE' | 'BY_ITEM' },
): Promise<SplitWithShares> {
  const split = await prisma.split.findUnique({ where: { eventId }, include: splitInclude });
  if (!split) throw notFound('No split for this event');

  const byId = new Map(split.shares.map((s) => [s.id, s]));
  for (const s of input.shares) {
    if (!byId.has(s.shareId)) throw badRequest(`Unknown share ${s.shareId}`);
    if (s.amountMinor < 0) throw badRequest('Share amounts cannot be negative');
  }

  const total = input.shares.reduce((sum, s) => sum + s.amountMinor, 0);

  const updates = input.shares.map((s) => {
    const current = byId.get(s.shareId)!;
    const keepPaid = current.status === 'PAID';
    if (stripeEnabled && !keepPaid && current.stripePaymentLinkId) {
      void deactivatePaymentLink(current.stripePaymentLinkId).catch(() => undefined);
    }
    return prisma.splitShare.update({
      where: { id: s.shareId },
      data: keepPaid
        ? { amountMinor: s.amountMinor }
        : { amountMinor: s.amountMinor, status: 'PENDING', stripePaymentLinkId: null, stripePaymentLinkUrl: null },
    });
  });

  await prisma.$transaction([
    ...updates,
    prisma.split.update({ where: { eventId }, data: { totalMinor: total, mode: input.mode ?? split.mode } }),
  ]);

  return prisma.split.findUniqueOrThrow({ where: { eventId }, include: splitInclude });
}

export async function getSplit(eventId: string): Promise<SplitWithShares | null> {
  return prisma.split.findUnique({ where: { eventId }, include: splitInclude });
}

/** Human-readable status for the chat assistant ("who hasn't paid?"). */
export async function splitStatusSummary(eventId: string): Promise<string> {
  const split = await getSplit(eventId);
  if (!split) return 'No payment split has been set up for this event yet.';
  const paid = split.shares.filter((s) => s.status === 'PAID');
  const outstanding = split.shares.filter((s) => s.status !== 'PAID');
  const names = outstanding.map((s) => s.attendee?.name ?? 'Guest').join(', ') || 'none';
  return `${paid.length} of ${split.shares.length} settled. Outstanding: ${names}.`;
}
