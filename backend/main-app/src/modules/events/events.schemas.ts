import { z } from 'zod';

/** One event stop, as sent by the create-confirm / EditEvent locations editor. */
const locationInput = z.object({
  name: z.string().min(1),
  query: z.string().optional(),
  label: z.string().nullable().optional(),
});

export const extractDraftSchema = z.object({
  message: z.string().min(8, 'Describe your event in a bit more detail'),
  todayISO: z.string().optional(),
  timezoneOffset: z.string().optional(),
});

export const createEventSchema = z.object({
  title: z.string().min(1),
  dateLabel: z.string().min(1),
  timeLabel: z.string().min(1),
  startsAtISO: z.string().nullable().optional(),
  endsAtISO: z.string().nullable().optional(),
  locations: z.array(locationInput).min(1).max(25),
  attendees: z.number().int().min(1),
  guests: z.array(z.string()).optional(),
  budget: z.union([z.string(), z.number()]).nullable().optional(),
  currency: z.string().optional(),
  splitMode: z.enum(['EVEN', 'BY_SHARE', 'BY_ITEM']).optional(),
  sourceMessage: z.string().nullable().optional(),
  kind: z.enum(['PLANNED', 'ONGOING', 'PREVIOUS']).optional(),
});

export const updateEventSchema = z.object({
  title: z.string().min(1).optional(),
  dateLabel: z.string().min(1).optional(),
  timeLabel: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  locations: z.array(locationInput).min(1).max(25).optional(),
  splitMode: z.enum(['EVEN', 'BY_SHARE', 'BY_ITEM']).optional(),
  startsAtISO: z.string().datetime({ offset: true }).nullable().optional(),
  endsAtISO: z.string().datetime({ offset: true }).nullable().optional(),
  attendees: z.number().int().min(1).optional(),
  budget: z.union([z.string(), z.number()]).nullable().optional(),
  // No `currency` — editing it after a split exists would desync split rows (v1 keeps it fixed).
});

export const eventIdParam = z.object({ id: z.string().min(1) });

// Accept the app's lowercase kind ("planned") and map to the Prisma enum.
export const listEventsQuery = z.object({
  kind: z
    .enum(['planned', 'ongoing', 'previous'])
    .optional()
    .transform((v) => (v ? (v.toUpperCase() as 'PLANNED' | 'ONGOING' | 'PREVIOUS') : undefined)),
});

const stageInput = z.object({
  tag: z.enum(['SETUP', 'PRE', 'TRAVEL', 'LIVE', 'KEY', 'WRAP']),
  t: z.string().min(1),
  heading: z.string().min(1),
  body: z.string(), // optional detail — a stage like "Doors open" needs no body
  kind: z.enum(['PAST', 'CURRENT', 'NEXT']),
  done: z.boolean().optional(),
});

export const editChartSchema = z.object({ stages: z.array(stageInput).min(1).max(8) });

export const stageIdParam = z.object({ id: z.string().min(1), stageId: z.string().min(1) });
export const stageDoneSchema = z.object({ done: z.boolean() });

export const attendeeIdParam = z.object({ id: z.string().min(1), attendeeId: z.string().min(1) });
export const attendeeRsvpSchema = z.object({ rsvp: z.enum(['PENDING', 'GOING', 'DECLINED']) });
