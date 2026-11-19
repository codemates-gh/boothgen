import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Event, EventGenieSettings, EventGenieTemplate, GenieMessagingConfig } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { emailConfigured, platformDomainError, smsConfigured, type MessagingRoutes } from './messaging';
import { effectiveLockedAt, isValidTimeZone } from './bundle';
import { BOOMERANG_ASPECT, BOOMERANG_DEFAULT, BoomerangSettings, LOOK_AT_CAMERA_DEFAULT, LookAtCamera, StoredLayout } from './schemas';
import { verifyAsset } from './templateAssets';
import { boomerangDesignProblem, storedBoomerang, type StoredBoomerang } from './boomerang';
import { DesignChoice, designChoiceError } from './clipDesigns';
import { AttractPatch, attractView } from './attract';
import { CountdownSoundPatch, countdownSoundView } from './countdownSound';
import { PropsPatch, storedPropIds } from './props';
import { BackdropsPatch, backdropsView } from './backdrops';
import { PosesPatch, posesView } from './poses';
import { SharingStationPatch, sharingStationData, sharingStationView } from './sharingStation';

// ── Lock ────────────────────────────────────────────────────────────────────
// Locks when the event starts (see effectiveLockedAt in bundle.ts); iPads ignore newer bundle versions after that,
// so BoothGen stops accepting changes too.
export function lockedError() {
  return NextResponse.json({ error: "The event has started, so its Genie setup is locked. iPads keep the version they have.", code: 'event_locked' }, { status: 409 });
}

// Event plus its Genie settings, scoped to the tenant
export async function findAdminEvent(tenantId: string, eventId: string) {
  return prisma.event.findFirst({ where: { id: eventId, tenantId }, include: { genieSettings: true, client: { select: { email: true } } } });
}

export function isLocked(event: Pick<Event, 'eventDate' | 'startTime'> & { genieSettings: EventGenieSettings | null }): boolean {
  return !!event.genieSettings && effectiveLockedAt(event, event.genieSettings) !== null;
}

// ── Filters ─────────────────────────────────────────────────────────────────
// Filters the operator can offer guests (FilterConfig.filters entries)
export const FILTER_CATALOG = [
  { id: 'original', name: 'Original', steps: [] },
  { id: 'warm', name: 'Warm', steps: [{ type: 'colorPreset', preset: 'warm', intensity: 0.5 }] },
  { id: 'sepia', name: 'Sepia', steps: [{ type: 'colorPreset', preset: 'sepia', intensity: 0.8 }] },
  { id: 'bw', name: 'Black & White', steps: [{ type: 'colorPreset', preset: 'blackAndWhite', intensity: 1 }] },
  // Beautify: free skin smoothing, a standard filter (Genie 0.5.0 build 15+; older builds ignore the step). Its id stays
  // 'glamour' (events saved it under the old name "Beautify (Glamour)")
  { id: 'glamour', name: 'Beautify', steps: [{ type: 'beautify', intensity: 0.7 }] },
  // Glamour Style: the exclusive filter from our partner Glamour Style Photo Booth. A paid add-on
  // (src/lib/genie/addOns.ts): offering it adds it to the event's bill
  { id: 'glamourStyle', name: 'Glamour Style', steps: [{ type: 'glamourStyle', intensity: 0.7 }] },
] as const;

type StoredFilter = { id: string; name: string; steps: unknown[] };

// Strength saved on the event for Beautify ('glamour') or Glamour Style ('glamourStyle'); 0.7 until set
export function glamourIntensity(current: unknown, id: 'glamour' | 'glamourStyle' = 'glamour'): number {
  const f = (Array.isArray(current) ? current as StoredFilter[] : []).find(x => x?.id === id);
  const n = (f?.steps?.[0] as { intensity?: unknown } | undefined)?.intensity;
  return typeof n === 'number' && n >= 0.3 && n <= 1 ? n : 0.7;
}

// Catalog filters plus any custom ones already on the event
export function availableFilters(current: unknown): StoredFilter[] {
  const list: StoredFilter[] = FILTER_CATALOG.map(f => ({ id: f.id, name: f.name, steps: [...f.steps] }));
  for (const f of (Array.isArray(current) ? current : []) as StoredFilter[]) {
    if (f && typeof f.id === 'string' && !list.some(c => c.id === f.id)) list.push(f);
  }
  return list;
}

// ── Merge fields ────────────────────────────────────────────────────────────
export const MERGE_FIELDS = ['firstName', 'eventName', 'link', 'expiresOn'] as const;

function unknownMergeField(text: string): string | null {
  for (const m of Array.from(text.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g))) {
    if (!(MERGE_FIELDS as readonly string[]).includes(m[1])) return m[0];
  }
  return null;
}

const message = (max: number, label: string) => z.string().trim().min(1, `${label} can't be empty`).max(max, `${label} is too long (max ${max} characters)`)
  .refine(v => !unknownMergeField(v), v => ({ message: `${label}: ${unknownMergeField(v)} isn't a merge field. Use ${MERGE_FIELDS.map(f => `{{${f}}}`).join(', ')}.` }));

// ── Settings patch ──────────────────────────────────────────────────────────
const int = (min: number, max: number) => z.number().int().min(min).max(max);

export const SettingsPatch = z.object({
  enabled: z.boolean(),
  timeZone: z.string().refine(isValidTimeZone, 'Unknown time zone'),
  capture: z.object({
    shotCount: int(1, 10),
    initialCountdownSeconds: int(0, 10),
    betweenShotsCountdownSeconds: int(0, 10),
    showPerShotPreview: z.boolean(),
    allowPerShotRetake: z.boolean(),
    perShotPreviewSeconds: int(1, 10),
    allowReviewRetake: z.boolean(),
    retakesPerShot: int(0, 3),
    idleTimeoutSeconds: int(10, 600),
    // Optional so older pages that don't send it keep the saved value
    boomerangEdgeLight: z.boolean().optional(),
    // Thank-you screen; optional so older pages keep the saved values
    thankYouSeconds: int(1, 30).optional(),
    thankYouTitle: z.string().trim().min(1, "The thank-you title can't be empty").max(40, 'Keep the thank-you title to 40 characters').optional(),
    thankYouSubtitle: z.string().trim().max(100, 'Keep the thank-you line to 100 characters').optional(),
    // Saved by countdownSoundData (it checks an uploaded file); optional so older pages keep the saved value
    countdownSound: CountdownSoundPatch.optional(),
  }).strict(),
  filters: z.object({
    guestFiltersEnabled: z.boolean(),
    defaultFilterId: z.string().min(1),
    filterIds: z.array(z.string().min(1)).min(1, 'Choose at least one filter'),
    // Beautify strength; absent keeps the saved one
    glamourIntensity: z.number().min(0.3).max(1).optional(),
    // Glamour Style strength; absent keeps the saved one
    glamourStyleIntensity: z.number().min(0.3).max(1).optional(),
  }).strict(),
  sharing: z.object({
    smsEnabled: z.boolean(),
    emailEnabled: z.boolean(),
    qrEnabled: z.boolean(),
    guestLinkScope: z.enum(['own', 'all']),
    smsBody: message(480, 'Text message').refine(v => /\{\{\s*link\s*\}\}/.test(v), 'Text message must include {{link}}'),
    emailSubject: message(200, 'Email subject'),
    emailBody: message(5000, 'Email message'),
    smsConsentText: z.string().trim().min(1, "Consent text can't be empty").max(500),
  }).strict(),
  printing: z.object({
    enabled: z.boolean(),
    maxCopies: int(1, 10),
    defaultCopies: int(1, 10),
    // Copies match the number of people (PrintingConfig.copiesMatchPeople); absent keeps the saved value
    copiesMatchPeople: z.boolean().optional(),
  }).strict().refine(p => p.defaultCopies <= p.maxCopies, { message: 'Default copies must not exceed max copies', path: ['defaultCopies'] }),
  // Per event only (no account defaults)
  lookAtCamera: LookAtCamera,
  // Photo sessions' live view (per event only)
  liveView: z.object({ mirrorLiveView: z.boolean(), showDesignWhilePosing: z.boolean() }).strict(),
  // overlayUrl: a PNG uploaded through /api/genie-templates/assets (before Boomerang designs; new frames are designs);
  // null removes the overlay, absent keeps it. design: the chosen Boomerang design; null = none, absent keeps it.
  boomerang: BoomerangSettings.extend({ overlayUrl: z.string().url().nullable().optional(), design: DesignChoice.nullable().optional() }).strict(),
  // Attract screen (account default with per-event override); saved by attractData
  attract: AttractPatch,
  // Virtual props (per event only); saved by propsData
  props: PropsPatch,
  // Virtual backdrop (per event only); saved by backdropsData
  backgroundRemoval: BackdropsPatch,
  // Pose ideas (account default with per-event override); saved by posesData
  poses: PosesPatch,
  // Sharing station for PC booth software: its guest-grid and upload options (per event only)
  sharingStation: SharingStationPatch,
  // Sections to put back on the account defaults (they follow default changes again)
  reset: z.array(z.enum(['timeZone', 'capture', 'sharing', 'printing', 'attract', 'poses'])).min(1),
}).partial().strict();

export type SettingsPatch = z.infer<typeof SettingsPatch>;

export function settingsUpdateData(patch: SettingsPatch, current: EventGenieSettings): { data: Record<string, unknown> } | { error: string } {
  const data: Record<string, unknown> = {};
  if (patch.enabled !== undefined) data.enabled = patch.enabled;
  if (patch.timeZone !== undefined) data.timeZone = patch.timeZone;
  if (patch.capture) { const { countdownSound: _cs, ...capture } = patch.capture; Object.assign(data, capture); }
  if (patch.filters) {
    const available = availableFilters(current.filters);
    const chosen = patch.filters.filterIds.map(id => available.find(f => f.id === id));
    if (chosen.some(f => !f)) return { error: 'Unknown filter' };
    if (!patch.filters.filterIds.includes(patch.filters.defaultFilterId)) return { error: 'The default filter must be one of the offered filters' };
    // Beautify and Glamour Style at the chosen strength (rounded to 0.05), under their current names
    const round = (n: number) => Math.round(n * 20) / 20;
    const beautify = round(patch.filters.glamourIntensity ?? glamourIntensity(current.filters));
    const glamourStyle = round(patch.filters.glamourStyleIntensity ?? glamourIntensity(current.filters, 'glamourStyle'));
    data.filters = chosen.map(f => f!.id === 'glamour' ? { ...f!, name: 'Beautify', steps: [{ type: 'beautify', intensity: beautify }] }
      : f!.id === 'glamourStyle' ? { ...f!, name: 'Glamour Style', steps: [{ type: 'glamourStyle', intensity: glamourStyle }] } : f);
    data.defaultFilterId = patch.filters.defaultFilterId;
    data.guestFiltersEnabled = patch.filters.guestFiltersEnabled;
  }
  if (patch.sharing) Object.assign(data, patch.sharing);
  if (patch.lookAtCamera) data.lookAtCamera = patch.lookAtCamera;
  if (patch.liveView) Object.assign(data, patch.liveView);
  if (patch.sharingStation) Object.assign(data, sharingStationData(patch.sharingStation));
  if (patch.printing) {
    data.printingEnabled = patch.printing.enabled;
    data.printMaxCopies = patch.printing.maxCopies;
    data.printDefaultCopies = patch.printing.defaultCopies;
    if (patch.printing.copiesMatchPeople !== undefined) data.printCopiesMatchPeople = patch.printing.copiesMatchPeople;
  }
  return { data };
}

// ── Boomerang ───────────────────────────────────────────────────────────────
function overlayShapeError(size: { width: number; height: number }, format: BoomerangSettings['format']): string | null {
  const a = BOOMERANG_ASPECT[format];
  const ratio = (size.width / size.height) / (a.w / a.h);
  if (Math.abs(ratio - 1) <= 0.02) return null;
  return `The overlay is ${size.width}×${size.height}, but a ${a.label} boomerang needs that shape, e.g. ${a.example}.`;
}

// The boomerang settings to save: checks a new overlay (a PNG with transparency, in the format's shape) and that a
// kept overlay still fits when the format changes
export async function boomerangData(patch: NonNullable<SettingsPatch['boomerang']>, current: unknown, tenantId: string): Promise<{ value: StoredBoomerang } | { error: string; path?: string }> {
  const { overlayUrl, design: designPatch, ...settings } = patch;
  const prev = storedBoomerang(current);
  let overlay = prev?.overlay, overlaySize = prev?.overlaySize;
  if (overlayUrl === null) { overlay = undefined; overlaySize = undefined; }
  else if (overlayUrl && overlayUrl !== prev?.overlay?.url) {
    const v = await verifyAsset(overlayUrl, [`genie-templates/${tenantId}/`]);
    if ('error' in v) return { error: v.error };
    if (v.info.contentType !== 'image/png') return { error: 'The boomerang overlay must be a PNG.' };
    if (!v.info.hasAlpha) return { error: 'The overlay has no transparent area, so it would cover the whole clip. Use a PNG that is transparent where the clip shows through.' };
    overlay = v.asset; overlaySize = { width: v.info.width, height: v.info.height };
  }
  // A design and a plain overlay don't go together: choosing a design replaces the overlay
  const design = designPatch === undefined ? prev?.design : designPatch ?? undefined;
  if (designPatch) { overlay = undefined; overlaySize = undefined; }
  // A new choice (or a kept one when the shape changes) must be available and at the Boomerang's shape
  if (design && (designPatch || settings.format !== prev?.format)) {
    const err = await designChoiceError(design, tenantId, settings.format);
    if (err) return { error: err, path: 'boomerang.design' };
  }
  if (overlaySize) {
    const err = overlayShapeError(overlaySize, settings.format);
    if (err) return { error: err };
  }
  return { value: { ...settings, ...(overlay ? { overlay, overlaySize } : {}), ...(design ? { design } : {}) } };
}

// The chosen Boomerang design is checked when the editor loads: deleted, or no longer at the Boomerang's shape
export async function withBoomerangDesignProblem<T extends { boomerang: object }>(view: T, s: EventGenieSettings): Promise<T> {
  const problem = await boomerangDesignProblem(s.boomerang, s.tenantId);
  return { ...view, boomerang: { ...view.boomerang, designProblem: problem } };
}

// ── Views ───────────────────────────────────────────────────────────────────
export function settingsView(s: EventGenieSettings) {
  return {
    enabled: s.enabled,
    timeZone: s.timeZone,
    bundleVersion: s.bundleVersion,
    maxDevices: s.maxDevices,
    capture: {
      shotCount: s.shotCount,
      initialCountdownSeconds: s.initialCountdownSeconds,
      betweenShotsCountdownSeconds: s.betweenShotsCountdownSeconds,
      showPerShotPreview: s.showPerShotPreview,
      allowPerShotRetake: s.allowPerShotRetake,
      perShotPreviewSeconds: s.perShotPreviewSeconds,
      allowReviewRetake: s.allowReviewRetake,
      retakesPerShot: s.retakesPerShot,
      idleTimeoutSeconds: s.idleTimeoutSeconds,
      boomerangEdgeLight: s.boomerangEdgeLight,
      thankYouSeconds: s.thankYouSeconds, thankYouTitle: s.thankYouTitle, thankYouSubtitle: s.thankYouSubtitle,
      countdownSound: countdownSoundView(s.countdownSound),
    },
    lookAtCamera: (s.lookAtCamera as LookAtCamera | null) ?? LOOK_AT_CAMERA_DEFAULT,
    liveView: { mirrorLiveView: s.mirrorLiveView, showDesignWhilePosing: s.showDesignWhilePosing },
    boomerang: (() => {
      const b = storedBoomerang(s.boomerang);
      const { overlay, overlaySize, design, ...settings }: StoredBoomerang = b ?? BOOMERANG_DEFAULT;
      return {
        ...BOOMERANG_DEFAULT, ...settings,
        overlay: overlay ? { url: overlay.url, width: overlaySize?.width ?? null, height: overlaySize?.height ?? null } : null,
        design: design ?? null, designProblem: null as 'deleted' | 'shape' | null,
      };
    })(),
    filters: {
      guestFiltersEnabled: s.guestFiltersEnabled,
      defaultFilterId: s.defaultFilterId,
      filterIds: (Array.isArray(s.filters) ? s.filters as StoredFilter[] : []).map(f => f.id),
      available: availableFilters(s.filters).map(f => ({ id: f.id, name: f.name })),
      glamourIntensity: glamourIntensity(s.filters),
      glamourStyleIntensity: glamourIntensity(s.filters, 'glamourStyle'),
    },
    sharing: {
      smsEnabled: s.smsEnabled,
      emailEnabled: s.emailEnabled,
      qrEnabled: s.qrEnabled,
      guestLinkScope: s.guestLinkScope as 'own' | 'all',
      smsBody: s.smsBody,
      emailSubject: s.emailSubject,
      emailBody: s.emailBody,
      smsConsentText: s.smsConsentText,
    },
    printing: { enabled: s.printingEnabled, maxCopies: s.printMaxCopies, defaultCopies: s.printDefaultCopies, copiesMatchPeople: s.printCopiesMatchPeople },
    attract: attractView(s.attract, s.attractReturnAfterSeconds),
    props: { enabled: s.propsEnabled, propIds: storedPropIds(s.propIds) },
    backgroundRemoval: backdropsView(s),
    poses: posesView(s),
    sharingStation: sharingStationView(s),
    // Which sections were customized for this event (false = follows the account's Genie defaults)
    custom: { timeZone: s.customTimeZone, capture: s.customCapture, sharing: s.customSharing, printing: s.customPrinting, attract: s.customAttract, poses: s.customPoses },
  };
}

// Distinct photo numbers the layout uses
export function frameCount(layout: unknown): number {
  const parsed = StoredLayout.safeParse(layout);
  if (!parsed.success) return 0;
  return new Set(parsed.data.slots.map(s => s.shotIndex)).size;
}

export function templateView(t: EventGenieTemplate) {
  const layout = t.layout as unknown as StoredLayout;
  return {
    id: t.id,
    name: t.name,
    sortOrder: t.sortOrder,
    version: t.version,
    libraryTemplateId: t.libraryTemplateId,
    designId: t.designId,
    layout,
    alternateLayout: (t.alternateLayout as unknown as StoredLayout | null) ?? null,
    frameCount: frameCount(t.layout),
    maxShotIndex: Math.max(...layout.slots.map(s => s.shotIndex)),
  };
}

// What the tenant's providers mean for this event's sharing toggles. Nothing to warn about when BoothGen sends.
export function providerWarnings(c: GenieMessagingConfig | null, sharing: { smsEnabled: boolean; emailEnabled: boolean }, routes?: MessagingRoutes) {
  const out: { channel: 'sms' | 'email'; message: string }[] = [];
  if (sharing.smsEnabled && routes?.sms !== 'boothgen') {
    if (!smsConfigured(c)) out.push({ channel: 'sms', message: "Texts are hidden on the iPad until you set up texting in Genie → Sharing." });
    else if (c!.smsTestError) out.push({ channel: 'sms', message: 'The last test text failed. Send a new test in Genie → Sharing.' });
    else if (!c!.smsTestedAt) out.push({ channel: 'sms', message: "Twilio hasn't been tested yet. Send a test in Genie → Sharing." });
  }
  if (sharing.emailEnabled && routes?.email !== 'boothgen') {
    const domainError = c?.emailFromAddress ? platformDomainError(c.emailFromAddress) : null;
    if (domainError) out.push({ channel: 'email', message: domainError + ' Emails are hidden on the iPad until you change it in Genie → Sharing.' });
    else if (!emailConfigured(c)) out.push({ channel: 'email', message: 'Emails are hidden on the iPad until you set up email in Genie → Sharing.' });
    else if (c!.emailTestError) out.push({ channel: 'email', message: 'The last test email failed. Send a new test in Genie → Sharing.' });
    else if (!c!.emailTestedAt) out.push({ channel: 'email', message: "Email hasn't been tested yet. Send a test in Genie → Sharing." });
  }
  return out;
}
