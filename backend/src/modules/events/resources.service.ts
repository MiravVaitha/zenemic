import { prisma } from '../../lib/prisma';
import { logger } from '../../config/logger';
import { formatMoney } from '../../lib/money';
import { generateChart } from '../../ai';
import * as maps from '../../integrations/googleMaps';
import * as tfl from '../../integrations/tfl';
import * as calendar from '../../integrations/googleCalendar';
import * as storage from '../../integrations/storage';
import { createOrUpdateSplit } from '../payments/splitter.service';

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
    include: { user: true, attendees: true },
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
      attendees: event.attendeesCount,
      budgetLabel: event.budgetMinor != null ? formatMoney(event.budgetMinor, event.currency) : null,
      splitMode: event.splitMode,
      sourceMessage: event.sourceMessage,
      kind: event.kind,
    });
    await prisma.stage.deleteMany({ where: { eventId } });
    await prisma.stage.createMany({
      data: chart.stages.map((s, i) => ({ eventId, order: i, ...s })),
    });
    report.chart = true;
  } catch (err) {
    logger.warn({ err, eventId }, 'chart generation failed');
  }

  // 2. Location links (Google Maps + TfL). Maps deep link works without a key;
  //    geocoding + transit need keys.
  const locationUpdate: { locationLat?: number; locationLng?: number; placeId?: string; mapsUrl?: string; tflUrl?: string } = {};
  try {
    let placeId: string | null = null;
    if (maps.googleMapsEnabled) {
      const geo = await maps.geocode(event.location);
      if (geo) {
        locationUpdate.locationLat = geo.lat;
        locationUpdate.locationLng = geo.lng;
        locationUpdate.placeId = geo.placeId;
        placeId = geo.placeId;
      }
    }
    locationUpdate.mapsUrl = maps.directionsLink({ destination: event.location, placeId });
    if (tfl.tflEnabled) locationUpdate.tflUrl = tfl.tflJourneyPlannerLink(event.location);
    report.locations = true;
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
      ...locationUpdate,
      albumUrl,
      calendarEventId,
      calendarHtmlLink,
      status: 'ACTIVE',
    },
  });

  return report;
}
