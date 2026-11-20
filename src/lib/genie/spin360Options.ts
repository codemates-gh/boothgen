import { z } from 'zod';
import { FONT_OPTIONS } from '@/lib/templates/clientOptions';

// Genie 360 (Genie P15; Genie shared/schemas/Spin360Config.json, EventBundle.spin360): an iPhone on a 360 spinner's
// arm records guests as it turns, edits the clip on the phone and sends it to an iPad Sharing station. A paid
// per-event add-on. Setting it up must be easy: pick a style, a song and a design; everything else is under Advanced
// with good defaults. Safe to import in the browser.

export const SPIN_FORMATS = ['portrait9x16', 'square', 'landscape16x9'] as const;
export type SpinFormat = (typeof SPIN_FORMATS)[number];
export const SPIN_FORMAT_LABELS: Record<SpinFormat, string> = { portrait9x16: 'Portrait', square: 'Square', landscape16x9: 'Landscape' };
export const SPIN_MOUNT_HINT = 'Mount the iPhone upright for portrait, sideways for landscape.';

export const SPIN_VIDEO_SIZES = ['1080p', '720p'] as const;
export const SPIN_VIDEO_SIZE_OPTIONS: { value: (typeof SPIN_VIDEO_SIZES)[number]; label: string; help: string }[] = [
  { value: '1080p', label: '1080p', help: '1080p: best for posting to Instagram and TikTok (≈ 19 MB for 15 s).' },
  { value: '720p', label: '720p', help: '720p: for weak venue internet (about half the size); looks softer once social apps compress it.' },
];

export const STABILIZATION_NOTE = 'Every clip is stabilised: level, steady, guests centred.';

// ── Speed ramps ─────────────────────────────────────────────────────────────
export const DIRECTIONS = ['forward', 'reverse'] as const;
export const TRANSITIONS = ['cut', 'flash', 'blur'] as const;
export const SPEED_MIN = 0.125;
export const SPEED_MAX = 4;
export const CAPTURE_FPS = [120, 240] as const;

// from / to are fractions 0–1 of the recording; speeds 0.125 (8× slow motion) to 4 (4× fast)
export const Segment = z.object({
  from: z.number().min(0).max(1),
  to: z.number().min(0).max(1),
  direction: z.enum(DIRECTIONS),
  speedStart: z.number().min(SPEED_MIN, `Speeds are ${SPEED_MIN}× to ${SPEED_MAX}×`).max(SPEED_MAX, `Speeds are ${SPEED_MIN}× to ${SPEED_MAX}×`),
  speedEnd: z.number().min(SPEED_MIN, `Speeds are ${SPEED_MIN}× to ${SPEED_MAX}×`).max(SPEED_MAX, `Speeds are ${SPEED_MIN}× to ${SPEED_MAX}×`),
  transition: z.enum(TRANSITIONS),
}).strict().refine(s => s.to > s.from, 'Each piece of the spin ends after it starts');
export type Segment = z.infer<typeof Segment>;
export const Segments = z.array(Segment).min(1, 'Add at least one piece of the spin').max(12, 'At most 12 pieces');

// 240 fps only pays off for slow motion slower than 4× (speeds under 0.25)
export const needs240 = (segments: Segment[]) => segments.some(s => Math.min(s.speedStart, s.speedEnd) < 0.25);

const seg = (from: number, to: number, speed: number, transition: Segment['transition'] = 'cut', direction: Segment['direction'] = 'forward', speedEnd = speed): Segment =>
  ({ from, to, direction, speedStart: speed, speedEnd, transition });

// The six Standard styles. Super Admin can edit them (and adds each "Example" video); these are the starting point,
// added to the library the first time it's read.
export const STANDARD_SPIN_STYLES: { id: string; name: string; description: string; captureFps: 120 | 240; segments: Segment[]; defaultEffects: { lightTrails?: boolean; backgroundRemoval?: boolean } }[] = [
  { id: 'classic', name: 'Classic', description: 'Normal, slow motion, normal, quick rewind', captureFps: 120,
    segments: [seg(0, 0.3, 1), seg(0.3, 0.7, 0.25, 'blur', 'forward', 0.25), seg(0.7, 1, 1, 'blur'), seg(0.6, 1, 2, 'flash', 'reverse')], defaultEffects: {} },
  { id: 'slowSmooth', name: 'Slow & Smooth', description: 'Elegant all-slow; weddings', captureFps: 120,
    segments: [seg(0, 1, 0.5, 'cut', 'forward', 0.35)], defaultEffects: {} },
  { id: 'boomerang', name: 'Boomerang', description: 'Forward, rewind, forward', captureFps: 120,
    segments: [seg(0, 0.6, 1), seg(0, 0.6, 1.5, 'cut', 'reverse'), seg(0, 0.6, 1)], defaultEffects: {} },
  { id: 'hype', name: 'Hype', description: 'Fast / slow on the beat; parties', captureFps: 120,
    segments: [seg(0, 0.2, 2), seg(0.2, 0.4, 0.25, 'flash'), seg(0.4, 0.6, 2, 'flash'), seg(0.6, 0.8, 0.25, 'flash'), seg(0.8, 1, 2, 'flash')], defaultEffects: {} },
  { id: 'glow', name: 'Glow', description: 'Classic with neon light trails', captureFps: 120,
    segments: [seg(0, 0.3, 1), seg(0.3, 0.7, 0.25, 'blur'), seg(0.7, 1, 1, 'blur'), seg(0.6, 1, 2, 'flash', 'reverse')], defaultEffects: { lightTrails: true } },
  { id: 'dreamscape', name: 'Dreamscape', description: 'Slow on a backdrop that turns with the spin', captureFps: 120,
    segments: [seg(0, 1, 0.5, 'cut', 'forward', 0.25)], defaultEffects: { backgroundRemoval: true } },
];

// ── Music ───────────────────────────────────────────────────────────────────
export const MUSIC_MAX_BYTES = 10 * 1024 * 1024;
export const MUSIC_MAX_MS = 6 * 60_000;
export const MUSIC_TYPES: Record<string, { contentType: 'audio/mpeg' | 'audio/mp4'; ext: string }> = {
  'audio/mpeg': { contentType: 'audio/mpeg', ext: 'mp3' }, 'audio/mp3': { contentType: 'audio/mpeg', ext: 'mp3' },
  'audio/mp4': { contentType: 'audio/mp4', ext: 'm4a' }, 'audio/x-m4a': { contentType: 'audio/mp4', ext: 'm4a' }, 'audio/m4a': { contentType: 'audio/mp4', ext: 'm4a' },
};
export const MUSIC_RIGHTS_LABEL = "I have the rights to use this song in my clients' videos";
export const MUSIC_SOCIAL_NOTE = 'Instagram and TikTok may mute videos with commercial songs.';
export const MUSIC_LICENSE_REMINDER = 'Make sure the licence covers client / event videos (some plans only cover your own channels).';
export const MUSIC_PREVIEW_MS = 15_000;

// ── Animated overlays ──────────────────────────────────────────────────────
export const OVERLAY_MAX_BYTES = 15 * 1024 * 1024;
export const OVERLAY_TYPES: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/quicktime': 'mov' };

// ── Recording light, title, intro / outro ──────────────────────────────────
export const LIGHT_MODES = ['flashThenSteady', 'flashAtStart', 'flashWhileRecording', 'off'] as const;
export const LIGHT_MODE_OPTIONS: { value: (typeof LIGHT_MODES)[number]; label: string; help: string }[] = [
  { value: 'flashThenSteady', label: 'Flash at start, then steady', help: "Guests see when it's recording; no flicker in the video." },
  { value: 'flashAtStart', label: 'Flash at start only', help: 'A quick flash says "go", then the light is off for the spin.' },
  { value: 'flashWhileRecording', label: 'Flash the whole time', help: 'A strobe look; faces brighten and darken in the video.' },
  { value: 'off', label: 'Off', help: 'No light; use the venue or your own lighting.' },
];
export const BRIGHTNESS = ['low', 'medium', 'high'] as const;
export const TITLE_ANIMATIONS = ['fade', 'slideUp', 'pop'] as const;
export const TITLE_POSITIONS = ['top', 'bottom'] as const;
export const TITLE_FONTS = FONT_OPTIONS.map(f => f.id) as [string, ...string[]];
export const END_KINDS = ['logoCard', 'image', 'video'] as const;
export const END_LIMITS = { logoCard: { min: 1, max: 4, def: 2 }, image: { min: 1, max: 5, def: 3 }, video: { min: 1, max: 5, def: 5 } } as const;
export const END_VIDEO_MAX_BYTES = 30 * 1024 * 1024;

export const TRAIL_LENGTHS = ['short', 'medium', 'long'] as const;
export const TRAIL_SOURCES = ['outline', 'highlights'] as const;

export const defaultSpinConsent = (showInGallery: boolean) =>
  showInGallery ? "Your 360 video will be shared with the host and appear in the event's gallery." : 'Your 360 video will be shared with the host.';

// ── The editor's save shape (EventGenieSettings.spin360) ──────────────────
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Colors are hex values like #D4AF37');
const Media = z.object({ url: z.string().url() }).passthrough();

const End = z.object({
  kind: z.enum(END_KINDS),
  // An image or video uploaded through the attract-screen encoder (JPEG / MP4); logo cards have none
  media: Media.nullable().optional(),
  seconds: z.number().min(1).max(5),
}).strict();
export type SpinEnd = z.infer<typeof End>;

export const Spin360Patch = z.object({
  enabled: z.boolean(),
  styleId: z.string().min(1).max(64),
  format: z.enum(SPIN_FORMATS),
  videoSize: z.enum(SPIN_VIDEO_SIZES),
  videoSeconds: z.number().int().min(8, 'Videos are 8 to 30 seconds').max(30, 'Videos are 8 to 30 seconds'),
  // null = the style's own
  captureFps: z.union([z.literal(120), z.literal(240)]).nullable(),
  segments: Segments.nullable(),
  recording: z.object({
    maxSeconds: z.number().int().min(4, 'Recordings are 4 to 20 seconds').max(20, 'Recordings are 4 to 20 seconds'),
    stopWhenStill: z.boolean(),
    leadInMs: z.number().int().min(0).max(3000),
  }).strict(),
  design: z.object({ source: z.enum(['clip', 'print']), id: z.string().min(1) }).strict().nullable(),
  title: z.object({
    lines: z.array(z.string().trim().min(1).max(40, 'Keep each title line to 40 characters')).min(1).max(2),
    color: hex,
    font: z.enum(TITLE_FONTS),
    animation: z.enum(TITLE_ANIMATIONS),
    position: z.enum(TITLE_POSITIONS),
  }).strict().nullable(),
  intro: End.nullable(),
  outro: End.nullable(),
  recordingLight: z.object({ mode: z.enum(LIGHT_MODES), brightness: z.enum(BRIGHTNESS) }).strict(),
  music: z.object({ trackId: z.string().min(1), startMs: z.number().int().min(0), volume: z.number().min(0).max(1) }).strict().nullable(),
  roomSound: z.object({ enabled: z.boolean(), volume: z.number().min(0).max(1) }).strict(),
  animatedOverlay: z.object({ id: z.string().min(1), loop: z.boolean() }).strict().nullable(),
  backgroundRemoval: z.object({ enabled: z.boolean(), backdropId: z.string().min(1).nullable(), followSpin: z.boolean() }).strict(),
  lightTrails: z.object({
    enabled: z.boolean(),
    colors: z.array(hex).min(1, 'Pick 1 to 3 colours').max(3, 'Pick 1 to 3 colours'),
    length: z.enum(TRAIL_LENGTHS),
    source: z.enum(TRAIL_SOURCES),
  }).strict(),
  upload: z.enum(['everyClip', 'sharedOnly']),
  showInGallery: z.boolean(),
  consentText: z.string().trim().min(1, "The consent text can't be empty").max(300, 'Keep the consent text to 300 characters').nullable(),
}).strict();
export type Spin360Patch = z.infer<typeof Spin360Patch>;
export type StoredSpin360 = Spin360Patch;

export const SPIN360_DEFAULT: Spin360Patch = {
  enabled: false, styleId: 'classic', format: 'portrait9x16', videoSize: '1080p', videoSeconds: 15, captureFps: null, segments: null,
  recording: { maxSeconds: 10, stopWhenStill: true, leadInMs: 500 },
  design: null, title: null, intro: null, outro: null,
  recordingLight: { mode: 'flashThenSteady', brightness: 'medium' },
  music: null, roomSound: { enabled: false, volume: 0.3 }, animatedOverlay: null,
  backgroundRemoval: { enabled: false, backdropId: null, followSpin: true },
  lightTrails: { enabled: false, colors: ['#FF3EA5', '#3EC6FF'], length: 'medium', source: 'outline' },
  upload: 'everyClip', showInGallery: true, consentText: null,
};
