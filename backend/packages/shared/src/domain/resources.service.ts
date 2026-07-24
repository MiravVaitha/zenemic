import { prisma } from '../lib/prisma';
import { logger } from '../config/logger';
import { formatMoney } from '../lib/money';
import { generateChart } from '../ai';
import * as maps from '../integrations/googleMaps';
import * as calendar from '../integrations/googleCalendar';
import * as storage from '../integrations/storage';
import { createOrUpdateSplit } from './splitter.service';
import { deriveEventKind } from './eventKind';

export interface ResourceReport {
  chart: boolean;
  calendar: boolean;
  splitter: boolean;
  locations: boolean;
  album: boolean;
}

/**
 * Generate all the automated resources for a freshly-created event — the work
 * the app's "Setting up your event…" screen visualises:
 *   planner chart · calendar event · payment splitter · location links · album
 *
 * Every step is best-effort and isolated: a missing integration or transient
 * failure degrades that one resource, it doesn't fail the whole event.
 */
export async function generateResources(eventId: string): Promise<ResourceReport> {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    include: { user: true, attendees: true, locations: { orderBy: { order: 'asc' } } },
  });
  const report: ResourceReport = {
    chart: false,
    calendar: false,
    splitter: false,
    locations: false,
    album: false,
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
    report.chart = true;
  } catch (err) {
    logger.warn({ err, eventId }, 'chart generation failed');
  }

  // 2. Location links (Google Maps). Geocode every stop, build its deep link,
  //    and mirror the first stop onto the event. Deep links work without a key;
  //    geocoding (for coordinates + the static map) needs one.
  try {
    report.locations = await linkLocations(eventId);
  } catch (err) {
    logger.warn({ err, eventId }, 'location linking failed');
  }

  // 3. Shared photo album (object storage).
  let albumUrl: string | undefined;
  try {
    if (storage.storageEnabled) {
      albumUrl = storage.albumUrl(eventId);
      report.album = true;
    }
  } catch (err) {
    logger.warn({ err, eventId }, 'album creation failed');
  }

  // 4. Calendar event (only if the user connected Google + we have real times).
  let calendarEventId: string | undefined;
  let calendarHtmlLink: string | undefined;
  try {
    if (calendar.googleCalendarEnabled && event.user.googleRefreshToken && event.startsAt && event.endsAt) {
      const created = await calendar.createCalendarEvent({
        refreshToken: event.user.googleRefreshToken,
        calendarId: event.user.googleCalendarId ?? undefined,
        summary: event.title,
        description: event.sourceMessage ?? undefined,
        location: event.location,
        start: event.startsAt,
        end: event.endsAt,
        attendeeEmails: event.attendees.map((a) => a.email).filter((e): e is string => Boolean(e)),
      });
      calendarEventId = created.id;
      calendarHtmlLink = created.htmlLink;
      report.calendar = true;
    }
  } catch (err) {
    logger.warn({ err, eventId }, 'calendar event creation failed');
  }

  // 5. Payment splitter (only when there's a budget to split).
  try {
    if (event.budgetMinor != null && event.budgetMinor > 0) {
      await createOrUpdateSplit(eventId, { totalMinor: event.budgetMinor, mode: event.splitMode });
      report.splitter = true;
    }
  } catch (err) {
    logger.warn({ err, eventId }, 'split creation failed');
  }

  // Persist all resource references + flip the event to ACTIVE.
  await prisma.event.update({
    where: { id: eventId },
    data: {
      albumUrl,
      calendarEventId,
      calendarHtmlLink,
      status: 'ACTIVE',
    },
  });

  return report;
}

/**
 * (Re)geocode every stop of an event, rebuild each stop's maps deep link, and
 * mirror the first stop onto the event's primary location columns (so the
 * header, calendar, chat and keyboard keep working off `event.location`).
 * Best-effort per stop — a geocode miss just leaves that stop without
 * coordinates. Returns whether the event has any stops. Shared by create
 * (above) and the EditEvent update flow.
 */
export async function linkLocations(eventId: string): Promise<boolean> {
  const locations = await prisma.eventLocation.findMany({
    where: { eventId },
    orderBy: { order: 'asc' },
  });
  if (!locations.length) return false;

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
  return true;
}
