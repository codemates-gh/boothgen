import { Prisma } from '@prisma/client';
import { designChoiceError, resolveDesign } from './clipDesigns';
import { boomerangDesignWithText } from './eventText';
import { CLIP_CANVAS } from './schemas';
import { VIDEO_BOOTH_DEFAULT, VideoBoothPatch, defaultVideoConsent, type StoredVideoBooth } from './videoBoothOptions';

// Video Booth (Genie P14): the event's settings (EventGenieSettings.videoBooth, following the account's Genie defaults
// until changed) and EventBundle.videoBooth (Genie shared/schemas/VideoBoothConfig.json).

export function storedVideoBooth(v: unknown): StoredVideoBooth | null {
  if (!v || typeof v !== 'object') return null;
  const p = VideoBoothPatch.safeParse({ ...VIDEO_BOOTH_DEFAULT, ...(v as object), design: (v as { design?: unknown }).design ?? null });
  if (!p.success) return null;
  const { design, ...rest } = p.data;
  return { ...rest, ...(design ? { design } : {}) };
}

// The section as the editor shows it; designProblem is filled in by withVideoBoothDesignProblem
export function videoBoothView(v: unknown) {
  const s = storedVideoBooth(v);
  const { design, ...rest } = s ?? { ...VIDEO_BOOTH_DEFAULT, design: undefined };
  return { ...rest, design: design ?? null, designProblem: null as 'deleted' | 'shape' | null };
}

export async function videoBoothDesignProblem(v: unknown, tenantId: string): Promise<'deleted' | 'shape' | null> {
  const s = storedVideoBooth(v);
  if (!s?.design) return null;
  const r = await resolveDesign(s.design, tenantId, s.format);
  return 'problem' in r ? r.problem : null;
}

// Checks a save: a new template choice (or a kept one when the shape changes) must be in the library at that shape
export async function videoBoothData(patch: VideoBoothPatch, current: unknown, tenantId: string): Promise<{ value: Prisma.InputJsonValue } | { error: string; path: string }> {
  const prev = storedVideoBooth(current);
  const changed = patch.design && (patch.design.source !== prev?.design?.source || patch.design.id !== prev?.design?.id || patch.format !== prev?.format);
  if (patch.design && changed) {
    const err = await designChoiceError(patch.design, tenantId, patch.format);
    if (err) return { error: err.replace('Boomerang', 'video'), path: 'videoBooth.design' };
  }
  const { design, ...rest } = patch;
  const value: StoredVideoBooth = { ...rest, prompts: rest.prompts.map(p => ({ id: p.id, text: p.text.trim() })), ...(design ? { design } : {}) };
  return { value: value as unknown as Prisma.InputJsonValue };
}

export const videoConsentFor = (s: Pick<StoredVideoBooth, 'consentText' | 'showInGallery'>) =>
  (s.consentText?.trim() || defaultVideoConsent(s.showInGallery)).slice(0, 300);

// EventBundle.videoBooth: only while Video Booth is on. The template is sent as a ClipDesign at the video's shape, with
// the event's words drawn in; one that's gone or no longer at that shape is left out (the plain picture).
// propsOn: the event's props are on (with at least one prop); props on video is sent only then
// photosOn: the event's Photo booth switch; off makes the iPads offer video only
export async function bundleVideoBooth(v: unknown, tenantId: string, eventId: string, templateText: unknown, propsOn = false, photosOn = true) {
  const s = storedVideoBooth(v);
  if (!s?.enabled) return undefined;
  let design;
  if (s.design) {
    const r = await resolveDesign(s.design, tenantId, s.format);
    if ('design' in r) design = await boomerangDesignWithText(tenantId, eventId, s, r.design, templateText);
  }
  return {
    enabled: true,
    offer: photosOn ? s.offer : 'videoOnly' as const,
    prompts: s.prompts.map(p => ({ id: p.id, text: p.text })),
    maxSeconds: s.maxSeconds,
    retakes: s.retakes,
    videoSize: s.videoSize,
    format: s.format,
    ...(design && design.format === s.format ? { design } : {}),
    consentText: videoConsentFor(s),
    showInGallery: s.showInGallery,
    ...(s.props && propsOn ? { props: true } : {}),
  };
}

export const videoShapeLabel = (f: StoredVideoBooth['format']) => CLIP_CANVAS[f].label;

// ── Gallery ───────────────────────────────────────────────────────────────────
// A Video Booth message: a video from a Genie session (a PC booth video has source pcBooth)
export const VIDEO_MESSAGE = { genieKind: 'video', OR: [{ source: null }, { source: { not: 'pcBooth' } }] } satisfies Prisma.GalleryAssetWhereInput;
export const isVideoMessage = (a: { genieKind?: string | null; source?: string | null }) => a.genieKind === 'video' && a.source !== 'pcBooth';

// Public gallery filter: Video Booth messages only when the event shows them, never hidden ones
export function publicGalleryFilter(showVideos: boolean): Prisma.GalleryAssetWhereInput {
  // Spelled out positively: genieKind and source are often null, and SQL's NOT of a null comparison drops the row
  return showVideos ? { hiddenAt: null } : { hiddenAt: null, AND: [{ OR: [{ genieKind: null }, { genieKind: { not: 'video' } }, { source: 'pcBooth' }] }] };
}
export const showsVideosInGallery = (v: unknown) => !!storedVideoBooth(v)?.showInGallery;
