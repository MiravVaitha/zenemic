import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/http';
import { authenticate, requireUserId } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as album from './album.service';

// Mounted at /events/:id/album — mergeParams to read the event id.
export const albumRouter = Router({ mergeParams: true });

albumRouter.use(authenticate);

albumRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await album.listPhotos(requireUserId(req), req.params.id));
  }),
);

albumRouter.post(
  '/upload-url',
  validate({ body: z.object({ contentType: z.string().min(1), ext: z.string().optional() }) }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await album.getUploadUrl(requireUserId(req), req.params.id, req.body));
  }),
);

albumRouter.post(
  '/',
  validate({
    body: z.object({
      url: z.string().url(),
      caption: z.string().optional(),
      uploaderName: z.string().optional(),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(201).json(await album.recordPhoto(requireUserId(req), req.params.id, req.body));
  }),
);

albumRouter.delete(
  '/:photoId',
  asyncHandler(async (req: Request, res: Response) => {
    await album.deletePhoto(requireUserId(req), req.params.id, req.params.photoId);
    res.status(204).end();
  }),
);
