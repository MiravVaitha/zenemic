import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { notFound, forbidden, conflict, badRequest } from '../lib/errors';
import { parseBudgetToMinor } from '../lib/money';
import { extractEvent, generateChart, type ExtractedEvent } from '../ai';
import { env } from '../config/env';
import { logger } from '../config/logger';
import * as calendar from '../integrations/googleCalendar';
import { generateResources, linkLocations, type ResourceReport } from './resources.service';
import { createOrUpdateSplit } from './splitter.service';
import {
  serializeEvent,
  serializeChart,
  serializeStage,
  serializeAttendee,
  serializeSplit,
  serializeReceipt,
} from './events.serializer';
import { deriveEventKind } from './eventKind';
import type { EventKind, RsvpStatus, StageKind, StageTag } from '@prisma/client';
import type { SupabaseIdentity } from '../lib/supabase';
import { ensureProfile } from './profile';

const detailInclude = {
  stages: { orderBy: { order: 'asc' } },
  attendees: { orderBy: { id: 'asc' } },
  split: { include: { shares: { include: { attendee: true } } } },
  receipts: { include: { items: true }, orderBy: { createdAt: 'desc' } },
  locations: { orderBy: { order: 'asc' } },
} satisfies Prisma.EventInclude;

/** A single stop as accepted from the create/edit flows (query defaults to name). */
export interface LocationInput {
  name: string;
  query?: string;
  label?: string | null;
}

export interface CreateEventInput {
  title: string;
  dateLabel: string;
  timeLabel: string;
  startsAtISO?: string | null;
  endsAtISO?: string | null;
  locations: LocationInput[];
  attendees: number;
  guests?: string[];
  budget?: string | number | null;
  currency?: string;
  splitMode?: 'EVEN' | 'BY_SHARE' | 'BY_ITEM';
  sourceMessage?: string | null;
  kind?: 'PLANNED' | 'ONGOING' | 'PREVIOUS';
}

/** Step 1 of the create flow: AI extraction only, no persistence. */
export async function extractDraft(
  message: string,
  opts: { todayISO?: string; timezoneOffset?: string } = {},
): Promise<ExtractedEvent> {
  return extractEvent(message, { ...opts, fallbackCurrency: env.STRIPE_CURRENCY });
}

/**
 * Step 2 of the create flow: persist the confirmed event and generate every
 * automated resource (chart, calendar, splitter, location links, album).
 */
export async function createEvent(
  identity: SupabaseIdentity,
  input: CreateEventInput,
): Promise<{ event: ReturnType<typeof serializeEvent>; resources: ResourceReport }> {
  const user = await ensureProfile(identity); // create the profile row on first use
  const userId = user.id;
  const currency = (input.currency ?? env.STRIPE_CURRENCY).toLowerCase();
  const startsAt = input.startsAtISO ? new Date(input.startsAtISO) : null;
  const endsAt = input.endsAtISO ? new Date(input.endsAtISO) : null;
  const budgetMinor = parseBudgetToMinor(input.budget ?? null, currency);

  // Build the attendee roster: host + named guests, padded to the headcount.
  const guests = input.guests ?? [];
  const guestRows = guests.map((name) => ({ name, isHost: false }));
  const padCount = Math.max(0, input.attendees - 1 - guestRows.length);
  for (let i = 0; i < padCount; i += 1) guestRows.push({ name: `Guest ${i + 1}`, isHost: false });

  const event = await prisma.event.create({
    data: {
      userId,
      title: input.title,
      dateLabel: input.dateLabel,
      timeLabel: input.timeLabel,
      startsAt,
      endsAt,
      kind: input.kind ?? deriveEventKind(startsAt, endsAt),
      status: 'DRAFT',
      location: input.locations[0]?.name ?? '',
      locations: {
        create: input.locations.map((l, i) => ({
          order: i,
          name: l.name,
          query: l.query?.trim() || l.name,
          label: l.label ?? null,
        })),
      },
      attendeesCount: Math.max(input.attendees, guestRows.length + 1),
      budgetMinor,
      currency,
      splitMode: input.splitMode ?? user.defaultSplitMode,
      sourceMessage: input.sourceMessage ?? null,
      attendees: {
        create: [{ name: user.name, email: user.email, isHost: true, rsvp: 'GOING' }, ...guestRows],
      },
    },
  });

  const resources = await generateResources(event.id);
  const full = await prisma.event.findUniqueOrThrow({
    where: { id: event.id },
    include: { locations: { orderBy: { order: 'asc' } } },
  });
  return { event: serializeEvent(full), resources };
}

export async function listEvents(userId: string, kind?: EventKind) {
  // `kind` is derived live in serializeEvent, so filter on the serialized value
  // rather than the stored column (which is only a best-effort snapshot).
  const events = await prisma.event.findMany({
    where: { userId },
    orderBy: { startsAt: 'desc' },
    include: { locations: { orderBy: { order: 'asc' } } },
  });
  const serialized = events.map(serializeEvent);
  const wanted = kind?.toLowerCase();
  return wanted ? serialized.filter((e) => e.kind === wanted) : serialized;
}

async function loadOwned(userId: string, eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, include: detailInclude });
  if (!event) throw notFound('Event not found');
  if (event.userId !== userId) throw forbidden('Not your event');
  return event;
}

/** Lightweight ownership check (no relations loaded). */
async function assertOwner(userId: string, eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, userId: true },
  });
  if (!event) throw notFound('Event not found');
  if (event.userId !== userId) throw forbidden('Not your event');
}

export async function getEvent(userId: string, eventId: string) {
  const event = await loadOwned(userId, eventId);
  return {
    ...serializeEvent(event),
    stages: serializeChart(event, event.stages).stages,
    attendees: event.attendees.map(serializeAttendee),
    split: serializeSplit(event.split),
    receipts: event.receipts.map(serializeReceipt),
  };
}

/** Planner chart for an event; generates + persists it on first request. */
export async function getChart(userId: string, eventId: string) {
  const event = await loadOwned(userId, eventId);
  if (event.stages.length === 0) {
    await regenerateChart(userId, eventId);
    return getChart(userId, eventId);
  }
  return serializeChart(event, event.stages);
}

export async function regenerateChart(userId: string, eventId: string) {
  const event = await loadOwned(userId, eventId);
  const chart = await generateChart({
    title: event.title,
    dateLabel: event.dateLabel,
    timeLabel: event.timeLabel,
    location: event.location,
    locations: event.locations.map((l) => ({ name: l.name, label: l.label })),
    attendees: event.attendeesCount,
    budgetLabel: null,
    splitMode: event.splitMode,
    sourceMessage: event.sourceMessage,
    kind: deriveEventKind(event.startsAt, event.endsAt),
  });
  await prisma.$transaction([
    prisma.stage.deleteMany({ where: { eventId } }),
    prisma.stage.createMany({ data: chart.stages.map((s, i) => ({ eventId, order: i, ...s })) }),
  ]);
  const stages = await prisma.stage.findMany({ where: { eventId }, orderBy: { order: 'asc' } });
  return serializeChart(event, stages);
}

/** Tick a planner-chart stage off (or on) — the EventDetail/PlannerChart checkboxes. */
export async function setStageDone(userId: string, eventId: string, stageId: string, done: boolean) {
  await assertOwner(userId, eventId);
  const stage = await prisma.stage.findFirst({ where: { id: stageId, eventId } });
  if (!stage) throw notFound('Stage not found');
  const updated = await prisma.stage.update({ where: { id: stageId }, data: { done } });
  return serializeStage(updated);
}

export interface EditStageInput {
  tag: StageTag;
  t: string;
  heading: string;
  body: string;
  kind: StageKind;
  done?: boolean;
}

/** Replace the planner chart with edited stages (PlannerChart "Edit chart"). */
export async function replaceChart(userId: string, eventId: string, stages: EditStageInput[]) {
  const event = await loadOwned(userId, eventId);
  await prisma.$transaction([
    prisma.stage.deleteMany({ where: { eventId } }),
    prisma.stage.createMany({
      data: stages.map((s, i) => ({
        eventId,
        order: i,
        tag: s.tag,
        t: s.t,
        heading: s.heading,
        body: s.body,
        kind: s.kind,
        done: s.done ?? false,
      })),
    }),
  ]);
  const fresh = await prisma.stage.findMany({ where: { eventId }, orderBy: { order: 'asc' } });
  return serializeChart(event, fresh);
}

/** Update an attendee's RSVP (keyboard CalendarDetail's Going/Declined/Pending cycle). */
export async function updateAttendeeRsvp(
  userId: string,
  eventId: string,
  attendeeId: string,
  rsvp: RsvpStatus,
) {
  await assertOwner(userId, eventId);
  const attendee = await prisma.attendee.findFirst({ where: { id: attendeeId, eventId } });
  if (!attendee) throw notFound('Attendee not found');
  const updated = await prisma.attendee.update({ where: { id: attendeeId }, data: { rsvp } });
  return serializeAttendee(updated);
}

export interface UpdateEventInput {
  title?: string;
  dateLabel?: string;
  timeLabel?: string;
  /** Legacy single-stop edit; superseded by `locations` when both are present. */
  location?: string;
  /** Full replacement list of stops (EditEvent locations editor). */
  locations?: LocationInput[];
  splitMode?: 'EVEN' | 'BY_SHARE' | 'BY_ITEM';
  startsAtISO?: string | null;
  endsAtISO?: string | null;
  attendees?: number;
  budget?: string | number | null;
}

/**
 * Edit event details (the EventDetail hamburger → EditEvent screen). The DB
 * write is transactional; downstream resources (maps, calendar, split) are then
 * re-synced best-effort in isolation, mirroring generateResources.
 */
export async function updateEvent(userId: string, eventId: string, patch: UpdateEventInput) {
  const event = await loadOwned(userId, eventId);

  // Money guard: budget/attendees/splitMode edits recompute the split from
  // scratch, which is only safe while no share has a live Stripe link or a
  // recorded guest payment. (The host's share is PAID from creation — that
  // alone must not lock editing.)
  const touchesMoney =
    patch.budget !== undefined || patch.attendees !== undefined || patch.splitMode !== undefined;
  const moneyLocked =
    event.split?.shares.some(
      (s) => s.status === 'REQUESTED' || (s.status === 'PAID' && !s.attendee?.isHost),
    ) ?? false;
  if (touchesMoney && moneyLocked) {
    throw conflict(
      'Payment requests have already been sent — manage budget and shares in the payment splitter.',
    );
  }

  // Timestamps: a present key means "set" (null clears); reject unparseable values.
  const parseISO = (iso: string | null, field: string) => {
    if (iso == null) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) throw badRequest(`Invalid ${field}`);
    return d;
  };
  const timesTouched = patch.startsAtISO !== undefined || patch.endsAtISO !== undefined;
  const newStartsAt =
    patch.startsAtISO !== undefined ? parseISO(patch.startsAtISO, 'startsAtISO') : event.startsAt;
  const newEndsAt =
    patch.endsAtISO !== undefined ? parseISO(patch.endsAtISO, 'endsAtISO') : event.endsAt;

  // Roster delta: grow with "Guest N" padding rows; shrink by removing trailing
  // padding rows only — the host and named guests are never deleted.
  const rosterOps: Prisma.PrismaPromise<unknown>[] = [];
  let newAttendeesCount: number | undefined;
  if (patch.attendees !== undefined) {
    const unnamed = event.attendees.filter((a) => !a.isHost && /^Guest \d+$/.test(a.name));
    const keptCount = event.attendees.length - unnamed.length; // host + named guests
    const target = Math.max(patch.attendees, keptCount);
    newAttendeesCount = target;
    const delta = target - event.attendees.length;
    if (delta > 0) {
      const maxN = unnamed.reduce((m, a) => Math.max(m, Number(a.name.replace('Guest ', ''))), 0);
      rosterOps.push(
        prisma.attendee.createMany({
          data: Array.from({ length: delta }, (_, i) => ({
            eventId,
            name: `Guest ${maxN + i + 1}`,
            isHost: false,
          })),
        }),
      );
    } else if (delta < 0) {
      const removeIds = unnamed.slice(delta).map((a) => a.id); // trailing |delta| padding rows
      rosterOps.push(prisma.attendee.deleteMany({ where: { id: { in: removeIds } } }));
    }
  }

  const newBudgetMinor =
    patch.budget !== undefined ? parseBudgetToMinor(patch.budget, event.currency) : event.budgetMinor;
  const newSplitMode = patch.splitMode ?? event.splitMode;

  // Locations: a `locations` array (or the legacy single `location`) fully
  // replaces the event's stops. Rows are swapped in the same transaction; the
  // geocode + link rebuild + primary mirror happen best-effort afterwards.
  const newLocations =
    patch.locations ?? (patch.location != null ? [{ name: patch.location }] : undefined);
  const locationOps: Prisma.PrismaPromise<unknown>[] = [];
  if (newLocations && newLocations.length) {
    locationOps.push(prisma.eventLocation.deleteMany({ where: { eventId } }));
    locationOps.push(
      prisma.eventLocation.createMany({
        data: newLocations.map((l, i) => ({
          eventId,
          order: i,
          name: l.name,
          query: l.query?.trim() || l.name,
          label: l.label ?? null,
        })),
      }),
    );
  }

  await prisma.$transaction([
    prisma.event.update({
      where: { id: eventId },
      data: {
        ...(patch.title != null ? { title: patch.title } : {}),
        ...(patch.dateLabel != null ? { dateLabel: patch.dateLabel } : {}),
        ...(patch.timeLabel != null ? { timeLabel: patch.timeLabel } : {}),
        // Mirror the new primary stop; linkLocations refreshes coords/mapsUrl below.
        ...(newLocations?.length ? { location: newLocations[0]!.name } : {}),
        ...(patch.splitMode != null ? { splitMode: patch.splitMode } : {}),
        ...(patch.startsAtISO !== undefined ? { startsAt: newStartsAt } : {}),
        ...(patch.endsAtISO !== undefined ? { endsAt: newEndsAt } : {}),
        // Keep the stored kind snapshot in step with the new times (serialization derives live).
        ...(timesTouched ? { kind: deriveEventKind(newStartsAt, newEndsAt) } : {}),
        ...(newAttendeesCount !== undefined ? { attendeesCount: newAttendeesCount } : {}),
        ...(patch.budget !== undefined ? { budgetMinor: newBudgetMinor } : {}),
      },
    }),
    ...rosterOps,
    ...locationOps,
  ]);

  // Side-effect 1: stops changed → re-geocode all, rebuild each link, refresh
  // the primary mirror (linkLocations does all three).
  const changedLocation = Boolean(newLocations?.length);
  if (changedLocation) {
    try {
      await linkLocations(eventId);
    } catch (err) {
      logger.warn({ err, eventId }, 'location re-linking failed');
    }
  }

  // Side-effect 2: keep the Google Calendar event in sync (silently).
  const changedTitle = patch.title != null && patch.title !== event.title;
  if (changedTitle || changedLocation || timesTouched) {
    try {
      const full = await prisma.event.findUniqueOrThrow({
        where: { id: eventId },
        include: { user: true, attendees: true },
      });
      if (calendar.googleCalendarEnabled && full.user.googleRefreshToken) {
        if (full.calendarEventId) {
          await calendar.updateCalendarEvent({
            refreshToken: full.user.googleRefreshToken,
            calendarId: full.user.googleCalendarId ?? undefined,
            eventId: full.calendarEventId,
            ...(changedTitle ? { summary: full.title } : {}),
            ...(changedLocation ? { location: full.location } : {}),
            // Never null-out calendar times — only push when both are set.
            ...(timesTouched && full.startsAt && full.endsAt
              ? { start: full.startsAt, end: full.endsAt }
              : {}),
          });
        } else if (timesTouched && full.startsAt && full.endsAt) {
          // The edit added real times to an event that never got a calendar entry.
          const created = await calendar.createCalendarEvent({
            refreshToken: full.user.googleRefreshToken,
            calendarId: full.user.googleCalendarId ?? undefined,
            summary: full.title,
            description: full.sourceMessage ?? undefined,
            location: full.location,
            start: full.startsAt,
            end: full.endsAt,
            attendeeEmails: full.attendees.map((a) => a.email).filter((e): e is string => Boolean(e)),
          });
          await prisma.event.update({
            where: { id: eventId },
            data: { calendarEventId: created.id, calendarHtmlLink: created.htmlLink },
          });
        }
      }
    } catch (err) {
      logger.warn({ err, eventId }, 'calendar re-sync failed');
    }
  }

  // Side-effect 3: recompute the split (guard above proved nothing was sent).
  if (touchesMoney) {
    try {
      const total = newBudgetMinor ?? event.split?.totalMinor ?? 0;
      if (total > 0 && (newBudgetMinor != null || event.split)) {
        await createOrUpdateSplit(eventId, { totalMinor: total, mode: newSplitMode });
      }
    } catch (err) {
      logger.warn({ err, eventId }, 'split recompute failed');
    }
  }

  const fresh = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    include: { locations: { orderBy: { order: 'asc' } } },
  });
  return serializeEvent(fresh);
}

export async function deleteEvent(userId: string, eventId: string): Promise<void> {
  await loadOwned(userId, eventId);
  await prisma.event.delete({ where: { id: eventId } });
}
