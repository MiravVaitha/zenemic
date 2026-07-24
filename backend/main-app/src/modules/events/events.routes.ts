import { Router } from 'express';
import { asyncHandler } from '@zenemic/shared';
import { authenticate } from '@zenemic/shared';
import { validate } from '@zenemic/shared';
import * as ctrl from './events.controller';
import {
  createEventSchema,
  extractDraftSchema,
  eventIdParam,
  updateEventSchema,
  listEventsQuery,
  editChartSchema,
  stageIdParam,
  stageDoneSchema,
  attendeeIdParam,
  attendeeRsvpSchema,
} from './events.schemas';

export const eventsRouter = Router();

// Public (signature-gated) static-map proxy. Loaded by an <Image> that can't
// send a Bearer token, so it authenticates via the signed URL rather than the
// session — MUST stay registered before the `authenticate` guard below.
eventsRouter.get('/:id/map.png', asyncHandler(ctrl.getMap));

eventsRouter.use(authenticate);

// Create flow.
eventsRouter.post('/draft', validate({ body: extractDraftSchema }), asyncHandler(ctrl.extractDraft));
eventsRouter.post('/', validate({ body: createEventSchema }), asyncHandler(ctrl.create));

// CRUD.
eventsRouter.get('/', validate({ query: listEventsQuery }), asyncHandler(ctrl.list));
eventsRouter.get('/:id', validate({ params: eventIdParam }), asyncHandler(ctrl.getOne));
eventsRouter.patch(
  '/:id',
  validate({ params: eventIdParam, body: updateEventSchema }),
  asyncHandler(ctrl.update),
);
eventsRouter.delete('/:id', validate({ params: eventIdParam }), asyncHandler(ctrl.remove));

// Planner chart.
eventsRouter.get('/:id/chart', validate({ params: eventIdParam }), asyncHandler(ctrl.getChart));
eventsRouter.post('/:id/chart', validate({ params: eventIdParam }), asyncHandler(ctrl.regenerateChart));
eventsRouter.put(
  '/:id/chart',
  validate({ params: eventIdParam, body: editChartSchema }),
  asyncHandler(ctrl.editChart),
);
eventsRouter.patch(
  '/:id/stages/:stageId',
  validate({ params: stageIdParam, body: stageDoneSchema }),
  asyncHandler(ctrl.setStageDone),
);

// Attendees (RSVP).
eventsRouter.patch(
  '/:id/attendees/:attendeeId',
  validate({ params: attendeeIdParam, body: attendeeRsvpSchema }),
  asyncHandler(ctrl.updateAttendeeRsvp),
);
