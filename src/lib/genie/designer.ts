import { z } from 'zod';
import type { BoothDesignTemplate } from '@prisma/client';
import { StoredLayout, isClipOnlyFormat } from './schemas';
import { artworkFit } from './image';
import { verifyAsset, type RemoteAsset } from './templateAssets';
import { ClientOptions, syncPairings } from '@/lib/templates/clientOptions';

// Frame sizes the designer offers (300 dpi). Square, 9:16 and 16:9 are Boomerang & GIF only (one photo, at the
// iPad clip's size).
export const SIZE_PRESETS = [
  { id: '4x6-landscape', label: '4×6 landscape', format: '4x6', orientation: 'landscape', widthPx: 1800, heightPx: 1200 },
  { id: '4x6-portrait', label: '4×6 portrait', format: '4x6', orientation: 'portrait', widthPx: 1200, heightPx: 1800 },
  { id: '2x6-portrait', label: '2×6 strip', format: '2x6', orientation: 'portrait', widthPx: 600, heightPx: 1800 },
  { id: 'square', label: 'Square', format: 'square', orientation: 'portrait', widthPx: 1080, heightPx: 1080 },
  { id: '9x16-portrait', label: '9:16 portrait', format: '9x16', orientation: 'portrait', widthPx: 1080, heightPx: 1920 },
  { id: '9x16-landscape', label: '16:9 landscape', format: '9x16', orientation: 'landscape', widthPx: 1920, heightPx: 1080 },
] as const;
export const DESIGN_DPI = 300;

export function presetFor(l: { format: string; orientation: string; widthPx: number; heightPx: number }) {
  return SIZE_PRESETS.find(p => p.format === l.format && p.orientation === l.orientation && p.widthPx === l.widthPx && p.heightPx === l.heightPx) ?? null;
}

const AssetRef = z.object({ url: z.string().url(), sha256: z.string(), contentType: z.string(), bytes: z.number() }).passthrough();

export const DesignLayout = StoredLayout.extend({ background: AssetRef.optional(), overlay: AssetRef.optional() })
  .superRefine((l, ctx) => {
    if (!presetFor(l)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose one of the frame sizes: 4×6 landscape, 4×6 portrait, 2×6 strip, square, 9:16 or 16:9', path: ['format'] });
    if (isClipOnlyFormat(l.format) && l.slots.length !== 1) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Square, 9:16 and 16:9 templates are for Boomerang and GIF, so they have one photo frame', path: ['slots'] });
    if (l.dpi !== DESIGN_DPI) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Layouts are 300 dpi', path: ['dpi'] });
    const ids = new Set<string>();
    l.slots.forEach((s, i) => {
      if (ids.has(s.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Each frame needs its own id', path: ['slots', i, 'id'] });
      ids.add(s.id);
      if (s.shotIndex > 9) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Frame ${i + 1}: photo number must be 1–10`, path: ['slots', i, 'shotIndex'] });
      if (s.x + s.width > l.widthPx + 0.5 || s.y + s.height > l.heightPx + 0.5) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Frame ${i + 1} goes past the edge of the layout`, path: ['slots', i] });
      }
    });
  });
export type DesignLayout = z.infer<typeof DesignLayout>;

// The original of a background that was cropped to fit, kept so the designer can reposition it
const BackgroundSource = z.object({
  source: AssetRef,
  focus: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict(),
  croppedUrl: z.string().url(),
}).strict();
export type BackgroundSources = { main?: { source: RemoteAsset; focus: { x: number; y: number }; croppedUrl: string }; alt?: { source: RemoteAsset; focus: { x: number; y: number }; croppedUrl: string } };

export const TemplateBody = z.object({
  name: z.string().trim().min(1, 'Give the template a name').max(80),
  scope: z.enum(['mine', 'standard']).optional(),
  isPublished: z.boolean().optional(), // Standard only
  layout: DesignLayout,
  alternateLayout: DesignLayout.nullable().optional(),
  thumbnail: AssetRef.nullable().optional(),
  backgroundSources: z.object({ main: BackgroundSource.nullable().optional(), alt: BackgroundSource.nullable().optional() }).strict().nullable().optional(),
  copyFrom: z.string().optional(), // duplicating: the source template's images are reused as they are
  offerToClients: z.boolean().optional(), // My templates: shown in this account's clients' design brief picker
}).merge(ClientOptions).strict().superRefine((b, ctx) => {
  if (b.alternateLayout && (b.alternateLayout.orientation === b.layout.orientation || b.alternateLayout.format !== b.layout.format)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'The alternate layout must be the same size in the other orientation', path: ['alternateLayout'] });
  }
});
export type TemplateBody = z.infer<typeof TemplateBody>;

const same = (a?: { url: string; sha256: string } | null, b?: { url: string; sha256: string } | null) => !!a && !!b && a.url === b.url && a.sha256 === b.sha256;

// Re-reads every new image from storage so the saved RemoteAssets are exact; images already saved on this
// template are kept as they are.
async function checkAsset(ref: { url: string; sha256: string } | undefined, previous: RemoteAsset[], prefixes: string[], canvas?: { widthPx: number; heightPx: number }, warnings?: string[]) {
  if (!ref) return { asset: undefined };
  const prev = previous.find(p => same(p, ref));
  if (prev) return { asset: prev };
  const v = await verifyAsset(ref.url, prefixes);
  if ('error' in v) return { error: v.error };
  if (canvas) {
    const fit = artworkFit(v.info, canvas);
    if (!fit.ok) return { error: fit.error };
    if (fit.warning) warnings?.push(fit.warning);
  }
  return { asset: v.asset, hasAlpha: v.info.hasAlpha };
}

function previousAssets(t: Pick<BoothDesignTemplate, 'layout' | 'alternateLayout' | 'genieThumbnail'> & { backgroundSources?: unknown } | null): RemoteAsset[] {
  if (!t) return [];
  const out: RemoteAsset[] = [];
  for (const l of [t.layout, t.alternateLayout] as any[]) {
    if (l?.background) out.push(l.background);
    if (l?.overlay) out.push(l.overlay);
  }
  if (t.genieThumbnail) out.push(t.genieThumbnail as any);
  for (const s of Object.values((t.backgroundSources as Record<string, any>) ?? {})) if (s?.source) out.push(s.source);
  return out;
}

type AssetSource = (Pick<BoothDesignTemplate, 'layout' | 'alternateLayout' | 'genieThumbnail'> & { backgroundSources?: unknown }) | null;

export async function prepareTemplate(body: TemplateBody, existing: AssetSource, prefixes: string[], source: AssetSource = null) {
  const previous = [...previousAssets(existing), ...previousAssets(source)];
  const warnings: string[] = [];
  const layouts: (StoredLayout | null)[] = [];
  for (const l of [body.layout, body.alternateLayout ?? null]) {
    if (!l) { layouts.push(null); continue; }
    const out: StoredLayout = { ...l, background: undefined, overlay: undefined };
    for (const kind of ['background', 'overlay'] as const) {
      const r = await checkAsset(l[kind], previous, prefixes, l, warnings);
      if ('error' in r) return { error: `${kind === 'background' ? 'Background' : 'Overlay'}: ${r.error}` };
      if (kind === 'overlay' && r.asset && r.asset.contentType !== 'image/png') return { error: 'The overlay must be a PNG with transparent windows over the photos.' };
      if (kind === 'overlay' && 'hasAlpha' in r && !r.hasAlpha) return { error: "Overlay: this PNG has no transparent areas, so it would cover the photos. Use it as the background instead." };
      if (r.asset) out[kind] = r.asset as StoredLayout['background'];
      else delete out[kind];
    }
    layouts.push(StoredLayout.parse(out));
  }
  const thumb = await checkAsset(body.thumbnail ?? undefined, previous, prefixes);
  if ('error' in thumb) return { error: 'Thumbnail: ' + thumb.error };
  // Originals kept only while the layout still uses the background cropped from them
  const backgroundSources: BackgroundSources = {};
  for (const [key, l] of [['main', layouts[0]], ['alt', layouts[1]]] as const) {
    const s = body.backgroundSources?.[key];
    if (!s || !l?.background || l.background.url !== s.croppedUrl) continue;
    const r = await checkAsset(s.source, previous, prefixes);
    if ('error' in r) return { error: 'Background original: ' + r.error };
    if (r.asset) backgroundSources[key] = { source: r.asset, focus: s.focus, croppedUrl: s.croppedUrl };
  }
  return { layout: layouts[0]!, alternateLayout: layouts[1], thumbnail: thumb.asset ?? null, backgroundSources: Object.keys(backgroundSources).length ? backgroundSources : null, warnings };
}

// Client options to save: what the client may customize in their design brief. Omitted fields stay as they are.
export function clientOptionsData(b: TemplateBody) {
  const zones = b.textZones;
  return {
    ...(b.description !== undefined ? { description: b.description || null } : {}),
    ...(zones !== undefined ? { textZones: zones } : {}),
    ...(b.colorVariants !== undefined ? { colorVariants: b.colorVariants } : {}),
    ...(b.fontPairings !== undefined ? { fontPairings: syncPairings(b.fontPairings, zones ?? []) } : {}),
  };
}
