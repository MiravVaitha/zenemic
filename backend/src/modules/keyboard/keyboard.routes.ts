import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/http';
import { authenticate, requireAuth, requireUserId } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as keyboard from './keyboard.service';

export const keyboardRouter = Router();

keyboardRouter.use(authenticate);

// callZenemicAPI(prompt) → event payload (pending confirm).
keyboardRouter.post(
  '/generate',
  validate({ body: z.object({ prompt: z.string().min(8) }) }),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(201).json(await keyboard.generate(requireAuth(req), req.body.prompt));
  }),
);

// confirmZenemicEvent(event) → commit invites + payment requests.
keyboardRouter.post(
  '/confirm',
  validate({ body: z.object({ eventId: z.string().min(1) }) }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await keyboard.confirm(requireUserId(req), req.body.eventId));
  }),
);
