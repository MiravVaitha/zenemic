import type {
  AlbumPhoto,
  Attendee,
  Event,
  EventLocation,
  Receipt,
  ReceiptItem,
  Split,
  SplitShare,
  Stage,
} from '@prisma/client';
import { formatMoney, toMajor } from '../lib/money';
import { routeLink } from '../integrations/googleMaps';
import { features } from '../config/env';
import { signMapUrl } from '../lib/mapToken';
import { deriveEventKind } from './eventKind';

/**
 * Ordered stops for an event. Uses the `EventLocation` rows when present, and
 * otherwise synthesises a single stop from the primary mirror columns so events
 * created before multi-location existed still serialise correctly (no backfill).
 */
function eventStops(event: Event & { locations: EventLocation[] }) {
  if (event.locations.length) {
    return [...event.locations]
      .sort((a, b) => a.order - b.order)
      .map((l) => ({
        id: l.id,
        order: l.order,
        name: l.name,
        query: l.query,
        label: l.label,
        lat: l.lat,
        lng: l.lng,
        placeId: l.placeId,
        mapsUrl: l.mapsUrl,
      }));
  }
  return [
    {
      id: `${event.id}:0`,
      order: 0,
      name: event.location,
      query: event.location,
      label: null as string | null,
      lat: event.locationLat,
      lng: event.locationLng,
      placeId: event.placeId,
      mapsUrl: event.mapsUrl,
    },
  ];
}

export function serializeEvent(event: Event & { locations: EventLocation[] }) {
  const stops = eventStops(event);
  // Only real, geocoded rows get a static map — that's what the proxy serves.
  const hasGeo = event.locations.some((l) => l.lat != null && l.lng != null);
  return {
    id: event.id,
    title: event.title,
    date: event.dateLabel,
    time: event.timeLabel,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    kind: deriveEventKind(event.startsAt, event.endsAt).toLowerCase(),
    status: event.status.toLowerCase(),
    location: event.location,
    coordinates:
      event.locationLat != null && event.locationLng != null
        ? { lat: event.locationLat, lng: event.locationLng }
        : null,
    // Ordered stops; the first is the primary (mirrored onto `location` above).
    locations: stops.map((s) => ({
      id: s.id,
      order: s.order,
      name: s.name,
      label: s.label,
      query: s.query,
      coordinates: s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : null,
      mapsUrl: s.mapsUrl,
    })),
    attendees: event.attendeesCount,
    budget: event.budgetMinor != null ? formatMoney(event.budgetMinor, event.currency) : null,
    budgetMinor: event.budgetMinor,
    currency: event.currency,
    splitMode: event.splitMode,
    msg: event.sourceMessage,
    resources: {
      calendar: event.calendarEventId
        ? { eventId: event.calendarEventId, htmlLink: event.calendarHtmlLink }
        : null,
      mapsUrl: event.mapsUrl,
      // Whole-journey route through every stop (null for a single stop).
      routeUrl: routeLink(stops.map((s) => ({ query: s.query, placeId: s.placeId }))),
      // Signed path to the static-map proxy; null when nothing is geocoded.
      mapImageUrl: features.googleMaps && hasGeo ? signMapUrl(event.id) : null,
      albumUrl: event.albumUrl,
    },
    createdAt: event.createdAt,
  };
}

export function serializeStage(stage: Stage) {
  return {
    id: stage.id,
    tag: stage.tag,
    t: stage.t,
    heading: stage.heading,
    kind: stage.kind.toLowerCase(),
    body: stage.body,
    done: stage.done,
  };
}

export function serializeAlbumPhoto(photo: AlbumPhoto) {
  return {
    id: photo.id,
    url: photo.url,
    caption: photo.caption,
    uploaderName: photo.uploaderName,
    createdAt: photo.createdAt,
  };
}

/** Build the planner-chart shape the PlannerChart/EventDetail screens expect. */
export function serializeChart(event: Event, stages: Stage[]) {
  return {
    title: event.title,
    sub: `${event.dateLabel.toUpperCase()} · ${event.attendeesCount} ATTENDEES`,
    stages: stages.sort((a, b) => a.order - b.order).map(serializeStage),
  };
}

export function serializeAttendee(attendee: Attendee) {
  return {
    id: attendee.id,
    name: attendee.name,
    email: attendee.email,
    phone: attendee.phone,
    rsvp: attendee.rsvp,
    isHost: attendee.isHost,
  };
}

export function serializeSplit(
  split: (Split & { shares: (SplitShare & { attendee: Attendee | null })[] }) | null,
) {
  if (!split) return null;
  return {
    id: split.id,
    mode: split.mode,
    currency: split.currency,
    total: formatMoney(split.totalMinor, split.currency),
    totalMinor: split.totalMinor,
    perHead: split.shares.length ? formatMoney(Math.round(split.totalMinor / split.shares.length), split.currency) : null,
    shares: split.shares.map((s) => ({
      id: s.id,
      name: s.attendee?.name ?? 'Guest',
      isHost: s.attendee?.isHost ?? false,
      amount: formatMoney(s.amountMinor, split.currency),
      amountMinor: s.amountMinor,
      status: s.status,
      paymentUrl: s.stripePaymentLinkUrl,
      paidAt: s.paidAt,
    })),
  };
}

export function serializeReceipt(receipt: Receipt & { items: ReceiptItem[] }) {
  return {
    id: receipt.id,
    label: receipt.label,
    currency: receipt.currency,
    total: formatMoney(receipt.totalMinor, receipt.currency),
    totalMinor: receipt.totalMinor,
    imageUrl: receipt.imageUrl,
    items: receipt.items.map((it) => ({
      qty: it.qty,
      name: it.name,
      price: toMajor(it.priceMinor, receipt.currency),
      priceMinor: it.priceMinor,
    })),
    createdAt: receipt.createdAt,
  };
}
