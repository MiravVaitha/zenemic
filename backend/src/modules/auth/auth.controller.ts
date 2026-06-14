import type { Request, Response } from 'express';
import * as authService from './auth.service';
import { requireAuth, requireUserId } from '../../middleware/auth';

export async function me(req: Request, res: Response) {
  res.json(await authService.getMe(requireAuth(req)));
}

export async function updateSettings(req: Request, res: Response) {
  res.json(await authService.updateSettings(requireUserId(req), req.body));
}

export async function deleteAccount(req: Request, res: Response) {
  await authService.deleteAccount(requireUserId(req));
  res.status(204).end();
}
