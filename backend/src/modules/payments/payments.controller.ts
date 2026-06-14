import type { Request, Response } from 'express';
import { requireUserId } from '../../middleware/auth';
import * as payments from './payments.service';

export async function getSplit(req: Request, res: Response) {
  res.json(await payments.getSplit(requireUserId(req), req.params.id));
}

export async function recompute(req: Request, res: Response) {
  res.json(await payments.recomputeSplit(requireUserId(req), req.params.id, req.body));
}

export async function updateShares(req: Request, res: Response) {
  res.json(await payments.updateShares(requireUserId(req), req.params.id, req.body));
}

export async function sendRequests(req: Request, res: Response) {
  res.json(await payments.sendRequests(requireUserId(req), req.params.id));
}
