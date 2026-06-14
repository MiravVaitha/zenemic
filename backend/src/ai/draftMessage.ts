import { completeText } from './client';
import { DRAFT_MESSAGE_SYSTEM } from './prompts';

/**
 * Draft a short group-chat message for the host to send (reminders, RSVP nudges,
 * "who hasn't paid" prompts). Returns plain text the client can copy or send.
 */
export async function draftMessage(instruction: string, eventContext: string): Promise<string> {
  return completeText({
    system: DRAFT_MESSAGE_SYSTEM,
    user: `Event context:\n${eventContext}\n\nWrite a message that: ${instruction}`,
  });
}
