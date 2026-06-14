import { z } from 'zod';

export const updateSettingsSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  defaultSplitMode: z.enum(['EVEN', 'BY_SHARE', 'BY_ITEM']).optional(),
  notificationsEnabled: z.boolean().optional(),
  expoPushToken: z.string().nullable().optional(),
});
