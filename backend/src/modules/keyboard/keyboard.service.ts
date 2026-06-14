import { prisma } from '../../lib/prisma';
import { notFound, forbidden } from '../../lib/errors';
import { toMajor } from '../../lib/money';
import { logger } from '../../config/logger';
import type { SupabaseIdentity } from '../../lib/supabase';
import * as events from '../events/events.service';
import { sendSplitRequests } from '../payments/splitter.service';
import * as calendar from '../../integrations/googleCalendar';

/**
 * Keyboard "Generate" — the seam the keyboard prototype calls `callZenemicAPI`.
 * Parses the prompt, creates the event + all resources (calendar event,
 * payment split, maps link) in a PENDING state, and returns the payload the
 * keyboard's result sheet renders. Nothing is sent until `confirm`.
 */
export async function generate(identity: SupabaseIdentity, prompt: string) {
  const draft = await events.extractDraft(prompt);
  const created = await events.createEvent(identity, {
    title: draft.title,
    dateLabel: draft.dateLabel,
    timeLabel: draft.timeLabel,
    startsAtISO: draft.startsAtISO,
    endsAtISO: draft.endsAtISO,
    locationName: draft.locationName,
    attendees: draft.attendees,
    guests: draft.guests,
    budget: draft.budgetMajor,
    currency: draft.currency,
    splitMode: draft.splitMode,
    sourceMessage: prompt,
  });

  const full = await events.getEvent(identity.userId, created.event.id);
  return {
    eventId: full.id,
    title: full.title,
    when: `${full.date} · ${full.time}`,
    where: full.location,
    guests: full.attendees.filter((a) => !a.isHost).map((a) => a.name),
    total: full.budgetMinor != null ? toMajor(full.budgetMinor, full.currency) : 0,
    currency: full.currency,
    mapsUrl: full.resources.mapsUrl,
    tflUrl: full.resources.tflUrl,
    calendar: full.resources.calendar,
    split: full.split,
  };
}

/**
 * Keyboard "Confirm all" — the seam the prototype calls `confirmZenemicEvent`.
 * Actually sends the calendar invites and Stripe payment requests.
 */
export async function confirm(userId: string, eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { user: true } });
  if (!event) throw notFound('Event not found');
  if (event.userId !== userId) throw forbidden('Not your event');

  // Send Stripe payment requests (no-op if there's no split).
  let split = null;
  try {
    if (await prisma.split.findUnique({ where: { eventId } })) {
      split = await sendSplitRequests(eventId);
    }
  } catch (err) {
    logger.warn({ err, eventId }, 'confirm: sending split requests failed');
  }

  // Send calendar invites (only if connected + an event was created).
  let calendarSent = false;
  try {
    if (calendar.googleCalendarEnabled && event.user.googleRefreshToken && event.calendarEventId) {
      await calendar.sendCalendarInvites({
        refreshToken: event.user.googleRefreshToken,
        calendarId: event.user.googleCalendarId ?? undefined,
        eventId: event.calendarEventId,
      });
      calendarSent = true;
    }
  } catch (err) {
    logger.warn({ err, eventId }, 'confirm: sending calendar invites failed');
  }

  return {
    eventId,
    calendarInvitesSent: calendarSent,
    paymentRequestsSent: Boolean(split),
    split,
  };
}
