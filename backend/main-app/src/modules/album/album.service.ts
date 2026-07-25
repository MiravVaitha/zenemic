import { prisma } from '@zenemic/shared';
import { notFound, forbidden, badRequest } from '@zenemic/shared';
import { serializeAlbumPhoto } from '@zenemic/shared';
import { storage } from '@zenemic/shared';

/** Cap photos per event so the (free-tier) private bucket stays bounded. */
const MAX_ALBUM_PHOTOS = 60;

/**
 * Who may read/modify an event's album. Today: the event owner only. This is the
 * SINGLE seam to relax when event attendees exist — every album operation funnels
 * through here, so "owner OR attendee" becomes a one-line change (add an attendee
 * membership lookup) without touching the rest of the module.
 */
async function assertAlbumAccess(userId: string, eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, userId: true },
  });
  if (!event) throw notFound('Event not found');
  if (event.userId !== userId) throw forbidden('Not your event');
}

export async function listPhotos(userId: string, eventId: string) {
  await assertAlbumAccess(userId, eventId);
  const photos = await prisma.albumPhoto.findMany({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
  });
  // Sign each private object into a short-lived URL the app can render.
  const serialized = await Promise.all(
    photos.map(async (p) => ({
      ...serializeAlbumPhoto(p),
      url: await storage.signedGetUrl(p.storageKey),
    })),
  );
  return {
    count: photos.length,
    albumUrl: storage.storageEnabled ? storage.albumUrl(eventId) : null,
    photos: serialized,
  };
}

/** Presign a direct-to-storage upload so the client can add a photo. */
export async function getUploadUrl(
  userId: string,
  eventId: string,
  input: { contentType: string; ext?: string },
) {
  await assertAlbumAccess(userId, eventId);
  const count = await prisma.albumPhoto.count({ where: { eventId } });
  if (count >= MAX_ALBUM_PHOTOS) {
    throw badRequest(`This album is full (max ${MAX_ALBUM_PHOTOS} photos). Remove some to add more.`);
  }
  return storage.createPresignedUpload({ eventId, contentType: input.contentType, ext: input.ext });
}

/** Record a photo the client just uploaded to its presigned key. */
export async function recordPhoto(
  userId: string,
  eventId: string,
  input: { key: string; caption?: string; width?: number; height?: number },
) {
  await assertAlbumAccess(userId, eventId);
  // Trust nothing from the client but the key we minted for THIS event's album.
  if (!input.key.startsWith(`albums/${eventId}/`)) {
    throw badRequest('Invalid photo key for this event');
  }
  const count = await prisma.albumPhoto.count({ where: { eventId } });
  if (count >= MAX_ALBUM_PHOTOS) {
    throw badRequest(`This album is full (max ${MAX_ALBUM_PHOTOS} photos).`);
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  const photo = await prisma.albumPhoto.create({
    data: {
      eventId,
      storageKey: input.key,
      caption: input.caption,
      width: input.width,
      height: input.height,
      uploaderId: userId,
      uploaderName: user?.name ?? null,
    },
  });
  return { ...serializeAlbumPhoto(photo), url: await storage.signedGetUrl(photo.storageKey) };
}

export async function deletePhoto(userId: string, eventId: string, photoId: string) {
  await assertAlbumAccess(userId, eventId);
  const photo = await prisma.albumPhoto.findFirst({ where: { id: photoId, eventId } });
  if (!photo) throw notFound('Photo not found');
  // Future (attendees): restrict non-owners to their own uploads here, e.g.
  //   if (event.userId !== userId && photo.uploaderId !== userId) throw forbidden();
  // Delete the file first, then the row. Best-effort on storage so a transient
  // failure never leaves an un-deletable DB row (the object is reclaimable later
  // via the per-event cleanup on event deletion).
  try {
    await storage.deleteObject(photo.storageKey);
  } catch {
    // swallow — the row delete below is the source of truth for the UI
  }
  await prisma.albumPhoto.delete({ where: { id: photoId } });
}
