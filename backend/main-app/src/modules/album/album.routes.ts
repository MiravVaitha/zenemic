import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '@zenemic/shared';
import { authenticate, requireUserId } from '@zenemic/shared';
import { validate } from '@zenemic/shared';
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
      // The object key the client uploaded to (from /upload-url) — NOT a URL.
      key: z.string().min(1),
      caption: z.string().optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
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
