import type { ZenEvent } from '../data/events';
import type { Stage } from '../data/chart';

export type SplitMode = 'EVEN' | 'BY_SHARE' | 'BY_ITEM';
export type Rsvp = 'PENDING' | 'GOING' | 'DECLINED';

/** One stop of an event, in `order`. The first is the primary (= `location`). */
export interface EventLocation {
  id: string;
  order: number;
  name: string;
  label: string | null;
  query: string;
  coordinates: { lat: number; lng: number } | null;
  mapsUrl: string | null;
}

/** Serialized event from the backend — a superset of the UI's `ZenEvent`. */
export interface ApiEvent extends ZenEvent {
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  coordinates: { lat: number; lng: number } | null;
  locations: EventLocation[];
  budgetMinor: number | null;
  currency: string;
  splitMode: SplitMode;
  resources: {
    calendar: { eventId: string; htmlLink: string } | null;
    mapsUrl: string | null;
    /** Whole-journey route through every stop (null for a single stop). */
    routeUrl: string | null;
    /** Signed path to the static-map proxy (prefix with the API base), or null. */
    mapImageUrl: string | null;
    albumUrl: string | null;
  };
  createdAt: string;
}

export interface Attendee {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  rsvp: Rsvp;
  isHost: boolean;
}

export interface SplitShare {
  id: string;
  name: string;
  isHost: boolean;
  amount: string;
  amountMinor: number;
  status: 'PENDING' | 'REQUESTED' | 'PAID';
  paymentUrl: string | null;
  paidAt: string | null;
}

export interface Split {
  id: string;
  mode: SplitMode;
  currency: string;
  total: string;
  totalMinor: number;
  perHead: string | null;
  shares: SplitShare[];
}

export interface ReceiptItem {
  qty: number;
  name: string;
  price: number;
  priceMinor: number;
}

export interface Receipt {
  id: string;
  label: string;
  currency: string;
  total: string;
  totalMinor: number;
  imageUrl: string | null;
  items: ReceiptItem[];
  createdAt: string;
}

/** A planner-chart stage from the backend — `Stage` plus persistence fields. */
export interface ApiStage extends Stage {
  id: string;
  done: boolean;
}

export interface ApiChart {
  title: string;
  sub: string;
  stages: ApiStage[];
}

/**
 * Full event detail (GET /events/:id). The backend overrides `attendees` with the
 * attendee array here (the list endpoint returns a headcount number instead).
 */
export interface EventDetail extends Omit<ApiEvent, 'attendees'> {
  attendees: Attendee[];
  stages: ApiStage[];
  split: Split | null;
  receipts: Receipt[];
}

/** AI extraction result (POST /events/draft). */
export interface ExtractedDraft {
  title: string;
  dateLabel: string;
  timeLabel: string;
  startsAtISO: string | null;
  endsAtISO: string | null;
  locations: { name: string; query: string; label: string | null }[];
  attendees: number;
  guests: string[];
  budgetMajor: number | null;
  currency: string;
  splitMode: SplitMode;
}

/** Request body for POST /events. */
export interface CreateEventInput {
  title: string;
  dateLabel: string;
  timeLabel: string;
  startsAtISO?: string | null;
  endsAtISO?: string | null;
  locations: { name: string; query?: string; label?: string | null }[];
  attendees: number;
  guests?: string[];
  budget?: string | number | null;
  currency?: string;
  splitMode?: SplitMode;
  sourceMessage?: string | null;
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  defaultSplitMode: SplitMode;
  notificationsEnabled: boolean;
  googleCalendarConnected: boolean;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  receiptId: string | null;
  createdAt: string;
  toolsUsed?: string[];
}

export interface Features {
  anthropic: boolean;
  googleCalendar: boolean;
  googleMaps: boolean;
  stripe: boolean;
  storage: boolean;
  push: boolean;
  email: boolean;
}

export interface AlbumPhoto {
  id: string;
  url: string;
  caption: string | null;
  uploaderName: string | null;
  createdAt: string;
}
