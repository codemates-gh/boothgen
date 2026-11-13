import { z } from 'zod';

// Zod mirrors of the Genie wire schemas (Genie repo: shared/schemas/*.json)

// 15 MB per photo (full-size iPad shots ~2–4 MB, Canon 18 MP ~6–9 MB)
export const GENIE_MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

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

const UploadContentType = z.enum(['image/jpeg', 'video/mp4']);

export const UploadUrlRequest = z.object({
  clientId: uuid,
  fileName: z.string().min(1).max(200),
  contentType: UploadContentType,
  bytes: z.number().int().min(1).max(GENIE_MAX_UPLOAD_BYTES),
}).strict();

export const GalleryUpload = z.object({
  clientId: uuid,
  session: GuestSession,
  kind: z.enum(['gallery', 'print', 'shot', 'boomerang', 'boomerangPoster']),
  shotIndex: z.number().int().min(0).optional(),
  storageKey: z.string().min(1),
  fileName: z.string(),
  contentType: UploadContentType,
  bytes: z.number().int().min(1).max(GENIE_MAX_UPLOAD_BYTES),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  sha256,
  capturedAt: dateTime,
  durationMs: z.number().int().min(1).optional(),
}).strict()
  // The clip is the only video; photos (and its poster) are JPEGs
  .refine(u => (u.contentType === 'video/mp4') === (u.kind === 'boomerang'), { message: 'video/mp4 is only for kind boomerang, and a boomerang must be video/mp4', path: ['contentType'] })
  .refine(u => u.durationMs === undefined || u.kind === 'boomerang', { message: 'durationMs is only for kind boomerang', path: ['durationMs'] });

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
  type: z.enum(['colorPreset', 'sharpen', 'toneCurve', 'jpegQuality']),
  preset: z.enum(['none', 'blackAndWhite', 'sepia', 'warm']).optional(),
  intensity: z.number().min(0).max(1).optional(),
  radius: z.number().min(0).max(20).optional(),
  curvePoints: z.array(z.object({ input: z.number().min(0).max(1), output: z.number().min(0).max(1) }).strict()).min(2).optional(),
  quality: z.number().min(0.1).max(1).optional(),
}).strict().superRefine((s, ctx) => {
  const need: Record<string, (keyof typeof s)[]> = {
    colorPreset: ['preset', 'intensity'], sharpen: ['radius', 'intensity'], toneCurve: ['curvePoints'], jpegQuality: ['quality'],
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

// CaptureConfig.lookAtCamera: absent = on, "LOOK AT CAMERA", every photo
export const LookAtCamera = z.object({
  enabled: z.boolean(),
  text: z.string().trim().min(1, "The wording can't be empty").max(40, 'Keep the wording to 40 characters'),
  frequency: z.enum(['everyPhoto', 'firstPhoto']),
}).strict();
export type LookAtCamera = z.infer<typeof LookAtCamera>;
export const LOOK_AT_CAMERA_DEFAULT: LookAtCamera = { enabled: true, text: 'LOOK AT CAMERA', frequency: 'everyPhoto' };

// CaptureConfig.boomerang: absent = off
export const BOOMERANG_FORMATS = ['square', 'portrait4x6', 'landscape6x4'] as const;
export const BOOMERANG_ASPECT: Record<(typeof BOOMERANG_FORMATS)[number], { w: number; h: number; example: string }> = {
  square: { w: 1, h: 1, example: '1080×1080' },
  portrait4x6: { w: 2, h: 3, example: '1080×1620' },
  landscape6x4: { w: 3, h: 2, example: '1620×1080' },
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

// LayoutTemplate minus id/version, as stored on EventGenieTemplate / BoothDesignTemplate
export const StoredLayout = z.object({
  format: z.enum(['4x6', '2x6']),
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
