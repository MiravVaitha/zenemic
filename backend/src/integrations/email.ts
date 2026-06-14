import { env, features } from '../config/env';
import { logger } from '../config/logger';

export const emailEnabled = features.email;

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send a transactional email via Resend's REST API (no SDK dependency). If no
 * RESEND_API_KEY is configured, we log the email instead of sending.
 *
 * NOTE: auth emails (verification, password reset, magic links) are sent by
 * Supabase Auth, not here. This is for app-level mail like event invites.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (!features.email) {
    logger.info({ to: message.to, subject: message.subject }, '[email disabled] would send');
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });
  if (!res.ok) {
    logger.warn({ status: res.status, body: await res.text() }, 'Resend send failed');
  }
}
