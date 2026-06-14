import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { env, features } from '../config/env';
import { notConfigured } from '../lib/errors';

export const storageEnabled = features.storage;

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

function publicUrl(key: string): string {
  const base = env.S3_PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (base) return `${base}/${key}`;
  // Fall back to the standard virtual-hosted–style S3 URL.
  return `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com/${key}`;
}

/** Public URL prefix for an event's shared photo album. */
export function albumUrl(eventId: string): string {
  return publicUrl(`albums/${eventId}/`);
}

/**
 * Presign a direct-to-S3 upload so the client can add a photo to an album
 * without proxying bytes through the backend.
 */
export async function createPresignedUpload(params: {
  eventId: string;
  contentType: string;
  ext?: string;
}): Promise<{ uploadUrl: string; key: string; publicUrl: string }> {
  const s3 = getClient();
  const key = `albums/${params.eventId}/${randomUUID()}${params.ext ? `.${params.ext}` : ''}`;
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: params.contentType,
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
  return { uploadUrl, key, publicUrl: publicUrl(key) };
}

/** Upload a buffer server-side (e.g. a receipt image from the chat panel). */
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
  return publicUrl(params.key);
}
