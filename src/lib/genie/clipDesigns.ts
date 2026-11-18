import { z } from 'zod';
import type { BoothDesignTemplate, GenieClipDesign } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { CLIP_CANVAS, PhotoSlot, StoredLayout, TEMPLATE_CLIP_FORMAT, type BoomerangFormat } from './schemas';
import { libraryWhere } from './library';
import type { RemoteAsset } from './templateAssets';

export { CLIP_CANVAS };

// Boomerang designs (Genie ClipDesign): the clip plays in the design's one photo slot, with its background colour,
// background image and overlay around it. An event's Boomerang uses a single-photo template from the same library as
// photos (Standard or the account's own), at the template layout's shape: Square, 9:16, 16:9 (Boomerang & GIF only
// sizes) or 4x6 portrait / 6x4 landscape. Events that chose a Boomerang design in 2.105 (source "clip") keep it.

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

// ── Templates ───────────────────────────────────────────────────────────────
// The one-photo layout of a template at this Boomerang shape (its main layout, else its alternate), or null
function printLayout(t: Pick<BoothDesignTemplate, 'layout' | 'alternateLayout'>, format: BoomerangFormat): { layout: StoredLayout; main: boolean } | null {
  const want = TEMPLATE_CLIP_FORMAT.find(x => x.clip === format);
  if (!want) return null;
  for (const [i, raw] of [t.layout, t.alternateLayout].entries()) {
    const l = raw ? StoredLayout.safeParse(raw) : null;
    if (l?.success && l.data.format === want.format && l.data.orientation === want.orientation && l.data.slots.length === 1) return { layout: l.data, main: i === 0 };
  }
  return null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// A single-photo template sent as a ClipDesign: same images, its one slot scaled from the template size to the clip
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

// The event's chosen design, as the bundle sends it, or why it can't be sent. A Standard template unpublished after the
// event chose it stays on the event (like props).
export async function resolveDesign(choice: DesignChoice, tenantId: string, format: BoomerangFormat): Promise<{ design: ClipDesignJson | NonNullable<ReturnType<typeof printClipDesign>> } | { problem: 'deleted' | 'shape' }> {
  if (choice.source === 'clip') {
    const d = await prisma.genieClipDesign.findFirst({ where: { id: choice.id, OR: [{ tenantId: null }, { tenantId }] } });
    if (!d) return { problem: 'deleted' };
    if (d.format !== format || slotProblem(d.slot as unknown as PhotoSlot, format)) return { problem: 'shape' };
    return { design: clipDesignJson(d) };
  }
  const t = await prisma.boothDesignTemplate.findFirst({ where: { id: choice.id, OR: [{ tenantId }, { tenantId: null }], isActive: true } });
  if (!t) return { problem: 'deleted' };
  const d = printClipDesign(t, format);
  return d ? { design: d } : { problem: 'shape' };
}

// Checks a choice when the operator saves: a template in the account's library (Standard published, or its own) with
// one photo at the Boomerang's shape. A Boomerang design chosen before templates (source "clip") may only be kept.
export async function designChoiceError(choice: DesignChoice, tenantId: string, format: BoomerangFormat): Promise<string | null> {
  if (choice.source === 'print') {
    const t = await prisma.boothDesignTemplate.findFirst({ where: { id: choice.id, ...libraryWhere(tenantId) }, select: { id: true } });
    if (!t) return 'That template is no longer available. Choose another.';
  }
  const r = await resolveDesign(choice, tenantId, format);
  if ('problem' in r) return r.problem === 'deleted' ? 'That template is no longer available. Choose another.' : `That template has no single-photo layout at ${CLIP_CANVAS[format].label}. Choose another.`;
  return null;
}
