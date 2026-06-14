import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/http';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as ctrl from './payments.controller';

const recomputeSchema = z.object({
  totalMajor: z.number().positive().optional(),
  mode: z.enum(['EVEN', 'BY_SHARE', 'BY_ITEM']).optional(),
});

const updateSharesSchema = z.object({
  shares: z
    .array(z.object({ shareId: z.string().min(1), amountMajor: z.number().min(0) }))
    .min(1),
  mode: z.enum(['EVEN', 'BY_SHARE', 'BY_ITEM']).optional(),
});

// Mounted at /events/:id/split — mergeParams to read the event id.
export const splitRouter = Router({ mergeParams: true });

splitRouter.use(authenticate);
splitRouter.get('/', asyncHandler(ctrl.getSplit));
splitRouter.post('/', validate({ body: recomputeSchema }), asyncHandler(ctrl.recompute));
splitRouter.patch('/shares', validate({ body: updateSharesSchema }), asyncHandler(ctrl.updateShares));
splitRouter.post('/send', asyncHandler(ctrl.sendRequests));
