import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound, forbidden } from '../../lib/errors';
import { parseBudgetToMinor } from '../../lib/money';
import { extractEvent, generateChart, type ExtractedEvent } from '../../ai';
import { env } from '../../config/env';
import { generateResources, type ResourceReport } from './resources.service';
import {
  serializeEvent,
  serializeChart,
  serializeStage,
  serializeAttendee,
  serializeSplit,
  serializeReceipt,
} from './events.serializer';
import type { EventKind, RsvpStatus, StageKind, StageTag } from '@prisma/client';
import type { SupabaseIdentity } from '../../lib/supabase';
import { ensureProfile } from '../auth/auth.service';

const detailInclude = {
  stages: { orderBy: { order: 'asc' } },
  attendees: { orderBy: { id: 'asc' } },
  split: { include: { shares: { include: { attendee: true } } } },
  receipts: { include: { items: true }, orderBy: { createdAt: 'desc' } },
} satisfies Prisma.EventInclude;

export interface CreateEventInput {
  title: string;
  dateLabel: string;
  timeLabel: string;
  startsAtISO?: string | null;
  endsAtISO?: string | null;
  locationName: string;
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

function inferKind(startsAt: Date | null): 'PLANNED' | 'ONGOING' | 'PREVIOUS' {
  if (!startsAt) return 'PLANNED';
  const now = new Date();
  const sameDay = startsAt.toDateString() === now.toDateString();
  if (sameDay) return 'ONGOING';
  return startsAt < now ? 'PREVIOUS' : 'PLANNED';
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
      kind: input.kind ?? inferKind(startsAt),
      status: 'DRAFT',
      location: input.locationName,
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
  const full = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
  return { event: serializeEvent(full), resources };
}

export async function listEvents(userId: string, kind?: EventKind) {
  const events = await prisma.event.findMany({
    where: { userId, ...(kind ? { kind } : {}) },
    orderBy: { startsAt: 'desc' },
  });
  return events.map(serializeEvent);
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
    attendees: event.attendeesCount,
    budgetLabel: null,
    splitMode: event.splitMode,
    sourceMessage: event.sourceMessage,
    kind: event.kind,
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

export async function updateEvent(
  userId: string,
  eventId: string,
  patch: Partial<{ title: string; dateLabel: string; timeLabel: string; location: string; splitMode: 'EVEN' | 'BY_SHARE' | 'BY_ITEM' }>,
) {
  await loadOwned(userId, eventId);
  const event = await prisma.event.update({
    where: { id: eventId },
    data: {
      ...(patch.title != null ? { title: patch.title } : {}),
      ...(patch.dateLabel != null ? { dateLabel: patch.dateLabel } : {}),
      ...(patch.timeLabel != null ? { timeLabel: patch.timeLabel } : {}),
      ...(patch.location != null ? { location: patch.location } : {}),
      ...(patch.splitMode != null ? { splitMode: patch.splitMode } : {}),
    },
  });
  return serializeEvent(event);
}

export async function deleteEvent(userId: string, eventId: string): Promise<void> {
  await loadOwned(userId, eventId);
  await prisma.event.delete({ where: { id: eventId } });
}
