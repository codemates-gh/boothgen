import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  },
  forcePathStyle: true,
});

const BUCKET = process.env.R2_BUCKET_NAME ?? 'boothgen-gallery';
const PUBLIC_URL = process.env.R2_PUBLIC_URL ?? '';

export async function uploadToR2(key: string, body: Buffer, contentType: string, metadata?: Record<string, string>): Promise<string> {
  await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType, ...(metadata ? { Metadata: metadata } : {}) }));
  return PUBLIC_URL + '/' + key;
}

export async function deleteFromR2(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

// contentLength, when given, is signed into the URL so the PUT must be exactly that size
export async function getPresignedUploadUrl(key: string, contentType: string, contentLength?: number): Promise<string> {
  return getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType, ...(contentLength ? { ContentLength: contentLength } : {}) }),
    { expiresIn: 3600, ...(contentLength ? { signableHeaders: new Set(['content-length']) } : {}) },
  );
}

// Public base URLs files may have been stored under: the current one first, then earlier ones (e.g. the r2.dev
// address used before a custom domain), from R2_LEGACY_PUBLIC_URLS (comma-separated)
export function r2PublicBases(): string[] {
  const legacy = (process.env.R2_LEGACY_PUBLIC_URLS ?? '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
  return [PUBLIC_URL, ...legacy].filter(Boolean);
}

// Object key for a stored public URL, or null when the URL isn't one of this bucket's public addresses
export function r2KeyForPublicUrl(url: string): string | null {
  for (const base of r2PublicBases()) if (url.startsWith(base + '/')) return url.slice(base.length + 1);
  return null;
}

export function r2KeyFromUrl(url: string): string {
  return r2KeyForPublicUrl(url) ?? url.replace(PUBLIC_URL + '/', '');
}

export async function setR2CorsPolicy(allowedOrigins: string[]): Promise<void> {
  await r2.send(new PutBucketCorsCommand({
    Bucket: BUCKET,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: allowedOrigins,
          AllowedMethods: ['GET', 'PUT', 'HEAD'],
          AllowedHeaders: ['*'],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }));
}

// Size (and custom metadata) of an uploaded object, or null when it does not exist
export async function headR2Object(key: string): Promise<{ bytes: number; metadata?: Record<string, string> } | null> {
  try {
    const res = await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return { bytes: res.ContentLength ?? 0, metadata: res.Metadata };
  } catch (err: any) {
    if (err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

export function r2PublicUrl(key: string): string {
  return PUBLIC_URL + '/' + key;
}

// Whole object as a buffer, or null when it does not exist
export async function getR2Object(key: string): Promise<{ body: Buffer; contentType: string | null } | null> {
  try {
    const res = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return { body: Buffer.from(bytes), contentType: res.ContentType ?? null };
  } catch (err: any) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

// Short-lived download link for a private object (e.g. report attachments)
export async function getPresignedDownloadUrl(key: string, expiresIn = 600): Promise<string> {
  return getSignedUrl(r2, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}
