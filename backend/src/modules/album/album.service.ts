import { prisma } from '../../lib/prisma';
import { notFound, forbidden } from '../../lib/errors';
import { serializeAlbumPhoto } from '../events/events.serializer';
import * as storage from '../../integrations/storage';

async function assertOwner(userId: string, eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, userId: true },
  });
  if (!event) throw notFound('Event not found');
  if (event.userId !== userId) throw forbidden('Not your event');
}

export async function listPhotos(userId: string, eventId: string) {
  await assertOwner(userId, eventId);
  const photos = await prisma.albumPhoto.findMany({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
  });
  return { count: photos.length, albumUrl: storage.storageEnabled ? storage.albumUrl(eventId) : null, photos: photos.map(serializeAlbumPhoto) };
}

/** Presign a direct-to-storage upload so the client can add a photo. */
export async function getUploadUrl(
  userId: string,
  eventId: string,
  input: { contentType: string; ext?: string },
) {
  await assertOwner(userId, eventId);
  return storage.createPresignedUpload({ eventId, contentType: input.contentType, ext: input.ext });
}

/** Record a photo (URL from the presigned upload, or any hosted URL). */
export async function recordPhoto(
  userId: string,
  eventId: string,
  input: { url: string; caption?: string; uploaderName?: string },
) {
  await assertOwner(userId, eventId);
  const photo = await prisma.albumPhoto.create({
    data: { eventId, url: input.url, caption: input.caption, uploaderName: input.uploaderName },
  });
  return serializeAlbumPhoto(photo);
}

export async function deletePhoto(userId: string, eventId: string, photoId: string) {
  await assertOwner(userId, eventId);
  const photo = await prisma.albumPhoto.findFirst({ where: { id: photoId, eventId } });
  if (!photo) throw notFound('Photo not found');
  await prisma.albumPhoto.delete({ where: { id: photoId } });
}
