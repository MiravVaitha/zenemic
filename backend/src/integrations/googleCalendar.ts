import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { env, features } from '../config/env';
import { notConfigured } from '../lib/errors';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'openid',
  'email',
];

export const googleCalendarEnabled = features.googleCalendar;

function oauthClient(): OAuth2Client {
  if (!features.googleCalendar) throw notConfigured('Google Calendar');
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_OAUTH_REDIRECT_URI,
  );
}

/** Consent URL to connect a user's Google Calendar. `state` carries the userId. */
export function getAuthUrl(state: string): string {
  return oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // force a refresh_token even on re-consent
    scope: SCOPES,
    state,
  });
}

/** Exchange the OAuth callback `code` for tokens (we persist the refresh token). */
export async function exchangeCode(code: string): Promise<{ refreshToken: string | null }> {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  return { refreshToken: tokens.refresh_token ?? null };
}

export interface CreateCalendarEventInput {
  refreshToken: string;
  calendarId?: string;
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  timeZone?: string;
  attendeeEmails?: string[];
}

/** Create an event on the user's calendar. Returns the event id + html link. */
export async function createCalendarEvent(
  input: CreateCalendarEventInput,
): Promise<{ id: string; htmlLink: string }> {
  const client = oauthClient();
  client.setCredentials({ refresh_token: input.refreshToken });
  const calendar = google.calendar({ version: 'v3', auth: client });

  const res = await calendar.events.insert({
    calendarId: input.calendarId ?? 'primary',
    sendUpdates: 'none', // invites are sent on explicit confirm, not draft-create
    requestBody: {
      summary: input.summary,
      description: input.description,
      location: input.location,
      start: { dateTime: input.start.toISOString(), timeZone: input.timeZone ?? 'Europe/London' },
      end: { dateTime: input.end.toISOString(), timeZone: input.timeZone ?? 'Europe/London' },
      attendees: input.attendeeEmails?.map((email) => ({ email })),
    },
  });

  return { id: res.data.id ?? '', htmlLink: res.data.htmlLink ?? '' };
}

/** Send invites for an already-created event (the keyboard "Confirm all" action). */
export async function sendCalendarInvites(params: {
  refreshToken: string;
  calendarId?: string;
  eventId: string;
}): Promise<void> {
  const client = oauthClient();
  client.setCredentials({ refresh_token: params.refreshToken });
  const calendar = google.calendar({ version: 'v3', auth: client });
  // Re-patch the event with sendUpdates=all to trigger invite emails.
  await calendar.events.patch({
    calendarId: params.calendarId ?? 'primary',
    eventId: params.eventId,
    sendUpdates: 'all',
    requestBody: {},
  });
}
