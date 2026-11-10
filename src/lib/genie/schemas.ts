import { z } from 'zod';

// Zod mirrors of the Genie wire schemas (Genie repo: shared/schemas/*.json)

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

export const UploadUrlRequest = z.object({
  clientId: uuid,
  fileName: z.string().min(1).max(200),
  contentType: z.literal('image/jpeg'),
  bytes: z.number().int().min(1).max(52428800),
}).strict();

export const GalleryUpload = z.object({
  clientId: uuid,
  session: GuestSession,
  kind: z.enum(['gallery', 'print', 'shot']),
  shotIndex: z.number().int().min(0).optional(),
  storageKey: z.string().min(1),
  fileName: z.string(),
  contentType: z.literal('image/jpeg'),
  bytes: z.number().int().min(1),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  sha256,
  capturedAt: dateTime,
}).strict();

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
