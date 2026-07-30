import { supabase } from './supabase';
import { config } from '../config';
import type { EventKind } from '../data/events';
import type {
  AlbumPhoto,
  ApiChart,
  ApiEvent,
  ApiStage,
  Attendee,
  ChatMessage,
  CreateEventInput,
  EventDetail,
  ExtractedDraft,
  Features,
  Profile,
  ResourceReport,
  Rsvp,
  Split,
  SplitMode,
} from '../types/api';

/** A typed error carrying the backend's error envelope `{ error: { code, message } }`. */
export class ApiError extends Error {
  status: number;
  code: string;
  /** Correlation id for a server-side failure — matches an `errorId` in the backend log. */
  errorId?: string;
  constructor(status: number, code: string, message: string, errorId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.errorId = errorId;
  }
  /** True when an optional integration (Stripe/Google/S3) isn't configured. */
  get notConfigured() {
    return this.status === 503 || this.code === 'not_configured';
  }
}

/**
 * Every await in `request` needs a deadline. A promise that simply never settles
 * has no error path, so the screen that called it spins forever with nothing to
 * show and nothing to log — indistinguishable from a slow network, and far
 * harder to diagnose than a failure. These two guards turn that into an error.
 */
const SESSION_TIMEOUT_MS = 10_000;
/** Generous: creating an event runs AI extraction, chart generation and geocoding. */
const DEFAULT_TIMEOUT_MS = 90_000;

class TimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(label)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function request<T>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const { method = 'GET', body, auth = true, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (auth) {
    // getSession reads storage and may silently refresh against Supabase; if it
    // stalls, fail loudly rather than never issuing the request at all.
    try {
      const { data } = await withTimeout(
        supabase.auth.getSession(),
        SESSION_TIMEOUT_MS,
        'getSession',
      );
      const token = data.session?.access_token;
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch (e) {
      if (e instanceof TimeoutError) {
        throw new ApiError(
          0,
          'session_timeout',
          'Timed out reading your session. Log out and back in, then try again.',
        );
      }
      throw e;
    }
  }

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}/api${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    const aborted = controller.signal.aborted;
    throw new ApiError(
      0,
      aborted ? 'timeout' : 'network_error',
      aborted
        ? 'The server took too long to respond. Try again.'
        : "Can't reach the server. Check the backend is running and EXPO_PUBLIC_API_URL points at your PC's LAN IP.",
    );
  } finally {
    clearTimeout(deadline);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const err = (json && json.error) || {};
    throw new ApiError(
      res.status,
      err.code ?? 'error',
      err.message ?? `Request failed (${res.status})`,
      err.errorId,
    );
  }
  return json as T;
}

export const api = {
  // Health / integrations (public)
  health: () => request<{ status: string; features: Features }>('/health', { auth: false }),
  integrationsStatus: () =>
    request<{ features: Features; stripePublishableKey?: string }>('/integrations/status', { auth: false }),

  // Profile
  getMe: () => request<Profile>('/auth/me'),
  updateMe: (patch: {
    name?: string;
    defaultSplitMode?: SplitMode;
    notificationsEnabled?: boolean;
    expoPushToken?: string | null;
  }) => request<Profile>('/auth/me', { method: 'PATCH', body: patch }),
  deleteAccount: () => request<void>('/auth/account', { method: 'DELETE' }),

  // Events
  getEvents: (kind?: EventKind) => request<ApiEvent[]>(`/events${kind ? `?kind=${kind}` : ''}`),
  getEvent: (id: string) => request<EventDetail>(`/events/${id}`),
  /**
   * `todayISO`/`timezoneOffset` come from the phone so relative dates ("Saturday
   * 7th") resolve against the host's clock, not the server's.
   */
  draftEvent: (message: string) =>
    request<ExtractedDraft>('/events/draft', {
      method: 'POST',
      body: {
        message,
        todayISO: new Date().toISOString(),
        timezoneOffset: String(-new Date().getTimezoneOffset()),
      },
    }),
  createEvent: (input: CreateEventInput) =>
    request<{ event: ApiEvent; resources: ResourceReport }>('/events', { method: 'POST', body: input }),
  updateEvent: (
    id: string,
    patch: {
      title?: string;
      dateLabel?: string;
      timeLabel?: string;
      location?: string;
      locations?: { name: string; query?: string; label?: string | null }[];
      splitMode?: SplitMode;
      startsAtISO?: string | null;
      endsAtISO?: string | null;
      attendees?: number;
      budget?: string | number | null;
    },
  ) => request<ApiEvent>(`/events/${id}`, { method: 'PATCH', body: patch }),
  deleteEvent: (id: string) => request<void>(`/events/${id}`, { method: 'DELETE' }),

  /** Add an already-created event to Google Calendar (for events made before connecting). */
  syncCalendar: (id: string) => request<EventDetail>(`/events/${id}/calendar`, { method: 'POST' }),

  // Planner chart
  getChart: (id: string) => request<ApiChart>(`/events/${id}/chart`),
  regenerateChart: (id: string) => request<ApiChart>(`/events/${id}/chart`, { method: 'POST' }),
  editChart: (
    id: string,
    stages: { tag: string; t: string; heading: string; body: string; kind: string; done?: boolean }[],
  ) => request<ApiChart>(`/events/${id}/chart`, { method: 'PUT', body: { stages } }),
  setStageDone: (id: string, stageId: string, done: boolean) =>
    request<ApiStage>(`/events/${id}/stages/${stageId}`, { method: 'PATCH', body: { done } }),

  // Attendees
  setRsvp: (id: string, attendeeId: string, rsvp: Rsvp) =>
    request<Attendee>(`/events/${id}/attendees/${attendeeId}`, { method: 'PATCH', body: { rsvp } }),

  // Chat
  getChat: (id: string) => request<ChatMessage[]>(`/events/${id}/chat`),
  sendChat: (id: string, body: { text?: string; receipt?: { imageBase64: string; mediaType: string } }) =>
    request<ChatMessage>(`/events/${id}/chat`, { method: 'POST', body }),

  // Splitter
  getSplit: (id: string) => request<Split | null>(`/events/${id}/split`),
  recomputeSplit: (id: string, body: { totalMajor?: number; mode?: SplitMode }) =>
    request<Split>(`/events/${id}/split`, { method: 'POST', body }),
  updateShares: (id: string, body: { shares: { shareId: string; amountMajor: number }[]; mode?: SplitMode }) =>
    request<Split>(`/events/${id}/split/shares`, { method: 'PATCH', body }),
  sendSplit: (id: string) => request<Split>(`/events/${id}/split/send`, { method: 'POST' }),

  // Album
  getAlbum: (id: string) =>
    request<{ count: number; albumUrl: string | null; photos: AlbumPhoto[] }>(`/events/${id}/album`),
  albumUploadUrl: (id: string, body: { contentType: string; ext?: string }) =>
    request<{ uploadUrl: string; key: string }>(`/events/${id}/album/upload-url`, {
      method: 'POST',
      body,
    }),
  addPhoto: (id: string, body: { key: string; caption?: string; width?: number; height?: number }) =>
    request<AlbumPhoto>(`/events/${id}/album`, { method: 'POST', body }),
  deletePhoto: (id: string, photoId: string) =>
    request<void>(`/events/${id}/album/${photoId}`, { method: 'DELETE' }),

  // Integrations
  googleConnectUrl: () => request<{ url: string }>('/integrations/google/connect'),
};
