import type { Request, Response } from 'express';
import { requireAuth, requireUserId, prisma, googleMaps, verifyMapToken, badRequest, logger } from '@zenemic/shared';
import { events } from '@zenemic/shared';

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

/**
 * Static-map proxy — streams a Google Static Maps PNG with a numbered pin per
 * geocoded stop. Public but signature-gated (the app loads it via an <Image>
 * using the signed URL from `serializeEvent`), so the Google API key stays
 * server-side. 404s when nothing is geocoded (the app then hides the image).
 */
export async function getMap(req: Request, res: Response) {
  const { id } = req.params;
  const { exp, sig } = req.query as { exp?: string; sig?: string };
  if (!verifyMapToken(id, exp, sig)) throw badRequest('Invalid or expired map link');

  const stops = await prisma.eventLocation.findMany({
    where: { eventId: id },
    orderBy: { order: 'asc' },
    select: { lat: true, lng: true },
  });
  const points = stops
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => ({ lat: s.lat as number, lng: s.lng as number }));

  const url = googleMaps.staticMapUrl(points);
  if (!url) return res.status(404).end();

  const upstream = await fetch(url);
  if (!upstream.ok) {
    logger.warn(
      { eventId: id, status: upstream.status },
      'static map upstream failed — is the Maps Static API enabled on the Google key?',
    );
    return res.status(502).end();
  }
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.end(Buffer.from(await upstream.arrayBuffer()));
}
