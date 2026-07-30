import {
  prisma,
  notFound,
  forbidden,
  badRequest,
  toMajor,
  logger,
  sendSplitRequests,
  events,
  googleCalendar as calendar,
  type SupabaseIdentity,
} from '@zenemic/shared';

/**
 * Keyboard "Generate" — the seam the keyboard prototype calls `callZenemicAPI`.
 * Parses the prompt, creates the event + all resources (calendar event,
 * payment split, maps link) in a PENDING state, and returns the payload the
 * keyboard's result sheet renders. Nothing is sent until `confirm`.
 *
 * The heavy lifting (AI extraction, event + resource creation) is the shared
 * domain logic in @zenemic/shared — the same code the main app's
 * `POST /api/events` uses — so events created here are visible to the main app.
 */
export async function generate(identity: SupabaseIdentity, prompt: string) {
  const draft = await events.extractDraft(prompt);

  // The AI is allowed to return null when the prompt didn't say (see
  // EVENT_EXTRACTION_SYSTEM). The main app resolves those on its confirm screen;
  // the keyboard is one-shot with nowhere to ask, so say what's missing rather
  // than invent it.
  const { dateLabel, timeLabel, locations } = draft;
  if (!dateLabel || !timeLabel || !locations?.length) {
    const missing = [
      dateLabel ? null : 'when',
      timeLabel ? null : 'what time',
      locations?.length ? null : 'where',
    ].filter((m): m is string => m !== null);
    throw badRequest(`Add ${missing.join(' and ')} to that and I'll set it up.`);
  }

  const created = await events.createEvent(identity, {
    title: draft.title,
    dateLabel,
    timeLabel,
    startsAtISO: draft.startsAtISO,
    endsAtISO: draft.endsAtISO,
    locations,
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
