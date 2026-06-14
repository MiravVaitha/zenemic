import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import { env } from '../config/env';
import { logger } from '../config/logger';

const expo = new Expo(env.EXPO_ACCESS_TOKEN ? { accessToken: env.EXPO_ACCESS_TOKEN } : {});

export interface PushNotification {
  to: string | string[]; // Expo push tokens
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Send Expo push notifications (event reminders, RSVP nudges, "X paid" alerts).
 * Invalid tokens are skipped; failures are logged, not thrown, so a flaky push
 * never breaks the action that triggered it.
 */
export async function sendPush(notification: PushNotification): Promise<void> {
  const tokens = (Array.isArray(notification.to) ? notification.to : [notification.to]).filter(
    (t) => Expo.isExpoPushToken(t),
  );
  if (!tokens.length) return;

  const messages: ExpoPushMessage[] = tokens.map((to) => ({
    to,
    sound: 'default',
    title: notification.title,
    body: notification.body,
    data: notification.data,
  }));

  try {
    for (const chunk of expo.chunkPushNotifications(messages)) {
      await expo.sendPushNotificationsAsync(chunk);
    }
  } catch (err) {
    logger.warn({ err }, 'Expo push failed');
  }
}
