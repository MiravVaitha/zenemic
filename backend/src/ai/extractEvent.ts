import { z } from 'zod';
import { completeStructured, MODELS } from './client';
import { EVENT_EXTRACTION_SYSTEM } from './prompts';
import { env } from '../config/env';

export const ExtractedEventSchema = z.object({
  title: z.string(),
  dateLabel: z.string(),
  timeLabel: z.string(),
  startsAtISO: z.string().nullable(),
  endsAtISO: z.string().nullable(),
  locationName: z.string(),
  locationQuery: z.string(),
  attendees: z.number().int().min(1),
  guests: z.array(z.string()),
  budgetMajor: z.number().nullable(),
  currency: z.string(),
  splitMode: z.enum(['EVEN', 'BY_SHARE', 'BY_ITEM']),
});

export type ExtractedEvent = z.infer<typeof ExtractedEventSchema>;

const EXTRACTED_EVENT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short event title, no date' },
    dateLabel: { type: 'string', description: 'Display date, e.g. "07 Jun 2026"' },
    timeLabel: { type: 'string', description: 'Display time, e.g. "7:30 PM" or "All day"' },
    startsAtISO: { type: ['string', 'null'], description: 'ISO timestamp or null' },
    endsAtISO: { type: ['string', 'null'], description: 'ISO timestamp or null' },
    locationName: { type: 'string', description: 'Venue/place as written' },
    locationQuery: { type: 'string', description: 'Clean string for a maps search' },
    attendees: { type: 'integer', minimum: 1, description: 'Total headcount including host' },
    guests: { type: 'array', items: { type: 'string' }, description: 'Named guests (exclude host)' },
    budgetMajor: { type: ['number', 'null'], description: 'Total budget in major units, or null' },
    currency: { type: 'string', description: 'lowercase ISO code, e.g. gbp' },
    splitMode: { type: 'string', enum: ['EVEN', 'BY_SHARE', 'BY_ITEM'] },
  },
  required: [
    'title',
    'dateLabel',
    'timeLabel',
    'startsAtISO',
    'endsAtISO',
    'locationName',
    'locationQuery',
    'attendees',
    'guests',
    'budgetMajor',
    'currency',
    'splitMode',
  ],
  additionalProperties: false,
};

/**
 * Turn the free-text the host wrote (CreateDescribe screen / keyboard prompt)
 * into structured, confirmable event fields.
 */
export async function extractEvent(
  message: string,
  opts: { todayISO?: string; timezoneOffset?: string; fallbackCurrency?: string } = {},
): Promise<ExtractedEvent> {
  const today = opts.todayISO ?? new Date().toISOString();
  const fallbackCurrency = opts.fallbackCurrency ?? env.STRIPE_CURRENCY;

  const user = [
    `today: ${today}`,
    opts.timezoneOffset ? `timezoneOffset: ${opts.timezoneOffset}` : null,
    `fallbackCurrency: ${fallbackCurrency}`,
    '',
    'Message to extract from:',
    '"""',
    message,
    '"""',
  ]
    .filter(Boolean)
    .join('\n');

  return completeStructured({
    schema: ExtractedEventSchema,
    jsonSchema: EXTRACTED_EVENT_JSON_SCHEMA,
    toolName: 'record_event',
    toolDescription: 'Record the structured event details extracted from the message.',
    system: EVENT_EXTRACTION_SYSTEM,
    user,
    model: MODELS.extraction,
  });
}
