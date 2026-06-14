import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { completeStructured, MODELS } from './client';
import { RECEIPT_ITEMIZATION_SYSTEM } from './prompts';
import { env } from '../config/env';

export const ItemizedReceiptSchema = z.object({
  label: z.string(),
  currency: z.string(),
  items: z.array(
    z.object({
      qty: z.number().int().min(1),
      name: z.string(),
      priceMajor: z.number(),
    }),
  ),
  totalMajor: z.number(),
});

export type ItemizedReceipt = z.infer<typeof ItemizedReceiptSchema>;

const RECEIPT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    label: { type: 'string', description: 'Short human label for the receipt' },
    currency: { type: 'string', description: 'lowercase ISO code' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          qty: { type: 'integer', minimum: 1 },
          name: { type: 'string' },
          priceMajor: { type: 'number', description: 'Unit price in major units' },
        },
        required: ['qty', 'name', 'priceMajor'],
        additionalProperties: false,
      },
    },
    totalMajor: { type: 'number' },
  },
  required: ['label', 'currency', 'items', 'totalMajor'],
  additionalProperties: false,
};

export type ReceiptImage =
  | { kind: 'base64'; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; data: string }
  | { kind: 'url'; url: string };

/**
 * Read a receipt/bill photo (the "attach a receipt" flow in EventChatPanel) and
 * return itemised lines + total via Claude vision.
 */
export async function itemizeReceipt(
  image: ReceiptImage,
  opts: { fallbackCurrency?: string } = {},
): Promise<ItemizedReceipt> {
  const fallbackCurrency = opts.fallbackCurrency ?? env.STRIPE_CURRENCY;

  const imageBlock: Anthropic.ImageBlockParam =
    image.kind === 'base64'
      ? { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } }
      : { type: 'image', source: { type: 'url', url: image.url } };

  const content: Anthropic.ContentBlockParam[] = [
    imageBlock,
    { type: 'text', text: `Itemise this receipt. fallbackCurrency: ${fallbackCurrency}` },
  ];

  return completeStructured({
    schema: ItemizedReceiptSchema,
    jsonSchema: RECEIPT_JSON_SCHEMA,
    toolName: 'record_receipt',
    toolDescription: 'Record the itemised receipt lines and total.',
    system: RECEIPT_ITEMIZATION_SYSTEM,
    user: content,
    model: MODELS.default,
  });
}
