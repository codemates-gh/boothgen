import { z } from 'zod';
import { Prisma, type BoothDesignTemplate, type GenieClipDesign } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { BOOMERANG_FORMATS, CLIP_CANVAS, PhotoSlot, StoredLayout, type BoomerangFormat } from './schemas';

export { CLIP_CANVAS };
import { verifyAsset, type RemoteAsset } from './templateAssets';

// Boomerang designs (Genie ClipDesign): the clip plays in the design's one photo slot, with its background colour,
// background image and overlay around it. Sources: Standard (BoothGen), My Boomerang designs (designer or an uploaded
// PNG frame) and, for the 4x6 shapes, the account's single-photo print designs converted on the fly.

export const MIN_SLOT_PX = 16;

// Where the clip goes must lie inside the canvas and be at least 16 px each way (else the iPad plays it plain)
export function slotProblem(slot: { x: number; y: number; width: number; height: number }, format: BoomerangFormat): string | null {
  const c = CLIP_CANVAS[format];
  if (slot.width < MIN_SLOT_PX || slot.height < MIN_SLOT_PX) return `The photo area must be at least ${MIN_SLOT_PX} px each way.`;
  if (slot.x < 0 || slot.y < 0 || slot.x + slot.width > c.widthPx + 0.5 || slot.y + slot.height > c.heightPx + 0.5) {
    return `The photo area goes past the edge of the ${c.widthPx}×${c.heightPx} design.`;
  }
  return null;
}

const AssetRef = z.object({ url: z.string().url(), sha256: z.string(), contentType: z.string(), bytes: z.number() }).passthrough();

export const ClipDesignBody = z.object({
  name: z.string().trim().min(1, 'Give the design a name').max(80),
  scope: z.enum(['mine', 'standard']).optional(),
  format: z.enum(BOOMERANG_FORMATS),
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Background colour must be like #FFFFFF').transform(s => s.toUpperCase()),
  background: AssetRef.nullable().optional(),
  overlay: AssetRef.nullable().optional(),
  thumbnail: AssetRef.nullable().optional(),
  slot: PhotoSlot,
  source: z.enum(['designer', 'upload']).optional(),
  isActive: z.boolean().optional(), // Standard only: shown to operators
}).strict().superRefine((b, ctx) => {
  const p = slotProblem(b.slot, b.format);
  if (p) ctx.addIssue({ code: z.ZodIssueCode.custom, message: p, path: ['slot'] });
  if (b.source === 'upload' && !b.overlay) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Upload the frame PNG', path: ['overlay'] });
});
export type ClipDesignBody = z.infer<typeof ClipDesignBody>;

const same = (a?: { url: string; sha256: string } | null, b?: { url: string; sha256: string } | null) => !!a && !!b && a.url === b.url && a.sha256 === b.sha256;
const shapeOk = (w: number, h: number, format: BoomerangFormat) => {
  const c = CLIP_CANVAS[format];
  return Math.abs((w / h) / (c.widthPx / c.heightPx) - 1) <= 0.02;
};

export function clipAssets(d: Pick<GenieClipDesign, 'background' | 'overlay' | 'thumbnail'> | null): RemoteAsset[] {
  if (!d) return [];
  return [d.background, d.overlay, d.thumbnail].filter(Boolean) as unknown as RemoteAsset[];
}

// Re-reads every new image from storage so the saved RemoteAssets are exact (sha256, bytes); images already on the
// design are kept as they are. Background and overlay must have the design's shape; the overlay is a PNG with a
// transparent window.
export async function prepareClipDesign(body: ClipDesignBody, existing: GenieClipDesign | null, prefixes: string[]) {
  const previous = clipAssets(existing);
  const out: { background?: RemoteAsset; overlay?: RemoteAsset; thumbnail?: RemoteAsset } = {};
  for (const kind of ['background', 'overlay', 'thumbnail'] as const) {
    const ref = body[kind];
    if (!ref) continue;
    const prev = previous.find(p => same(p, ref));
    if (prev) { out[kind] = prev; continue; }
    const v = await verifyAsset(ref.url, prefixes);
    const label = kind === 'background' ? 'Background' : kind === 'overlay' ? 'Overlay' : 'Thumbnail';
    if ('error' in v) return { error: `${label}: ${v.error}` };
    if (kind !== 'thumbnail' && !shapeOk(v.info.width, v.info.height, body.format)) {
      const c = CLIP_CANVAS[body.format];
      return { error: `${label}: the image is ${v.info.width}×${v.info.height}, but a ${c.label} design needs that shape, e.g. ${c.widthPx}×${c.heightPx}.` };
    }
    if (kind === 'overlay' && v.info.contentType !== 'image/png') return { error: 'The overlay must be a PNG with a transparent window where the Boomerang plays.' };
    if (kind === 'overlay' && !v.info.hasAlpha) return { error: 'Overlay: this PNG has no transparent area, so it would cover the Boomerang. Use a PNG that is transparent where the clip shows through.' };
    out[kind] = v.asset;
  }
  return { assets: out };
}

const json = (v: unknown) => (v ? v as Prisma.InputJsonValue : Prisma.DbNull);
export function clipDesignData(body: ClipDesignBody, assets: { background?: RemoteAsset; overlay?: RemoteAsset; thumbnail?: RemoteAsset }) {
  return {
    name: body.name, format: body.format, backgroundColor: body.backgroundColor,
    background: json(assets.background), overlay: json(assets.overlay), thumbnail: json(assets.thumbnail),
    slot: { ...body.slot, shotIndex: 0 },
  };
}

// The design as the editor and the designer see it
export function clipDesignView(d: GenieClipDesign) {
  return {
    id: d.id, name: d.name, scope: d.tenantId ? 'mine' as const : 'standard' as const, source: d.source,
    format: d.format as BoomerangFormat, backgroundColor: d.backgroundColor,
    background: d.background as RemoteAsset | null, overlay: d.overlay as RemoteAsset | null, thumbnail: d.thumbnail as RemoteAsset | null,
    slot: d.slot as unknown as PhotoSlot, version: d.version, isActive: d.isActive,
  };
}

// ── Print designs (4x6 only) ────────────────────────────────────────────────
export const PRINT_FORMAT: Partial<Record<BoomerangFormat, { format: '4x6'; orientation: 'portrait' | 'landscape' }>> = {
  portrait4x6: { format: '4x6', orientation: 'portrait' },
  landscape6x4: { format: '4x6', orientation: 'landscape' },
};

// The one-photo layout of a print design at this 4x6 shape (its main layout, else its alternate), or null
function printLayout(t: Pick<BoothDesignTemplate, 'layout' | 'alternateLayout'>, format: BoomerangFormat): { layout: StoredLayout; main: boolean } | null {
  const want = PRINT_FORMAT[format];
  if (!want) return null;
  for (const [i, raw] of [t.layout, t.alternateLayout].entries()) {
    const l = raw ? StoredLayout.safeParse(raw) : null;
    if (l?.success && l.data.format === want.format && l.data.orientation === want.orientation && l.data.slots.length === 1) return { layout: l.data, main: i === 0 };
  }
  return null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// A single-photo print design sent as a ClipDesign: same images, its one slot scaled from the print size to the clip
// canvas. Its version follows the template's last edit (seconds), so any change raises it.
export function printClipDesign(t: Pick<BoothDesignTemplate, 'id' | 'name' | 'layout' | 'alternateLayout' | 'genieThumbnail' | 'updatedAt'>, format: BoomerangFormat) {
  const found = printLayout(t, format);
  if (!found) return null;
  const l = found.layout;
  const c = CLIP_CANVAS[format], sx = c.widthPx / l.widthPx, sy = c.heightPx / l.heightPx, s = l.slots[0];
  const slot = { id: s.id, shotIndex: 0, x: r2(s.x * sx), y: r2(s.y * sy), width: r2(s.width * sx), height: r2(s.height * sy), rotationDegrees: s.rotationDegrees, fit: s.fit };
  if (slotProblem(slot, format)) return null;
  return {
    id: t.id, name: t.name.slice(0, 80), version: Math.max(1, Math.floor(t.updatedAt.getTime() / 1000)), format,
    backgroundColor: l.backgroundColor.toUpperCase(),
    ...(l.background ? { background: l.background } : {}),
    ...(l.overlay ? { overlay: l.overlay } : {}),
    // The designer's thumbnail shows the main layout only
    ...(t.genieThumbnail && found.main ? { thumbnail: t.genieThumbnail as unknown as RemoteAsset } : {}),
    slot,
  };
}

// ── Bundle ──────────────────────────────────────────────────────────────────
// ClipDesign as the bundle sends it: optional images left out, never null
export function clipDesignJson(d: GenieClipDesign) {
  const s = d.slot as unknown as PhotoSlot;
  return {
    id: d.id, name: d.name, version: d.version, format: d.format, backgroundColor: d.backgroundColor,
    ...(d.background ? { background: d.background as unknown as RemoteAsset } : {}),
    ...(d.overlay ? { overlay: d.overlay as unknown as RemoteAsset } : {}),
    ...(d.thumbnail ? { thumbnail: d.thumbnail as unknown as RemoteAsset } : {}),
    slot: { id: s.id, shotIndex: 0, x: s.x, y: s.y, width: s.width, height: s.height, rotationDegrees: s.rotationDegrees, fit: s.fit },
  };
}
export type ClipDesignJson = ReturnType<typeof clipDesignJson>;

// What an event chose (EventGenieSettings.boomerang.design)
export const DesignChoice = z.object({ source: z.enum(['clip', 'print']), id: z.string().min(1) }).strict();
export type DesignChoice = z.infer<typeof DesignChoice>;

// Designs an account may choose: switched-on Standard designs and its own
const choosableWhere = (tenantId: string): Prisma.GenieClipDesignWhereInput => ({ OR: [{ tenantId: null, isActive: true }, { tenantId }] });

// The event's chosen design, as the bundle sends it, or why it can't be sent. A Standard design switched off after the
// event chose it stays on the event (like props).
export async function resolveDesign(choice: DesignChoice, tenantId: string, format: BoomerangFormat): Promise<{ design: ClipDesignJson | NonNullable<ReturnType<typeof printClipDesign>> } | { problem: 'deleted' | 'shape' }> {
  if (choice.source === 'clip') {
    const d = await prisma.genieClipDesign.findFirst({ where: { id: choice.id, OR: [{ tenantId: null }, { tenantId }] } });
    if (!d) return { problem: 'deleted' };
    if (d.format !== format || slotProblem(d.slot as unknown as PhotoSlot, format)) return { problem: 'shape' };
    return { design: clipDesignJson(d) };
  }
  // The account's own print design or a Standard one (one unpublished after the event chose it stays, like props)
  const t = await prisma.boothDesignTemplate.findFirst({ where: { id: choice.id, OR: [{ tenantId }, { tenantId: null }], isActive: true } });
  if (!t) return { problem: 'deleted' };
  const d = printClipDesign(t, format);
  return d ? { design: d } : { problem: 'shape' };
}

// Checks a new choice when the operator saves: it must exist for this account and be at the chosen shape
export async function designChoiceError(choice: DesignChoice, tenantId: string, format: BoomerangFormat): Promise<string | null> {
  if (choice.source === 'clip') {
    const d = await prisma.genieClipDesign.findFirst({ where: { id: choice.id, ...choosableWhere(tenantId) } });
    if (!d) return 'That Boomerang design is no longer available. Choose another.';
    if (d.format !== format) return `That design is ${CLIP_CANVAS[d.format as BoomerangFormat]?.label ?? d.format}, but the Boomerang is ${CLIP_CANVAS[format].label}. Choose a design at that shape.`;
    return null;
  }
  const t = await prisma.boothDesignTemplate.findFirst({ where: { id: choice.id, isActive: true, OR: [{ tenantId }, { tenantId: null, isPublished: true }] }, select: { id: true } });
  if (!t) return 'That print design is no longer available. Choose another.';
  const r = await resolveDesign(choice, tenantId, format);
  if ('problem' in r) return r.problem === 'deleted' ? 'That print design is no longer available. Choose another.' : 'That print design has no single photo at this shape. Choose another.';
  return null;
}

// Single-photo 4x6 print designs as Frame picker rows, at each 4x6 shape they have one photo for
function printRows(templates: BoothDesignTemplate[]) {
  return templates.flatMap(t => (['portrait4x6', 'landscape6x4'] as const).flatMap(format => {
    const d = printClipDesign(t, format);
    return d ? [{ id: t.id, name: t.name, format, backgroundColor: d.backgroundColor, background: d.background ?? null, overlay: d.overlay ?? null, thumbnail: d.thumbnail ?? null, slot: d.slot }] : [];
  }));
}
const printWhere = { isActive: true, format: '4x6', layout: { not: Prisma.AnyNull } } satisfies Prisma.BoothDesignTemplateWhereInput;
const printOrder = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];

// Published Standard Design Templates with a single photo: offered as Standard Boomerang designs at Portrait 4x6 and
// Landscape 6x4 (managed in Super Admin → Design Templates)
export async function standardPrintDesigns() {
  return printRows(await prisma.boothDesignTemplate.findMany({ where: { ...printWhere, tenantId: null, isPublished: true }, orderBy: printOrder }));
}

// Everything the Frame picker offers: Standard designs (Boomerang designs and single-photo Design Templates), My
// Boomerang designs, and the account's single-photo print designs
export async function designLibrary(tenantId: string) {
  const [clips, prints, standardPrint] = await Promise.all([
    prisma.genieClipDesign.findMany({ where: choosableWhere(tenantId), orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    prisma.boothDesignTemplate.findMany({ where: { ...printWhere, tenantId }, orderBy: printOrder }),
    standardPrintDesigns(),
  ]);
  const views = clips.map(clipDesignView);
  return { standard: views.filter(v => v.scope === 'standard'), mine: views.filter(v => v.scope === 'mine'), print: printRows(prints), standardPrint };
}
