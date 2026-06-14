import type { Request, Response } from 'express';
import { requireAuth, requireUserId } from '../../middleware/auth';
import * as events from './events.service';

export async function extractDraft(req: Request, res: Response) {
  const { message, todayISO, timezoneOffset } = req.body;
  const draft = await events.extractDraft(message, { todayISO, timezoneOffset });
  res.json(draft);
}

export async function create(req: Request, res: Response) {
  const result = await events.createEvent(requireAuth(req), req.body);
  res.status(201).json(result);
}

export async function list(req: Request, res: Response) {
  const kind = req.query.kind as 'PLANNED' | 'ONGOING' | 'PREVIOUS' | undefined;
  res.json(await events.listEvents(requireUserId(req), kind));
}

export async function getOne(req: Request, res: Response) {
  res.json(await events.getEvent(requireUserId(req), req.params.id));
}

export async function getChart(req: Request, res: Response) {
  res.json(await events.getChart(requireUserId(req), req.params.id));
}

export async function regenerateChart(req: Request, res: Response) {
  res.json(await events.regenerateChart(requireUserId(req), req.params.id));
}

export async function editChart(req: Request, res: Response) {
  res.json(await events.replaceChart(requireUserId(req), req.params.id, req.body.stages));
}

export async function setStageDone(req: Request, res: Response) {
  const result = await events.setStageDone(
    requireUserId(req),
    req.params.id,
    req.params.stageId,
    req.body.done,
  );
  res.json(result);
}

export async function updateAttendeeRsvp(req: Request, res: Response) {
  const result = await events.updateAttendeeRsvp(
    requireUserId(req),
    req.params.id,
    req.params.attendeeId,
    req.body.rsvp,
  );
  res.json(result);
}

export async function update(req: Request, res: Response) {
  res.json(await events.updateEvent(requireUserId(req), req.params.id, req.body));
}

export async function remove(req: Request, res: Response) {
  await events.deleteEvent(requireUserId(req), req.params.id);
  res.status(204).end();
}
