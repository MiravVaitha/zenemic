import { Router } from 'express';
import { asyncHandler } from '../../lib/http';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as ctrl from './chat.controller';
import { sendMessageSchema } from './chat.schemas';

// mergeParams so the parent ":id" (event id) is available here.
export const chatRouter = Router({ mergeParams: true });

chatRouter.use(authenticate);
chatRouter.get('/', asyncHandler(ctrl.history));
chatRouter.post('/', validate({ body: sendMessageSchema }), asyncHandler(ctrl.send));
