import { Router } from 'express';
import { asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import * as ctrl from './auth.controller';
import { updateSettingsSchema } from './auth.schemas';

// Signup / login / refresh / password reset are handled by Supabase Auth on the
// client. The backend only manages the app profile tied to the Supabase user.
export const authRouter = Router();

authRouter.use(authenticate);

authRouter.get('/me', asyncHandler(ctrl.me)); // syncs the profile + returns it
authRouter.patch('/me', validate({ body: updateSettingsSchema }), asyncHandler(ctrl.updateSettings));
authRouter.delete('/account', asyncHandler(ctrl.deleteAccount));
