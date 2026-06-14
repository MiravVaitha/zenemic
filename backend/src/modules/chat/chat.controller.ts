import type { Request, Response } from 'express';
import { requireUserId } from '../../middleware/auth';
import * as chat from './chat.service';

export async function history(req: Request, res: Response) {
  res.json(await chat.getHistory(requireUserId(req), req.params.id));
}

export async function send(req: Request, res: Response) {
  const reply = await chat.sendMessage(requireUserId(req), req.params.id, req.body);
  res.status(201).json(reply);
}
