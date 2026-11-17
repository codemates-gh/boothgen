// Gallery upload rules on the server: reads the limits from platform settings and checks every upload
// (website and Genie iPads) against them, so storage holds event photos only.
import { prisma } from '@/lib/prisma/client';
import { DEFAULT_UPLOAD_LIMITS, UPLOAD_LIMIT_KEYS, GB, maxBytesFor, formatBytes, isMotion, type UploadLimits } from './uploadLimits';
export * from './uploadLimits';

export async function getUploadLimits(): Promise<UploadLimits> {
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: Object.values(UPLOAD_LIMIT_KEYS) } } });
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const out = { ...DEFAULT_UPLOAD_LIMITS };
  for (const k of Object.keys(UPLOAD_LIMIT_KEYS) as (keyof UploadLimits)[]) {
    const v = Number(map[UPLOAD_LIMIT_KEYS[k]]);
    // A missing or nonsense value keeps the default (0 is allowed only for the days-before window)
    if (map[UPLOAD_LIMIT_KEYS[k]] !== undefined && Number.isFinite(v) && (v > 0 || (k === 'opensDaysBefore' && v === 0))) out[k] = v;
  }
  return out;
}

// Operator-facing reason a single file is too big, or null
export function fileSizeBlock(fileName: string, contentType: string, bytes: number, l: UploadLimits): string | null {
  const max = maxBytesFor(contentType, l);
  if (bytes <= max) return null;
  return `${fileName} is ${formatBytes(bytes)}. ${isMotion(contentType) ? 'GIFs, boomerangs and videos' : 'Photos'} can be up to ${formatBytes(max)}.`;
}

// The event's date window (website uploads only: pass null for Genie iPads, which capture at the booth and are tested
// ahead of time) and the per-gallery fair-use cap. Returns an operator-facing reason, or null if allowed.
export async function galleryUploadBlock(galleryId: string, eventDate: Date | null, incomingBytes: number, l: UploadLimits): Promise<string | null> {
  if (eventDate) {
    const opens = new Date(eventDate.getTime() - l.opensDaysBefore * 24 * 60 * 60 * 1000);
    if (Date.now() < opens.getTime()) {
      return `Uploads for this event open ${opens.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, ${l.opensDaysBefore} days before the event.`;
    }
  }
  const used = await prisma.galleryAsset.aggregate({ where: { galleryId }, _count: { _all: true }, _sum: { fileSizeBytes: true } });
  if (used._count._all >= l.galleryMaxFiles) return `This gallery has reached ${l.galleryMaxFiles.toLocaleString()} files, the limit per event.`;
  if ((used._sum.fileSizeBytes ?? 0) + incomingBytes > l.galleryMaxGb * GB) return `This gallery has reached ${l.galleryMaxGb} GB, the limit per event.`;
  return null;
}
