import { prisma } from '../lib/prisma';
import { logger } from '../config/logger';
import { formatMoney } from '../lib/money';
import { generateChart } from '../ai';
import * as maps from '../integrations/googleMaps';
import * as calendar from '../integrations/googleCalendar';
import * as storage from '../integrations/storage';
import { createOrUpdateSplit } from './splitter.service';
import { deriveEventKind } from './eventKind';

/**
 * Why a resource isn't there. Machine-readable so the app can offer the right
 * fix (open Settings, add a budget) without parsing the prose `reason`.
 */
export type ResourceCode =
  | 'google_not_configured'
  | 'google_not_connected'
  | 'no_start_time'
  | 'no_location'
  | 'storage_not_configured'
  | 'no_budget'
  | 'no_one_to_split_with'
  | 'error';

export interface ResourceOutcome {
  status: 'created' | 'skipped' | 'failed';
  code?: ResourceCode;
  /** Written for the host — this one does reach the UI. */
  reason?: string;
}

export interface ResourceReport {
  chart: ResourceOutcome;
  calendar: ResourceOutcome;
  splitter: ResourceOutcome;
  locations: ResourceOutcome;
  album: ResourceOutcome;
}

/** The five resources, in the order the create screen lists them. */
export const RESOURCE_KEYS = ['chart', 'calendar', 'splitter', 'locations', 'album'] as const;

const created = (reason?: string): ResourceOutcome => ({ status: 'created', ...(reason ? { reason } : {}) });
const skipped = (code: ResourceCode, reason: string): ResourceOutcome => ({ status: 'skipped', code, reason });
const failed = (reason: string): ResourceOutcome => ({ status: 'failed', code: 'error', reason });

/**
 * How long an event runs when nobody said. Google Calendar needs an end, but
 * `endsAt` is legitimately null for most events (the host wrote "8pm", not
 * "8-10pm") — so we assume a duration for the calendar entry ONLY and never
 * persist it. `deriveEventKind` relies on a null `endsAt` to keep the event
 * Ongoing until midnight; writing +2h here would flip it to Previous at 10pm.
 * Matches the app's own assumption in EditEventScreen.
 */
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

/** The end instant to hand Google, assuming a duration when the host gave none. */
export function calendarEnd(startsAt: Date, endsAt: Date | null): Date {
  return endsAt ?? new Date(startsAt.getTime() + DEFAULT_DURATION_MS);
}

/**
 * Generate all the automated resources for a freshly-created event — the work
 * the app's "Setting up your event…" screen visualises:
 *   planner chart · calendar event · payment splitter · location links · album
 *
 * Every step is best-effort and isolated: a missing integration or transient
 * failure degrades that one resource, it doesn't fail the whole event. Each
 * returns an outcome saying whether it happened and, when it didn't, why — the
 * create flow shows that verbatim rather than claiming five successes.
 */
export async function generateResources(eventId: string): Promise<ResourceReport> {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    include: { user: true, attendees: true, locations: { orderBy: { order: 'asc' } } },
  });
  const report: ResourceReport = {
    chart: failed('Not attempted.'),
    calendar: failed('Not attempted.'),
    splitter: failed('Not attempted.'),
    locations: failed('Not attempted.'),
    album: failed('Not attempted.'),
  };

  // 1. Planner chart (Anthropic).
  try {
    const chart = await generateChart({
      title: event.title,
      dateLabel: event.dateLabel,
      timeLabel: event.timeLabel,
      location: event.location,
      locations: event.locations.map((l) => ({ name: l.name, label: l.label })),
      attendees: event.attendeesCount,
      budgetLabel: event.budgetMinor != null ? formatMoney(event.budgetMinor, event.currency) : null,
      splitMode: event.splitMode,
      sourceMessage: event.sourceMessage,
      kind: deriveEventKind(event.startsAt, event.endsAt),
    });
    await prisma.stage.deleteMany({ where: { eventId } });
    await prisma.stage.createMany({
      data: chart.stages.map((s, i) => ({ eventId, order: i, ...s })),
    });
    report.chart = created();
  } catch (err) {
    logger.warn({ err, eventId }, 'chart generation failed');
    // Recoverable: GET /events/:id/chart regenerates when there are no stages.
    report.chart = failed('Couldn’t build the timeline. Open the planner chart to try again.');
  }

  // 2. Location links (Google Maps). Geocode every stop, build its deep link,
  //    and mirror the first stop onto the event. Deep links work without a key;
  //    geocoding (for coordinates + the static map) needs one.
  try {
    report.locations = await linkLocations(eventId);
  } catch (err) {
    logger.warn({ err, eventId }, 'location linking failed');
    report.locations = failed('Couldn’t build the map links.');
  }

  // 3. Shared photo album (object storage).
  let albumUrl: string | undefined;
  try {
    if (storage.storageEnabled) {
      albumUrl = storage.albumUrl(eventId);
      report.album = created();
    } else {
      report.album = skipped(
        'storage_not_configured',
        'Shared albums need object storage set up on the server.',
      );
    }
  } catch (err) {
    logger.warn({ err, eventId }, 'album creation failed');
    report.album = failed('Couldn’t open a shared album.');
  }

  // 4. Calendar event (only if the user connected Google + we can place a start).
  report.calendar = await syncCalendar(eventId);

  // 5. Payment splitter (only when there's a budget and someone to split with).
  try {
    if (event.budgetMinor == null || event.budgetMinor <= 0) {
      report.splitter = skipped('no_budget', 'No budget set — add one to split the cost.');
    } else if (event.attendees.length < 2) {
      report.splitter = skipped(
        'no_one_to_split_with',
        'Only you on the guest list — nothing to split yet.',
      );
    } else {
      const split = await createOrUpdateSplit(eventId, {
        totalMinor: event.budgetMinor,
        mode: event.splitMode,
      });
      // A share with no email can never be sent a payment link
      // (sendSplitRequests skips it), so say so now rather than at send time.
      const unreachable = split.shares.filter((s) => !s.attendee?.isHost && !s.attendee?.email).length;
      report.splitter = created(
        unreachable > 0
          ? unreachable === 1
            ? 'One guest has no email address, so their payment request can’t be sent yet.'
            : `${unreachable} guests have no email address, so their payment requests can’t be sent yet.`
          : undefined,
      );
    }
  } catch (err) {
    logger.warn({ err, eventId }, 'split creation failed');
    report.splitter = failed('Couldn’t build the payment split.');
  }

  // Persist the album reference + flip the event to ACTIVE. (syncCalendar writes
  // its own reference.) `undefined` leaves a column alone rather than nulling it.
  await prisma.event.update({
    where: { id: eventId },
    data: { albumUrl, status: 'ACTIVE' },
  });

  return report;
}

/**
 * Create this event's Google Calendar entry if it doesn't have one yet.
 * Idempotent — an event that already has a `calendarEventId` reports `created`
 * without touching Google. Shared by create (above), the EditEvent update flow
 * and `POST /events/:id/calendar`, so all three agree on the preconditions.
 *
 * Note only `startsAt` is required: an end time is assumed when absent (see
 * DEFAULT_DURATION_MS) rather than skipping the calendar, which is what used to
 * happen to every event whose host didn't write an end time.
 */
export async function syncCalendar(eventId: string): Promise<ResourceOutcome> {
  try {
    const event = await prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      include: { user: true, attendees: true },
    });

    if (!calendar.googleCalendarEnabled) {
      return skipped('google_not_configured', 'Google Calendar isn’t set up on the server.');
    }
    if (!event.user.googleRefreshToken) {
      return skipped(
        'google_not_connected',
        'Connect Google Calendar in Settings, then sync this event.',
      );
    }
    if (!event.startsAt) {
      return skipped('no_start_time', 'No start time yet — set a date and time to add it.');
    }
    if (event.calendarEventId) return created();

    const entry = await calendar.createCalendarEvent({
      refreshToken: event.user.googleRefreshToken,
      calendarId: event.user.googleCalendarId ?? undefined,
      summary: event.title,
      description: event.sourceMessage ?? undefined,
      location: event.location,
      start: event.startsAt,
      end: calendarEnd(event.startsAt, event.endsAt),
      attendeeEmails: event.attendees.map((a) => a.email).filter((e): e is string => Boolean(e)),
    });
    await prisma.event.update({
      where: { id: eventId },
      data: { calendarEventId: entry.id, calendarHtmlLink: entry.htmlLink },
    });
    return created();
  } catch (err) {
    logger.warn({ err, eventId }, 'calendar event creation failed');
    return failed('Couldn’t add this to Google Calendar.');
  }
}

/**
 * (Re)geocode every stop of an event, rebuild each stop's maps deep link, and
 * mirror the first stop onto the event's primary location columns (so the
 * header, calendar, chat and keyboard keep working off `event.location`).
 * Best-effort per stop — a geocode miss just leaves that stop without
 * coordinates. Shared by create (above) and the EditEvent update flow.
 *
 * Deep links are built with or without a Maps key; coordinates and the static
 * map need one, so the outcome distinguishes "linked" from "linked and placed".
 */
export async function linkLocations(eventId: string): Promise<ResourceOutcome> {
  const locations = await prisma.eventLocation.findMany({
    where: { eventId },
    orderBy: { order: 'asc' },
  });
  if (!locations.length) {
    return skipped('no_location', 'No location on this event yet.');
  }

  let placed = 0;
  for (const loc of locations) {
    const target = loc.query || loc.name;
    let lat = loc.lat;
    let lng = loc.lng;
    let placeId = loc.placeId;
    try {
      if (maps.googleMapsEnabled) {
        const geo = await maps.geocode(target);
        if (geo) {
          lat = geo.lat;
          lng = geo.lng;
          placeId = geo.placeId;
        }
      }
    } catch (err) {
      logger.warn({ err, eventId, locationId: loc.id }, 'stop geocode failed');
    }
    if (lat != null && lng != null) placed += 1;
    await prisma.eventLocation.update({
      where: { id: loc.id },
      data: { lat, lng, placeId, mapsUrl: maps.directionsLink({ destination: target, placeId }) },
    });
  }

  const primary = await prisma.eventLocation.findUnique({ where: { id: locations[0]!.id } });
  if (primary) {
    await prisma.event.update({
      where: { id: eventId },
      data: {
        location: primary.name,
        locationLat: primary.lat,
        locationLng: primary.lng,
        placeId: primary.placeId,
        mapsUrl: primary.mapsUrl,
      },
    });
  }

  if (placed === 0) {
    return created(
      maps.googleMapsEnabled
        ? 'Directions links are ready, but we couldn’t place this on a map.'
        : 'Directions links are ready. The map preview needs a Google Maps key.',
    );
  }
  return created();
}
