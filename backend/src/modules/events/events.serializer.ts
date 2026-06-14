import type {
  AlbumPhoto,
  Attendee,
  Event,
  Receipt,
  ReceiptItem,
  Split,
  SplitShare,
  Stage,
} from '@prisma/client';
import { formatMoney, toMajor } from '../../lib/money';

export function serializeEvent(event: Event) {
  return {
    id: event.id,
    title: event.title,
    date: event.dateLabel,
    time: event.timeLabel,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    kind: event.kind.toLowerCase(),
    status: event.status.toLowerCase(),
    location: event.location,
    coordinates:
      event.locationLat != null && event.locationLng != null
        ? { lat: event.locationLat, lng: event.locationLng }
        : null,
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
      tflUrl: event.tflUrl,
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
