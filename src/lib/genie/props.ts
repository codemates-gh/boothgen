import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';
import type { GenieProp } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { deleteFromR2, headR2Object, r2PublicUrl, uploadToR2 } from '@/lib/storage/r2';
import { readImageInfo } from './image';
import { keyForUrl, type RemoteAsset } from './templateAssets';

// Virtual props (Genie P7). The iPad does the face tracking, placement and drawing; BoothGen keeps the library
// (Standard props managed in Super Admin, My props per account), each event's choice, and delivers the PNGs.
// Wire shapes: PropsConfig.json / PropAsset.json in the Genie repo's shared/schemas.

export const PROP_ANCHORS = ['eyes', 'nose', 'mouth', 'chin'] as const;
export type PropAnchor = (typeof PROP_ANCHORS)[number];
export const PROP_EYE_DISTANCE = 300;
export const PROP_MAX_BYTES = 2 * 1024 * 1024;
export const PROP_MAX_SIDE = 4096;
// More than this and guests hold up the booth choosing (a recommendation, never a block)
export const PROPS_RECOMMENDED_MAX = 10;

// Reference face in prop units, eye midpoint at (0, 0), eyes 300 apart (the starter library's model: the head top is
// about 1.6 eye distances above the eyes). Shared with the placement editor.
export const REFERENCE_FACE = {
  leftEye: { x: -150, y: 0 }, rightEye: { x: 150, y: 0 },
  nose: { x: 0, y: 130 }, mouth: { x: 0, y: 250 }, chin: { x: 0, y: 420 },
  top: -480,
} as const;

const Placement = z.object({ category: z.string().min(1).max(60), subcategory: z.string().min(1).max(60) }).strict();

// Create / edit body (Super Admin for Standard, the operator for My props)
export const PropBody = z.object({
  name: z.string().trim().min(1, 'Give the prop a name').max(80, 'Keep the name to 80 characters'),
  category: z.string().min(1, 'Choose a category').max(60),
  subcategory: z.string().min(1, 'Choose a sub-category').max(60),
  alsoIn: z.array(Placement).max(10).optional(),
  imageUrl: z.string().url(),
  size: z.object({ width: z.number().positive().max(100_000), height: z.number().positive().max(100_000) }).strict(),
  anchor: z.enum(PROP_ANCHORS),
  anchorPoint: z.object({ x: z.number().min(-100_000).max(100_000), y: z.number().min(-100_000).max(100_000) }).strict(),
  eyeDistance: z.number().positive().max(100_000).optional(),
}).strict();
export type PropBody = z.infer<typeof PropBody>;

export type PropScope = 'standard' | 'mine';

export function propPrefix(scope: PropScope, tenantId: string | null): string {
  if (scope === 'mine' && !tenantId) throw new Error('My props need an account');
  return scope === 'standard' ? 'genie-props/standard/' : `genie-props/${tenantId}/`;
}

// ── Images ──────────────────────────────────────────────────────────────────
// Checks an uploaded prop PNG and stores it content-addressed (same file, same URL), so iPads cache it across events
export async function storePropImage(buf: Buffer, scope: PropScope, tenantId: string | null): Promise<{ image: RemoteAsset; width: number; height: number } | { error: string }> {
  if (buf.length > PROP_MAX_BYTES) return { error: 'Props must be 2 MB or smaller. Export the PNG smaller (2048 px on the long side is plenty).' };
  const info = readImageInfo(buf);
  if (!info || info.contentType !== 'image/png') return { error: 'Use a PNG with a transparent background.' };
  if (!info.hasAlpha) return { error: "That PNG has no transparent area, so it would cover the guest's face with a box. Use a PNG with a transparent background." };
  if (Math.max(info.width, info.height) > PROP_MAX_SIDE) return { error: `That PNG is ${info.width}×${info.height}. Export it at 2048 px or smaller on the long side.` };
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const key = propPrefix(scope, tenantId) + sha256 + '.png';
  if (!(await headR2Object(key))) await uploadToR2(key, buf, 'image/png');
  return { image: { url: r2PublicUrl(key), sha256, contentType: 'image/png', bytes: buf.length }, width: info.width, height: info.height };
}

// The stored image a save points at: must be one of this scope's uploads (props may reuse Standard art)
export async function propImageFromUrl(url: string, scope: PropScope, tenantId: string | null): Promise<RemoteAsset | { error: string }> {
  const key = keyForUrl(url);
  const prefixes = scope === 'standard' ? [propPrefix('standard', null)] : [propPrefix('mine', tenantId), propPrefix('standard', null)];
  const m = key?.match(/^genie-props\/[^/]+\/([0-9a-f]{64})\.png$/);
  if (!key || !m || !prefixes.some(p => key.startsWith(p))) return { error: "That prop image isn't in your account's storage. Upload it again." };
  const head = await headR2Object(key);
  if (!head) return { error: "That prop image can't be found. Upload it again." };
  return { url: r2PublicUrl(key), sha256: m[1], contentType: 'image/png', bytes: head.bytes };
}

// Prop images no prop uses any more are deleted (props share content-addressed files)
export async function deleteUnusedPropImages(urls: (string | null | undefined)[]): Promise<number> {
  let deleted = 0;
  for (const key of Array.from(new Set(urls.map(u => (u ? keyForUrl(u) : null)).filter((k): k is string => !!k)))) {
    if (!key.startsWith('genie-props/')) continue;
    const pattern = '%' + key.replace(/[\\%_]/g, c => '\\' + c) + '%';
    const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM genie_props WHERE image::text LIKE ${pattern}`;
    if (Number(n) > 0) continue;
    try { await deleteFromR2(key); deleted++; } catch (err) { console.error('[genie] prop image cleanup failed', key, err); }
  }
  return deleted;
}

// Daily: uploads that were never saved as a prop (older than a day)
export async function sweepAbandonedPropImages(now = new Date()): Promise<number> {
  const { listR2Objects } = await import('@/lib/storage/r2');
  const old = (await listR2Objects('genie-props/')).filter(o => now.getTime() - o.lastModified.getTime() >= 24 * 3600_000);
  if (!old.length) return 0;
  const used = new Set((await prisma.genieProp.findMany({ select: { image: true } })).map(p => keyForUrl((p.image as RemoteAsset).url)));
  let deleted = 0;
  for (const o of old) {
    if (used.has(o.key)) continue;
    try { await deleteFromR2(o.key); deleted++; } catch (err) { console.error('[genie] prop upload cleanup failed', o.key, err); }
  }
  return deleted;
}

// ── Library ─────────────────────────────────────────────────────────────────
export function propAsset(p: GenieProp) {
  const alsoIn = Array.isArray(p.alsoIn) ? p.alsoIn as { category: string; subcategory: string }[] : [];
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    subcategory: p.subcategory,
    ...(alsoIn.length ? { alsoIn } : {}),
    source: p.tenantId ? 'account' as const : 'standard' as const,
    image: p.image as RemoteAsset,
    size: { width: p.width, height: p.height },
    anchor: p.anchor as PropAnchor,
    anchorPoint: { x: p.anchorX, y: p.anchorY },
    eyeDistance: p.eyeDistance,
  };
}
export type PropAssetJson = ReturnType<typeof propAsset>;

export function propView(p: GenieProp) {
  return { ...propAsset(p), alsoIn: (Array.isArray(p.alsoIn) ? p.alsoIn : []) as { category: string; subcategory: string }[], isActive: p.isActive };
}

// What an operator can choose: Standard props that are switched on, plus their own
export function libraryPropsWhere(tenantId: string) {
  return { OR: [{ tenantId: null, isActive: true }, { tenantId }] };
}

export async function propCategories() {
  const rows = await prisma.geniePropCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  return rows.filter(c => !c.parentId).map(c => ({
    id: c.id, name: c.name,
    subcategories: rows.filter(s => s.parentId === c.id).map(s => ({ id: s.id, name: s.name })),
  }));
}

export async function placementError(category: string, subcategory: string, alsoIn: { category: string; subcategory: string }[] = []): Promise<string | null> {
  const all = [{ category, subcategory }, ...alsoIn];
  const subs = await prisma.geniePropCategory.findMany({ where: { id: { in: all.map(a => a.subcategory) } } });
  for (const a of all) if (!subs.some(s => s.id === a.subcategory && s.parentId === a.category)) return 'Choose a sub-category from the list.';
  return null;
}

// The row data for a create or edit
export async function propData(body: PropBody, scope: PropScope, tenantId: string | null) {
  const err = await placementError(body.category, body.subcategory, body.alsoIn);
  if (err) return { error: err };
  const image = await propImageFromUrl(body.imageUrl, scope, tenantId);
  if ('error' in image) return image;
  return {
    data: {
      name: body.name, category: body.category, subcategory: body.subcategory, alsoIn: body.alsoIn ?? [],
      image, width: body.size.width, height: body.size.height, anchor: body.anchor,
      anchorX: body.anchorPoint.x, anchorY: body.anchorPoint.y, eyeDistance: body.eyeDistance ?? PROP_EYE_DISTANCE,
    },
  };
}

// Events (any date) that chose the prop
export async function eventsUsingProp(id: string): Promise<number> {
  const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM event_genie_settings WHERE "propIds" @> ${JSON.stringify([id])}::jsonb`;
  return Number(n);
}

// ── Event ───────────────────────────────────────────────────────────────────
export const PropsPatch = z.object({
  enabled: z.boolean(),
  propIds: z.array(z.string().min(1).max(100)).max(200),
}).strict();
export type PropsPatch = z.infer<typeof PropsPatch>;

export function storedPropIds(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

// What a save stores: new picks must be in the operator's library; props the event already had stay allowed even if
// Super Admin has since switched them off (a running event isn't changed under it)
export async function propsData(patch: PropsPatch, current: unknown, tenantId: string): Promise<{ data: { propsEnabled: boolean; propIds: string[] } } | { error: string }> {
  const ids = Array.from(new Set(patch.propIds));
  const kept = new Set(storedPropIds(current));
  const added = ids.filter(id => !kept.has(id));
  if (added.length) {
    const ok = await prisma.genieProp.findMany({ where: { id: { in: added }, ...libraryPropsWhere(tenantId) }, select: { id: true } });
    if (ok.length !== added.length) return { error: "One of the props isn't in your library any more. Reload the page and choose again." };
  }
  return { data: { propsEnabled: patch.enabled, propIds: ids } };
}

export async function eventProps(propIds: unknown, tenantId: string): Promise<GenieProp[]> {
  const ids = storedPropIds(propIds);
  if (!ids.length) return [];
  const rows = await prisma.genieProp.findMany({ where: { id: { in: ids }, OR: [{ tenantId: null }, { tenantId }] } });
  return ids.map(id => rows.find(r => r.id === id)).filter((r): r is GenieProp => !!r);
}

// EventBundle.props: absent when off or nothing is chosen, so the iPad shows no picker
export function bundleProps(enabled: boolean, props: GenieProp[]) {
  return enabled && props.length ? { enabled: true, items: props.map(propAsset) } : undefined;
}

// ── Starter library ─────────────────────────────────────────────────────────
// content/genie-props: catalog.json and png/ copied from the Genie repo's assets/props (original artwork)
type Catalog = {
  categories: { id: string; name: string; subcategories: { id: string; name: string }[] }[];
  props: { id: string; name: string; category: string; subcategory: string; alsoIn?: { category: string; subcategory: string }[]; png: string; size: { width: number; height: number }; anchor: PropAnchor; anchorPoint: [number, number]; eyeDistance: number }[];
};

// Adds the categories and props that aren't there yet; never changes ones Super Admin already has (or edited)
export async function importStarterProps(dir = path.join(process.cwd(), 'content', 'genie-props')): Promise<{ categories: number; props: number; skipped: number }> {
  const catalog: Catalog = JSON.parse(await fs.readFile(path.join(dir, 'catalog.json'), 'utf8'));
  let categories = 0;
  const existingCats = new Set((await prisma.geniePropCategory.findMany({ select: { id: true } })).map(c => c.id));
  for (const [ci, c] of catalog.categories.entries()) {
    const rows = [{ id: c.id, parentId: null as string | null, name: c.name, sortOrder: ci }, ...c.subcategories.map((s, si) => ({ id: s.id, parentId: c.id, name: s.name, sortOrder: si }))];
    for (const r of rows) if (!existingCats.has(r.id)) { await prisma.geniePropCategory.create({ data: r }); categories++; }
  }
  const existing = new Set((await prisma.genieProp.findMany({ where: { tenantId: null }, select: { id: true } })).map(p => p.id));
  const todo = catalog.props.map((p, i) => ({ p, i })).filter(({ p }) => !existing.has(p.id));
  let props = 0;
  for (let b = 0; b < todo.length; b += 8) {
    await Promise.all(todo.slice(b, b + 8).map(async ({ p, i }) => {
      const stored = await storePropImage(await fs.readFile(path.join(dir, p.png)), 'standard', null);
      if ('error' in stored) throw new Error(`${p.id}: ${stored.error}`);
      await prisma.genieProp.create({
        data: {
          id: p.id, tenantId: null, name: p.name, category: p.category, subcategory: p.subcategory, alsoIn: p.alsoIn ?? [],
          image: stored.image, width: p.size.width, height: p.size.height, anchor: p.anchor,
          anchorX: p.anchorPoint[0], anchorY: p.anchorPoint[1], eyeDistance: p.eyeDistance, sortOrder: i,
        },
      });
      props++;
    }));
  }
  return { categories, props, skipped: catalog.props.length - todo.length };
}
