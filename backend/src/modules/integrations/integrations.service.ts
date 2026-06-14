import { prisma } from '../../lib/prisma';
import { signOAuthState, verifyOAuthState } from '../../lib/oauthState';
import * as calendar from '../../integrations/googleCalendar';
import { badRequest } from '../../lib/errors';

/** Build the Google consent URL for connecting the user's calendar. */
export async function getGoogleConnectUrl(userId: string): Promise<string> {
  const state = await signOAuthState(userId);
  return calendar.getAuthUrl(state);
}

/** Handle Google's OAuth redirect: store the refresh token on the user. */
export async function handleGoogleCallback(code: string, state: string): Promise<void> {
  const userId = await verifyOAuthState(state);
  const { refreshToken } = await calendar.exchangeCode(code);
  if (!refreshToken) {
    throw badRequest('Google did not return a refresh token. Revoke access and reconnect.');
  }
  await prisma.user.update({
    where: { id: userId },
    data: { googleRefreshToken: refreshToken, googleCalendarId: 'primary' },
  });
}

export async function disconnectGoogle(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { googleRefreshToken: null, googleCalendarId: null },
  });
}
