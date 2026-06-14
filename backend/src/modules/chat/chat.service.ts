import type Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { prisma } from '../../lib/prisma';
import { notFound, forbidden } from '../../lib/errors';
import { formatMoney, toMinor, evenSplit } from '../../lib/money';
import { runEventChat, draftMessage, itemizeReceipt, type ReceiptImage } from '../../ai';
import { prompts } from '../../ai';
import { splitStatusSummary } from '../payments/splitter.service';
import * as storage from '../../integrations/storage';

async function loadOwnedEvent(userId: string, eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { attendees: true, split: { include: { shares: { include: { attendee: true } } } } },
  });
  if (!event) throw notFound('Event not found');
  if (event.userId !== userId) throw forbidden('Not your event');
  return event;
}

function eventSummary(event: Awaited<ReturnType<typeof loadOwnedEvent>>): string {
  const budget = event.budgetMinor != null ? formatMoney(event.budgetMinor, event.currency) : 'not set';
  return [
    `Title: ${event.title}`,
    `When: ${event.dateLabel} ${event.timeLabel}`,
    `Where: ${event.location}`,
    `Attendees: ${event.attendeesCount}`,
    `Budget: ${budget}`,
    `Split mode: ${event.splitMode}`,
  ].join('\n');
}

export async function getHistory(userId: string, eventId: string) {
  await loadOwnedEvent(userId, eventId);
  const messages = await prisma.chatMessage.findMany({
    where: { eventId },
    orderBy: { createdAt: 'asc' },
    include: { receipt: { include: { items: true } } },
  });
  return messages.map((m) => ({
    id: m.id,
    role: m.role.toLowerCase(),
    content: m.content,
    receiptId: m.receiptId,
    createdAt: m.createdAt,
  }));
}

export interface SendMessageInput {
  text?: string;
  receipt?: { imageBase64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' };
}

export async function sendMessage(userId: string, eventId: string, input: SendMessageInput) {
  const event = await loadOwnedEvent(userId, eventId);

  // 1. If a receipt photo is attached, itemise it (vision) + persist it.
  let receiptId: string | null = null;
  let receiptNote = '';
  if (input.receipt) {
    const image: ReceiptImage = {
      kind: 'base64',
      mediaType: input.receipt.mediaType,
      data: input.receipt.imageBase64,
    };
    const itemized = await itemizeReceipt(image, { fallbackCurrency: event.currency });
    let imageUrl: string | null = null;
    if (storage.storageEnabled) {
      const ext = input.receipt.mediaType.split('/')[1];
      imageUrl = await storage
        .uploadBuffer({
          key: `receipts/${eventId}/${randomUUID()}.${ext}`,
          body: Buffer.from(input.receipt.imageBase64, 'base64'),
          contentType: input.receipt.mediaType,
        })
        .catch(() => null);
    }
    const receipt = await prisma.receipt.create({
      data: {
        eventId,
        label: itemized.label,
        currency: itemized.currency,
        totalMinor: toMinor(itemized.totalMajor, itemized.currency),
        imageUrl,
        items: {
          create: itemized.items.map((it) => ({
            qty: it.qty,
            name: it.name,
            priceMinor: toMinor(it.priceMajor, itemized.currency),
          })),
        },
      },
    });
    receiptId = receipt.id;
    receiptNote = `\n\n[Attached receipt "${itemized.label}": total ${formatMoney(receipt.totalMinor, receipt.currency)} across ${itemized.items.length} item(s)]`;
  }

  // 2. Persist the user message.
  const userContent = (input.text ?? '').trim() + receiptNote;
  await prisma.chatMessage.create({
    data: { eventId, role: 'USER', content: userContent || '(sent a receipt)', receiptId },
  });

  // 3. Replay history as Anthropic messages.
  const history = await prisma.chatMessage.findMany({
    where: { eventId },
    orderBy: { createdAt: 'asc' },
  });
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role === 'USER' ? 'user' : 'assistant',
    content: m.content,
  }));

  // 4. Tools the assistant can use this turn (read / draft / propose — safe).
  const tools: Anthropic.Tool[] = [
    {
      name: 'get_split_status',
      description: 'Get how many attendees have paid and who is still outstanding.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'propose_split_update',
      description:
        'Compute a proposed even split for a given total without committing it. Use to answer "what would X cost a head".',
      input_schema: {
        type: 'object',
        properties: {
          totalMajor: { type: 'number', description: 'Total to split, in major currency units' },
        },
        required: ['totalMajor'],
      },
    },
    {
      name: 'draft_group_message',
      description: 'Draft a short message the host can send to the group (reminder, nudge, update).',
      input_schema: {
        type: 'object',
        properties: { purpose: { type: 'string', description: 'What the message should say/ask' } },
        required: ['purpose'],
      },
    },
  ];

  const executeTool = async (name: string, rawInput: unknown): Promise<string> => {
    const args = (rawInput ?? {}) as Record<string, unknown>;
    switch (name) {
      case 'get_split_status':
        return splitStatusSummary(eventId);
      case 'propose_split_update': {
        const totalMinor = toMinor(Number(args.totalMajor) || 0, event.currency);
        const parts = evenSplit(totalMinor, Math.max(event.attendeesCount, 1));
        return `Split ${formatMoney(totalMinor, event.currency)} across ${event.attendeesCount} = ${formatMoney(parts[0] ?? 0, event.currency)} a head (this is a proposal; not yet sent).`;
      }
      case 'draft_group_message':
        return draftMessage(String(args.purpose ?? ''), eventSummary(event));
      default:
        return `Unknown tool: ${name}`;
    }
  };

  // 5. Run the assistant turn.
  const result = await runEventChat({
    system: prompts.eventChatSystem(eventSummary(event)),
    messages,
    tools,
    executeTool,
  });

  // 6. Persist + return the assistant reply.
  const assistant = await prisma.chatMessage.create({
    data: { eventId, role: 'ASSISTANT', content: result.text },
  });
  return {
    id: assistant.id,
    role: 'assistant' as const,
    content: result.text,
    toolsUsed: result.toolsUsed,
    receiptId,
    createdAt: assistant.createdAt,
  };
}
