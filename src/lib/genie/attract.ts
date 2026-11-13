import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { headR2Object, r2PublicUrl } from '@/lib/storage/r2';
import { keyForUrl } from './templateAssets';

// Attract screen (EventBundle.attract): a still image or looping video the iPad shows while it waits for guests.
// Uploads are shrunk once on the server (attractEncode.ts) and the result is stored; saving never re-encodes, so the
// file and its sha256 stay the same and iPads don't download it again.

export const ATTRACT_RETURN_DEFAULT = 30;
export const ATTRACT_MAX_SECONDS = 30;
export const ATTRACT_IMAGE_SOURCE_MAX_BYTES = 20 * 1024 * 1024;
export const ATTRACT_VIDEO_SOURCE_MAX_BYTES = 200 * 1024 * 1024;
export const ATTRACT_VIDEO_MAX_BYTES = 15 * 1024 * 1024;

export const ATTRACT_SOURCE_TYPES = {
  'image/jpeg': { kind: 'image', ext: 'jpg' },
  'image/png': { kind: 'image', ext: 'png' },
  'video/mp4': { kind: 'video', ext: 'mp4' },
  'video/quicktime': { kind: 'video', ext: 'mov' },
} as const;
export type AttractSourceType = keyof typeof ATTRACT_SOURCE_TYPES;

// What's stored on GenieDefaults.attract / EventGenieSettings.attract
export type AttractMedia = {
  media: { url: string; sha256: string; contentType: 'image/jpeg' | 'video/mp4'; bytes: number };
  kind: 'image' | 'video';
  width: number;
  height: number;
  durationMs?: number;
};

// Sources wait under uploads/ until they're encoded; the encoded files sit directly in the tenant's folder
export const attractPrefix = (tenantId: string) => `genie-attract/${tenantId}/`;
export const attractUploadPrefix = (tenantId: string) => `genie-attract/${tenantId}/uploads/`;

// Custom metadata written with the encoded file, so a save can trust it without reading or re-encoding the file
export function attractMetadata(m: AttractMedia): Record<string, string> {
  return {
    sha256: m.media.sha256, kind: m.kind, width: String(m.width), height: String(m.height),
    ...(m.durationMs !== undefined ? { 'duration-ms': String(m.durationMs) } : {}),
  };
}

export function storedAttract(v: unknown): AttractMedia | null {
  const a = v as AttractMedia | null;
  return a && typeof a === 'object' && a.media?.url && a.media.sha256 ? a : null;
}

// An encoded file this account made, read back from its stored metadata
export async function attractFromUrl(url: string, tenantId: string): Promise<AttractMedia | { error: string }> {
  const key = keyForUrl(url);
  if (!key || key.includes('..') || !key.startsWith(attractPrefix(tenantId)) || key.startsWith(attractUploadPrefix(tenantId))) {
    return { error: "That attract file isn't in your account's storage. Upload it again." };
  }
  const head = await headR2Object(key);
  const m = head?.metadata ?? {};
  const kind = m.kind === 'video' ? 'video' : m.kind === 'image' ? 'image' : null;
  if (!head || !kind || !/^[0-9a-f]{64}$/.test(m.sha256 ?? '')) return { error: "That attract file can't be found. Upload it again." };
  const durationMs = m['duration-ms'] ? Number(m['duration-ms']) : undefined;
  return {
    media: { url: r2PublicUrl(key), sha256: m.sha256, contentType: kind === 'video' ? 'video/mp4' : 'image/jpeg', bytes: head.bytes },
    kind, width: Number(m.width) || 0, height: Number(m.height) || 0, ...(durationMs !== undefined ? { durationMs } : {}),
  };
}

// Save body (event page and account defaults). mediaUrl: an encoded file from /api/genie-attract/encode, null = none.
export const AttractPatch = z.object({
  mediaUrl: z.string().url().nullable(),
  returnAfterSeconds: z.number().int().min(5, 'Return to the attract screen after at least 5 seconds').max(600, 'Return to the attract screen within 600 seconds'),
}).strict();
export type AttractPatch = z.infer<typeof AttractPatch>;

export async function attractData(patch: AttractPatch, current: unknown, tenantId: string): Promise<{ data: { attract: AttractMedia | typeof Prisma.DbNull; attractReturnAfterSeconds: number } } | { error: string }> {
  const prev = storedAttract(current);
  let attract: AttractMedia | null = null;
  if (patch.mediaUrl && patch.mediaUrl === prev?.media.url) attract = prev;
  else if (patch.mediaUrl) {
    const a = await attractFromUrl(patch.mediaUrl, tenantId);
    if ('error' in a) return a;
    attract = a;
  }
  return { data: { attract: attract ?? Prisma.DbNull, attractReturnAfterSeconds: patch.returnAfterSeconds } };
}

export function attractView(attract: unknown, returnAfterSeconds: number) {
  const a = storedAttract(attract);
  return {
    media: a ? { url: a.media.url, kind: a.kind, width: a.width, height: a.height, bytes: a.media.bytes, durationMs: a.durationMs ?? null } : null,
    returnAfterSeconds,
  };
}

// EventBundle.attract; absent when there's no media, so the bundle (and its version) only change with the media or delay
export function bundleAttract(attract: unknown, returnAfterSeconds: number) {
  const a = storedAttract(attract);
  return a ? { media: a.media, returnAfterSeconds } : undefined;
}

// Encoded files no defaults row and no event uses any more are deleted (events copy the defaults' file, so they share it)
export async function deleteUnusedAttractMedia(urls: (string | undefined | null)[]): Promise<number> {
  const { prisma } = await import('@/lib/prisma/client');
  const { deleteFromR2 } = await import('@/lib/storage/r2');
  let deleted = 0;
  for (const url of Array.from(new Set(urls.filter((u): u is string => !!u)))) {
    const key = keyForUrl(url);
    if (!key || !key.startsWith('genie-attract/')) continue;
    const pattern = '%' + url.replace(/[\\%_]/g, m => '\\' + m) + '%';
    const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT (
        (SELECT count(*) FROM genie_defaults WHERE attract::text LIKE ${pattern})
        + (SELECT count(*) FROM event_genie_settings WHERE attract::text LIKE ${pattern})
      ) AS n`;
    if (Number(n) > 0) continue;
    try { await deleteFromR2(key); deleted++; } catch (err) { console.error('[genie] attract cleanup failed', key, err); }
  }
  return deleted;
}
