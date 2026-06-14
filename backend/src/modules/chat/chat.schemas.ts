import { z } from 'zod';

export const sendMessageSchema = z
  .object({
    text: z.string().max(4000).optional(),
    receipt: z
      .object({
        imageBase64: z.string().min(1),
        mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
      })
      .optional(),
  })
  .refine((v) => Boolean(v.text?.trim()) || Boolean(v.receipt), {
    message: 'Provide a message and/or a receipt',
  });
