import { z } from 'zod';

// Zod mirrors of the Genie wire schemas (Genie repo: shared/schemas/*.json)

// Per-file caps come from the Genie schemas (below); the site-wide per-type limits (Super Admin → Settings) are
// checked in the upload routes too (src/lib/gallery/uploadRules.ts).

const uuid = z.string().uuid();
const dateTime = z.string().datetime({ offset: true });
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const PairRequest = z.object({
  code: z.string().regex(/^[0-9A-Z]{6}$/),
  deviceName: z.string().max(80),
  deviceModel: z.string().max(80),
  appVersion: z.string().max(40),
}).strict();

export const GuestSession = z.object({
  id: uuid,
  publicToken: z.string().regex(/^[A-Za-z0-9_-]{22,}$/),
  startedAt: dateTime,
}).strict();

const UploadContentType = z.enum(['image/jpeg', 'video/mp4', 'image/gif']);
// Genie's per-file caps (UploadURLRequest / GalleryUpload): 15 MB, except PC booth videos (kind video) up to 50 MB
const MB = 1024 * 1024;
export const GENIE_FILE_MAX_BYTES = 15 * MB;
export const GENIE_VIDEO_MAX_BYTES = 50 * MB;

export const UploadUrlRequest = z.object({
  clientId: uuid,
  fileName: z.string().min(1).max(200),
  contentType: UploadContentType,
  bytes: z.number().int().min(1).max(GENIE_VIDEO_MAX_BYTES),
}).strict()
  // Only an MP4 (a PC booth video) may be over 15 MB
  .refine(u => u.bytes <= GENIE_FILE_MAX_BYTES || u.contentType === 'video/mp4', { message: 'Files are at most 15 MB (videos 50 MB)', path: ['bytes'] });

export const GalleryUpload = z.object({
  clientId: uuid,
  session: GuestSession,
  // galleryOriginal: the gallery design rendered without Glamour Style, for the session page's before/after (2.115.0)
  kind: z.enum(['gallery', 'print', 'shot', 'boomerang', 'boomerangPoster', 'gif', 'video', 'videoPoster', 'galleryOriginal']),
  shotIndex: z.number().int().min(0).optional(),
  storageKey: z.string().min(1),
  fileName: z.string(),
  contentType: UploadContentType,
  bytes: z.number().int().min(1).max(GENIE_VIDEO_MAX_BYTES),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  sha256,
  capturedAt: dateTime,
  durationMs: z.number().int().min(1).optional(),
  // Sharing station (P12): photos from PC booth software, the print box that sent them, and the original file
  source: z.enum(['genie', 'pcBooth']).optional(),
  boothId: z.string().min(1).max(100).optional(),
  boothName: z.string().max(80).optional(),
  sourceSha256: sha256.optional(),
  sourceFileName: z.string().max(255).optional(),
}).strict()
  // MP4 for a boomerang or a PC booth video, GIF for kind gif; everything else (posters too) is a JPEG
  .refine(u => (u.contentType === 'video/mp4') === (u.kind === 'boomerang' || u.kind === 'video'), { message: 'video/mp4 is only for kinds boomerang and video, and they must be video/mp4', path: ['contentType'] })
  .refine(u => (u.contentType === 'image/gif') === (u.kind === 'gif'), { message: 'image/gif is only for kind gif, and a gif must be image/gif', path: ['contentType'] })
  .refine(u => u.durationMs === undefined || u.kind === 'boomerang' || u.kind === 'video', { message: 'durationMs is only for kinds boomerang and video', path: ['durationMs'] })
  .refine(u => u.bytes <= GENIE_FILE_MAX_BYTES || u.kind === 'video', { message: 'Files are at most 15 MB (videos 50 MB)', path: ['bytes'] });

export const ShareJob = z.object({
  id: uuid,
  session: GuestSession,
  channel: z.enum(['sms', 'email']),
  destination: z.string().max(254),
  firstName: z.string().max(60).optional(),
  smsConsentAt: dateTime.optional(),
  createdAt: dateTime,
}).strict();

export const PrintLogEntry = z.object({
  id: uuid,
  prints: z.number().int().min(0),
  periodStart: dateTime,
  periodEnd: dateTime,
}).strict();

export const ProcessingStep = z.object({
  // beautify: the free Beautify filter; glamourStyle: Glamour Style, the paid add-on (2.116.0)
  type: z.enum(['colorPreset', 'sharpen', 'toneCurve', 'jpegQuality', 'beautify', 'glamourStyle']),
  preset: z.enum(['none', 'blackAndWhite', 'sepia', 'warm']).optional(),
  intensity: z.number().min(0).max(1).optional(),
  radius: z.number().min(0).max(20).optional(),
  curvePoints: z.array(z.object({ input: z.number().min(0).max(1), output: z.number().min(0).max(1) }).strict()).min(2).optional(),
  quality: z.number().min(0.1).max(1).optional(),
}).strict().superRefine((s, ctx) => {
  const need: Record<string, (keyof typeof s)[]> = {
    colorPreset: ['preset', 'intensity'], sharpen: ['radius', 'intensity'], toneCurve: ['curvePoints'], jpegQuality: ['quality'], beautify: ['intensity'], glamourStyle: ['intensity'],
  };
  for (const key of need[s.type]) if (s[key] === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${s.type} requires ${key}`, path: [key] });
});

export const Filter = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  steps: z.array(ProcessingStep),
}).strict();

export const RemoteAsset = z.object({
  url: z.string().url(),
  sha256,
  contentType: z.enum(['image/png', 'image/jpeg']),
  bytes: z.number().int().min(1),
}).strict();

export const PhotoSlot = z.object({
  id: z.string().min(1),
  shotIndex: z.number().int().min(0),
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive(),
  rotationDegrees: z.number().min(-180).max(180),
  fit: z.enum(['fill', 'fit']),
}).strict();
export type PhotoSlot = z.infer<typeof PhotoSlot>;

// CaptureConfig.lookAtCamera: absent = on, "LOOK AT CAMERA", every photo
export const LookAtCamera = z.object({
  enabled: z.boolean(),
  text: z.string().trim().min(1, "The wording can't be empty").max(40, 'Keep the wording to 40 characters'),
  frequency: z.enum(['everyPhoto', 'firstPhoto']),
}).strict();
export type LookAtCamera = z.infer<typeof LookAtCamera>;
export const LOOK_AT_CAMERA_DEFAULT: LookAtCamera = { enabled: true, text: 'LOOK AT CAMERA', frequency: 'everyPhoto' };

// CaptureConfig.thankYou: absent = Genie's own screen (5 s, "Thank you!", "Your photos are on their way.")
export const THANK_YOU_DEFAULT = { thankYouSeconds: 5, thankYouTitle: 'Thank you!', thankYouSubtitle: 'Your photos are on their way.' };

// CaptureConfig.boomerang: absent = off
export const BOOMERANG_FORMATS = ['square', 'portrait4x6', 'landscape6x4', 'portrait3x4', 'landscape4x3', 'portrait9x16', 'landscape16x9'] as const;
export type BoomerangFormat = (typeof BOOMERANG_FORMATS)[number];
export const BOOMERANG_ASPECT: Record<BoomerangFormat, { w: number; h: number; example: string; label: string }> = {
  square: { w: 1, h: 1, example: '1080×1080', label: 'square (1:1)' },
  portrait4x6: { w: 2, h: 3, example: '1080×1620', label: '4x6 portrait (2:3)' },
  landscape6x4: { w: 3, h: 2, example: '1620×1080', label: '6x4 landscape (3:2)' },
  portrait3x4: { w: 3, h: 4, example: '1080×1440', label: '3:4 portrait' },
  landscape4x3: { w: 4, h: 3, example: '1440×1080', label: '4:3 landscape' },
  portrait9x16: { w: 9, h: 16, example: '1080×1920', label: '9:16 portrait' },
  landscape16x9: { w: 16, h: 9, example: '1920×1080', label: '16:9 landscape' },
};
// The canvas of each shape (ClipDesign): the clip's size on the iPad (1080 px on the short side). Safe to import in the browser.
export const CLIP_CANVAS: Record<BoomerangFormat, { widthPx: number; heightPx: number; label: string }> = {
  square: { widthPx: 1080, heightPx: 1080, label: 'Square 1:1' },
  portrait3x4: { widthPx: 1080, heightPx: 1440, label: 'Portrait 3:4' },
  landscape4x3: { widthPx: 1440, heightPx: 1080, label: 'Landscape 4:3' },
  portrait9x16: { widthPx: 1080, heightPx: 1920, label: 'Portrait 9:16' },
  landscape16x9: { widthPx: 1920, heightPx: 1080, label: 'Landscape 16:9' },
  portrait4x6: { widthPx: 1080, heightPx: 1620, label: 'Portrait 4x6' },
  landscape6x4: { widthPx: 1620, heightPx: 1080, label: 'Landscape 6x4' },
};

export const BoomerangSettings = z.object({
  enabled: z.boolean(),
  format: z.enum(BOOMERANG_FORMATS),
  frameCount: z.number().int().min(10).max(16),
  playbackSpeed: z.enum(['slow', 'medium', 'fast', 'superFast']),
  reverse: z.boolean(),
  superSpeedCapture: z.boolean(),
  showOverlayOnLiveView: z.boolean(),
  mirrorLiveView: z.boolean(),
}).strict();
export type BoomerangSettings = z.infer<typeof BoomerangSettings>;
export const BOOMERANG_DEFAULT: BoomerangSettings = {
  enabled: false, format: 'square', frameCount: 12, playbackSpeed: 'fast', reverse: true,
  superSpeedCapture: false, showOverlayOnLiveView: true, mirrorLiveView: true,
};

// Template sizes. Print sizes (4x6, 2x6) are offered for photos; Square and 9:16 (portrait 9:16 / landscape 16:9)
// are Boomerang & GIF only: never printed or offered for photos, sent to iPads only as a Boomerang's design.
export const TEMPLATE_FORMATS = ['4x6', '2x6', 'square', '9x16'] as const;
export const PRINT_FORMATS = ['4x6', '2x6'] as const;
export const isClipOnlyFormat = (f: string | null | undefined) => f === 'square' || f === '9x16';
// The Boomerang shape each single-photo template size plays at
export const TEMPLATE_CLIP_FORMAT: { format: string; orientation: string; clip: BoomerangFormat }[] = [
  { format: 'square', orientation: 'portrait', clip: 'square' },
  { format: '9x16', orientation: 'portrait', clip: 'portrait9x16' },
  { format: '9x16', orientation: 'landscape', clip: 'landscape16x9' },
  { format: '4x6', orientation: 'portrait', clip: 'portrait4x6' },
  { format: '4x6', orientation: 'landscape', clip: 'landscape6x4' },
];
// "4×6 landscape", "2×6 strip", "Square", "9:16 portrait", "16:9 landscape"
export function templateSizeLabel(l: { format: string; orientation: string }): string {
  if (l.format === '2x6') return '2×6 strip';
  if (l.format === 'square') return 'Square';
  if (l.format === '9x16') return l.orientation === 'landscape' ? '16:9 landscape' : '9:16 portrait';
  return `${l.format.replace('x', '×')} ${l.orientation}`;
}
export const clipFormatOf = (l: { format: string; orientation: string }): BoomerangFormat | null =>
  TEMPLATE_CLIP_FORMAT.find(t => t.format === l.format && t.orientation === l.orientation)?.clip ?? null;

// LayoutTemplate minus id/version, as stored on EventGenieTemplate / BoothDesignTemplate
export const StoredLayout = z.object({
  format: z.enum(TEMPLATE_FORMATS),
  orientation: z.enum(['portrait', 'landscape']),
  widthPx: z.number().int().min(1),
  heightPx: z.number().int().min(1),
  dpi: z.number().int().min(72),
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  background: RemoteAsset.optional(),
  overlay: RemoteAsset.optional(),
  slots: z.array(PhotoSlot).min(1),
}).strict();
export type StoredLayout = z.infer<typeof StoredLayout>;

export function firstIssue(err: z.ZodError): string {
  const i = err.issues[0];
  return i ? `${i.path.join('.') || 'body'}: ${i.message}` : 'Invalid request';
}

// Geniefied render request (Genie P13, AiRenderRequest.json)
export const AiRenderRequest = z.object({
  sessionId: z.string().uuid(),
  shotIndex: z.number().int().min(0),
  shotStorageKey: z.string().min(1).max(500),
  themeId: z.string().min(1).max(80),
  faceCount: z.number().int().min(0).max(30),
  idempotencyKey: z.string().min(1).max(200),
  consent: z.object({ acceptedAt: z.string().datetime({ offset: true }), textSha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict(),
}).strict();
