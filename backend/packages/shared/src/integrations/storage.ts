import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { env, features } from '../config/env';
import { notConfigured } from '../lib/errors';

export const storageEnabled = features.storage;

/**
 * The bucket is PRIVATE. Objects are never world-readable — every read goes
 * through a signed URL (`signedGetUrl`) issued only after the app layer has
 * checked the caller may see that event. Unlike a permanent public URL, a leaked
 * one EXPIRES and can't be renewed without authenticating. An hour is long enough
 * to browse/download a session (the app re-fetches fresh URLs on focus and caches
 * bytes by a stable key, so rotation causes no re-downloads), short enough to bound
 * a leak. Tune down for stricter posture.
 */
const READ_URL_TTL = 3600; // seconds (1 hour)
const UPLOAD_URL_TTL = 900; // seconds (15 min)

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!features.storage) throw notConfigured('Object storage (S3)');
  if (!client) {
    client = new S3Client({
      region: env.S3_REGION ?? 'us-east-1',
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID as string,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY as string,
      },
    });
  }
  return client;
}

/**
 * The storage prefix for an event's shared album. This is a MARKER, not a
 * fetchable URL — the bucket is private, so there is no public URL. Reads use
 * `signedGetUrl` per object.
 */
export function albumUrl(eventId: string): string {
  return `albums/${eventId}/`;
}

/**
 * Presign a direct-to-S3 upload so the client can add a photo without proxying
 * bytes through the backend. Returns the object `key` (stored in the DB) — the
 * caller confirms the upload via the album's `record` endpoint, which validates
 * the key belongs to the event.
 */
export async function createPresignedUpload(params: {
  eventId: string;
  contentType: string;
  ext?: string;
}): Promise<{ uploadUrl: string; key: string }> {
  const s3 = getClient();
  const key = `albums/${params.eventId}/${randomUUID()}${params.ext ? `.${params.ext}` : ''}`;
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: params.contentType,
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: UPLOAD_URL_TTL });
  return { uploadUrl, key };
}

/**
 * A short-lived signed GET URL for a private object. Returns null for an empty
 * key or when storage is off. Values that are already absolute URLs are passed
 * through untouched — a safety net for any legacy row written while the bucket
 * was still public.
 */
export async function signedGetUrl(
  key: string | null | undefined,
  expiresIn = READ_URL_TTL,
): Promise<string | null> {
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key; // legacy absolute URL — leave as-is
  if (!features.storage) return null;
  const s3 = getClient();
  const command = new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}

/** Delete a single object by key. Throws on hard failure — callers decide policy. */
export async function deleteObject(key: string): Promise<void> {
  const s3 = getClient();
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}

/**
 * Upload a buffer server-side (e.g. a receipt image from the chat panel).
 * Returns the storage KEY (not a URL) — the bucket is private, so the caller
 * stores the key and signs it on read.
 */
export async function uploadBuffer(params: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<string> {
  const s3 = getClient();
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    }),
  );
  return params.key;
}
