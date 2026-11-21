import { z } from 'zod';
import { BOOMERANG_FORMATS } from './schemas';

// Video Booth (Genie P14; Genie shared/schemas/VideoBoothConfig.json): guests record a short video message to a prompt
// the operator chose. Included in every Genie event. Safe to import in the browser.

export const VIDEO_SIZES = ['720p', '540p', '480p'] as const;
export type VideoSize = (typeof VIDEO_SIZES)[number];

// The help text for each size (G, 2026-11-20)
export const VIDEO_SIZE_OPTIONS: { value: VideoSize; label: string; help: string }[] = [
  { value: '720p', label: '720p (about 15.7 MB a minute)', help: 'Best for most events. Sharp on phones and laptops.' },
  { value: '540p', label: '540p (about 9.7 MB a minute)', help: 'For weak venue internet or a phone hotspot. A third smaller, still sharp on a phone.' },
  { value: '480p', label: '480p (about 6.5 MB a minute)', help: 'For very poor internet, or when the message matters more than the picture. Less than half the size; soft on big screens.' },
];
export const WHY_NOT_1080P = 'Why not 1080p? Guests watch on phones, where 720p looks the same, and 1080p doubles the upload.';

export const VIDEO_OFFERS = ['alongsidePhotos', 'videoOnly'] as const;
export type VideoBoothOffer = (typeof VIDEO_OFFERS)[number];

export const MAX_PROMPTS = 8;
export const PROPS_ON_VIDEO_HINT = 'Guests can wear a prop in their video. The video without the prop stays on the booth iPad for 30 days.';
export const PROMPT_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Starter prompts to pick from in the editor
export const STARTER_PROMPTS: { group: string; prompts: string[] }[] = [
  { group: 'Weddings', prompts: ['Leave a message for the couple', 'Best advice for the newlyweds', 'Share your favorite memory of the couple', 'Wish the couple a happy life together'] },
  { group: 'Birthdays', prompts: ['Say happy birthday!', 'Share a favorite memory with the birthday star', 'What do you wish for them this year?'] },
  { group: 'Corporate', prompts: ['What do you love about working here?', 'Give a shout-out to a teammate', 'What are you most proud of this year?'] },
  { group: 'Any event', prompts: ['Confess something!', 'Leave a message for the host', 'Tell us how you are feeling tonight'] },
];

// The consent line before recording, when the operator leaves it on BoothGen's wording
export const defaultVideoConsent = (showInGallery: boolean) =>
  showInGallery ? "Your video will be shared with the host and may appear in the event's gallery." : 'Your video will be shared with the host.';

const Prompt = z.object({
  id: z.string().regex(PROMPT_ID, 'Prompt ids use letters, numbers, - and _'),
  text: z.string().trim().min(1, "A prompt can't be empty").max(120, 'Keep each prompt to 120 characters'),
}).strict();

const DesignChoice = z.object({ source: z.enum(['clip', 'print']), id: z.string().min(1) }).strict();

// The event's (or account defaults') Video Booth section as the editor saves it
export const VideoBoothPatch = z.object({
  enabled: z.boolean(),
  offer: z.enum(VIDEO_OFFERS),
  prompts: z.array(Prompt).min(1, 'Add at least one prompt').max(MAX_PROMPTS, `At most ${MAX_PROMPTS} prompts`)
    .refine(ps => new Set(ps.map(p => p.id)).size === ps.length, 'Each prompt needs its own id'),
  maxSeconds: z.number().int().min(10, 'Videos are 10 to 120 seconds long').max(120, 'Videos are 10 to 120 seconds long'),
  retakes: z.number().int().min(0, 'Re-records are 0 to 5').max(5, 'Re-records are 0 to 5'),
  videoSize: z.enum(VIDEO_SIZES),
  format: z.enum(BOOMERANG_FORMATS),
  design: DesignChoice.nullable(),
  // null = BoothGen's default wording
  consentText: z.string().trim().min(1, "The consent text can't be empty").max(300, 'Keep the consent text to 300 characters').nullable(),
  showInGallery: z.boolean(),
  // Props on video (P14.1): guests can wear one of the event's props while recording (sent only while props are on)
  props: z.boolean().default(false),
}).strict();
export type VideoBoothPatch = z.infer<typeof VideoBoothPatch>;
// Stored on EventGenieSettings.videoBooth and GenieDefaults.videoBooth
export type StoredVideoBooth = Omit<VideoBoothPatch, 'design'> & { design?: z.infer<typeof DesignChoice> };

export const VIDEO_BOOTH_DEFAULT: VideoBoothPatch = {
  enabled: false, offer: 'alongsidePhotos', prompts: [{ id: 'message', text: 'Leave a message for the host' }],
  maxSeconds: 30, retakes: 2, videoSize: '720p', format: 'square', design: null, consentText: null, showInGallery: false, props: false,
};

// A new prompt id the operator never sees
export const newPromptId = () => 'p' + Math.random().toString(36).slice(2, 10);
