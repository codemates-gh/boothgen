// Gallery upload rules, safe to import in the browser (no database). The numbers are platform settings
// (Super Admin → Settings → Gallery Uploads); uploadRules.ts reads them and enforces them on every upload.
export const MB = 1024 * 1024;
export const GB = 1024 * MB;

export type UploadLimits = {
  photoMaxMb: number;      // JPG, PNG, HEIC, WebP
  motionMaxMb: number;     // GIFs, boomerangs and videos (a ~16-frame boomerang is a few MB as MP4, more as a GIF)
  galleryMaxFiles: number; // per event gallery, all sources together
  galleryMaxGb: number;
  opensDaysBefore: number; // website uploads open this many days before the event date (Genie iPads: any time)
};

export const DEFAULT_UPLOAD_LIMITS: UploadLimits = { photoMaxMb: 25, motionMaxMb: 100, galleryMaxFiles: 2000, galleryMaxGb: 10, opensDaysBefore: 7 };

// SystemSetting keys for each limit
export const UPLOAD_LIMIT_KEYS: Record<keyof UploadLimits, string> = {
  photoMaxMb: 'upload_photo_max_mb',
  motionMaxMb: 'upload_motion_max_mb',
  galleryMaxFiles: 'gallery_max_files',
  galleryMaxGb: 'gallery_max_gb',
  opensDaysBefore: 'upload_opens_days_before',
};

// Website uploads: photos, GIFs and short videos (boomerangs)
export const WEB_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
export const WEB_MOTION_TYPES = ['image/gif', 'video/mp4', 'video/quicktime'];
export const WEB_UPLOAD_TYPES = [...WEB_PHOTO_TYPES, ...WEB_MOTION_TYPES];

export const isMotion = (contentType: string) => contentType === 'image/gif' || contentType.startsWith('video/');

// The size limit for one file of this type, in bytes
export function maxBytesFor(contentType: string, l: UploadLimits): number {
  return (isMotion(contentType) ? l.motionMaxMb : l.photoMaxMb) * MB;
}

export function galleryRules(l: UploadLimits): string[] {
  return [
    `Photos (JPG, PNG, HEIC, WebP) up to ${l.photoMaxMb} MB each.`,
    `GIFs, boomerangs and videos (MP4, MOV) up to ${l.motionMaxMb} MB each.`,
    `Up to ${l.galleryMaxFiles.toLocaleString()} files and ${l.galleryMaxGb} GB per event gallery.`,
    `Uploads from this page open ${l.opensDaysBefore} days before the event date. Genie iPads can upload any time.`,
    'Galleries are for event photos. They are hidden and then deleted automatically after the event.',
  ];
}

export function formatBytes(n: number): string {
  if (n >= GB) return (n / GB).toFixed(1) + ' GB';
  if (n >= MB) return (n / MB).toFixed(1) + ' MB';
  return Math.max(1, Math.round(n / 1024)) + ' KB';
}
