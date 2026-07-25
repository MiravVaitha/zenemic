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
  Rsvp,
  Split,
  SplitMode,
} from '../types/api';

/** A typed error carrying the backend's error envelope `{ error: { code, message } }`. */
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
  /** True when an optional integration (Stripe/Google/S3) isn't configured. */
  get notConfigured() {
    return this.status === 503 || this.code === 'not_configured';
  }
}

async function request<T>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { method = 'GET', body, auth = true } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (auth) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}/api${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      0,
      'network_error',
      "Can't reach the server. Check the backend is running and EXPO_PUBLIC_API_URL points at your PC's LAN IP.",
    );
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const err = (json && json.error) || {};
    throw new ApiError(res.status, err.code ?? 'error', err.message ?? `Request failed (${res.status})`);
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
  draftEvent: (message: string) => request<ExtractedDraft>('/events/draft', { method: 'POST', body: { message } }),
  createEvent: (input: CreateEventInput) =>
    request<{ event: ApiEvent; resources: Record<string, boolean> }>('/events', { method: 'POST', body: input }),
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
