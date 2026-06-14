import { Router } from 'express';
import { asyncHandler } from '../../lib/http';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
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
