import { z } from 'zod';
import type { EventGenieTemplate } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { ColorVariant, FontPairing, TextZone } from '@/lib/templates/clientOptions';
import { DEFAULT_TEXT_COLORS, TextAdjust, labelKey, pickByIdOrName, valuesFor, type TextLook } from '@/lib/templates/textLayer';
import { StoredLayout, TEMPLATE_CLIP_FORMAT } from './schemas';
import { textOverlayAsset } from './textRender';
import type { RemoteAsset } from './templateAssets';

// An event's template text: the words (one set per event: the client's design brief, or what the operator typed on
// the event's Genie tab), and each event template's palette and fonts.

// EventGenieTemplate.textOptions: the template's Text fields, palettes and font pairings, copied with it, plus the
// operator's choice for this event
export const EventTextOptions = z.object({
  textZones: z.array(TextZone).max(10).default([]),
  colorVariants: z.array(ColorVariant).max(12).default([]),
  fontPairings: z.array(FontPairing).max(12).default([]),
  paletteId: z.string().max(64).nullable().optional(),
  pairingId: z.string().max(64).nullable().optional(),
  adjust: z.record(TextAdjust).optional(),
});
export type EventTextOptions = z.infer<typeof EventTextOptions>;

// EventGenieSettings.templateText: words the operator typed, by Text field label (labelKey); they replace the brief's
export const TemplateTextAnswers = z.record(z.string().max(500)).refine(v => Object.keys(v).length <= 40, 'Too many text fields');

export const hasText = (l: unknown) => Array.isArray((l as { texts?: unknown[] } | null)?.texts) && (l as { texts: unknown[] }).texts.length > 0;
export const templateHasText = (t: Pick<EventGenieTemplate, 'layout' | 'alternateLayout'>) => hasText(t.layout) || hasText(t.alternateLayout);

// The template's options: its own copy, else (copied before 2.115) the library template's
export async function textOptionsOf(t: Pick<EventGenieTemplate, 'textOptions' | 'libraryTemplateId'>): Promise<EventTextOptions> {
  const own = EventTextOptions.safeParse(t.textOptions);
  if (t.textOptions && own.success) return own.data;
  if (!t.libraryTemplateId) return EventTextOptions.parse({});
  const lib = await prisma.boothDesignTemplate.findUnique({ where: { id: t.libraryTemplateId }, select: { textZones: true, colorVariants: true, fontPairings: true } });
  const parsed = EventTextOptions.safeParse({ textZones: lib?.textZones ?? [], colorVariants: lib?.colorVariants ?? [], fontPairings: lib?.fontPairings ?? [] });
  return parsed.success ? parsed.data : EventTextOptions.parse({});
}

export type BriefText = {
  templateId: string | null; textValues: unknown; textAdjust?: unknown; selectedColorVariantId: string | null; selectedFontPairingId: string | null;
  template: { textZones: unknown; colorVariants: unknown; fontPairings: unknown } | null;
} | null;

export async function eventBrief(eventId: string): Promise<BriefText> {
  return prisma.eventDesignBrief.findUnique({
    where: { eventId },
    select: { templateId: true, textValues: true, textAdjust: true, selectedColorVariantId: true, selectedFontPairingId: true, template: { select: { textZones: true, colorVariants: true, fontPairings: true } } },
  });
}

const list = <T>(schema: z.ZodType<T>, v: unknown): T[] => (Array.isArray(v) ? v : []).flatMap(x => { const p = schema.safeParse(x); return p.success ? [p.data] : []; });

// The event's words by label: the client's brief answers, with what the operator typed on top
export function eventAnswers(brief: BriefText, typed: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const values = (brief?.textValues ?? {}) as Record<string, unknown>;
  for (const z of list(TextZone, brief?.template?.textZones)) {
    const v = values[z.id];
    if (typeof v === 'string' && v.trim()) out[labelKey(z.label)] = v;
  }
  const own = TemplateTextAnswers.safeParse(typed ?? {});
  if (own.success) for (const [k, v] of Object.entries(own.data)) out[labelKey(k)] = v;
  return out;
}

// Palette and fonts: the operator's choice, else the client's brief choice (same template, or the same name), else the first
export function eventLook(opts: EventTextOptions, libraryTemplateId: string | null, brief: BriefText): TextLook & { paletteId: string | null; pairingId: string | null } {
  const sameTemplate = !!brief?.templateId && brief.templateId === libraryTemplateId;
  const briefPalette = list(ColorVariant, brief?.template?.colorVariants).find(p => p.id === brief?.selectedColorVariantId);
  const briefPairing = list(FontPairing, brief?.template?.fontPairings).find(p => p.id === brief?.selectedFontPairingId);
  const palette = pickByIdOrName(opts.colorVariants, opts.paletteId ?? (sameTemplate ? brief?.selectedColorVariantId : null), briefPalette?.name);
  const pairing = pickByIdOrName(opts.fontPairings, opts.pairingId ?? (sameTemplate ? brief?.selectedFontPairingId : null), briefPairing?.name);
  // Outline/shadow/size the client set in their brief (same template: same box ids), under the operator's changes
  const briefAdjust = sameTemplate ? z.record(TextAdjust).safeParse(brief?.textAdjust ?? {}) : null;
  const adjust = { ...(briefAdjust?.success ? briefAdjust.data : {}), ...(opts.adjust ?? {}) };
  return { colors: palette?.colors ?? DEFAULT_TEXT_COLORS, pairing, adjust, paletteId: palette?.id ?? null, pairingId: pairing?.id ?? null };
}

export type TextForBundle = { main?: { overlay?: RemoteAsset; backgroundColor?: string }; alt?: { overlay?: RemoteAsset; backgroundColor?: string } };

// For each event template with text: the overlay with the event's words drawn in, and (when the template has palettes)
// the palette's background colour. Templates showing a client-approved design are left as they are (the design has the
// words). Missing words are left out, never filled with samples.
// Draws (or finds) one text overlay; the cleanup passes one that only notes which files an event needs
export type OverlayFor = (tenantId: string, layout: StoredLayout, values: Record<string, string>, look: TextLook) => Promise<RemoteAsset | null>;

export async function eventTextForBundle(tenantId: string, eventId: string, templates: EventGenieTemplate[], typed: unknown, overlayFor: OverlayFor = textOverlayAsset): Promise<Map<string, TextForBundle>> {
  const out = new Map<string, TextForBundle>();
  const withText = templates.filter(t => templateHasText(t) && !t.designId);
  if (withText.length === 0) return out;
  const brief = await eventBrief(eventId);
  const answers = eventAnswers(brief, typed);
  await Promise.all(withText.map(async t => {
    const opts = await textOptionsOf(t);
    const look = eventLook(opts, t.libraryTemplateId, brief);
    const values = valuesFor(opts.textZones, answers);
    const entry: TextForBundle = {};
    for (const [key, raw] of [['main', t.layout], ['alt', t.alternateLayout]] as const) {
      const l = raw ? StoredLayout.safeParse(raw) : null;
      if (!l?.success || !hasText(l.data)) continue;
      const overlay = await overlayFor(tenantId, l.data, values, look);
      entry[key] = { ...(overlay ? { overlay } : {}), ...(opts.colorVariants.length ? { backgroundColor: look.colors.background.toUpperCase() } : {}) };
    }
    out.set(t.id, entry);
  }));
  return out;
}

// A Boomerang template with text: its overlay with the event's words drawn in (palette and fonts from the client's
// brief when it's the same template or names match, else the template's first), and the palette's background colour
export async function boomerangDesignWithText<D extends { id: string; format: string; overlay?: RemoteAsset; backgroundColor: string }>(
  tenantId: string, eventId: string, boomerang: unknown, design: D | undefined, typed: unknown, overlayFor: OverlayFor = textOverlayAsset,
): Promise<D | undefined> {
  const choice = (boomerang as { design?: { source?: string; id?: string } } | null)?.design;
  if (!design || choice?.source !== 'print') return design;
  const t = await prisma.boothDesignTemplate.findUnique({ where: { id: design.id }, select: { id: true, layout: true, alternateLayout: true, textZones: true, colorVariants: true, fontPairings: true } });
  const want = TEMPLATE_CLIP_FORMAT.find(x => x.clip === design.format);
  const layout = [t?.layout, t?.alternateLayout].map(l => l ? StoredLayout.safeParse(l) : null)
    .find(l => l?.success && l.data.format === want?.format && l.data.orientation === want?.orientation && l.data.slots.length === 1);
  if (!t || !layout?.success || !hasText(layout.data)) return design;
  const opts = EventTextOptions.parse({ textZones: list(TextZone, t.textZones), colorVariants: list(ColorVariant, t.colorVariants), fontPairings: list(FontPairing, t.fontPairings) });
  const brief = await eventBrief(eventId);
  const look = eventLook(opts, t.id, brief);
  const overlay = await overlayFor(tenantId, layout.data, valuesFor(opts.textZones, eventAnswers(brief, typed)), look);
  return {
    ...design,
    ...(overlay ? { overlay } : {}),
    ...(opts.colorVariants.length ? { backgroundColor: look.colors.background.toUpperCase() } : {}),
  };
}
