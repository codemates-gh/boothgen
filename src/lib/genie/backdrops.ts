import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { z } from 'zod';
import type { GenieBackdrop } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { deleteFromR2, getR2Object, headR2Object, r2PublicUrl, uploadToR2 } from '@/lib/storage/r2';
import { keyForUrl, type RemoteAsset } from './templateAssets';

// Virtual backdrop (Genie P8): the iPad cuts guests out of the real background and puts them on a backdrop. BoothGen
// keeps the library (Standard in Super Admin, My backdrops per account), each event's choice, and the files.
// Wire shapes: BackdropsConfig.json / BackdropAsset.json in the Genie repo's shared/schemas.

export const BACKDROP_MAX_SIDE = 1800; // never bigger than the 4x6 print at 300 dpi
export const BACKDROP_SMALL_SIDE = 1200; // below this (long side) it may look soft: a warning, not a block
export const BACKDROP_THUMB_WIDTH = 360;
export const BACKDROP_SOURCE_MAX_BYTES = 25 * 1024 * 1024;
export const BACKDROP_SOURCE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png' } as const;
export const EDGE_SOFTNESS = ['soft', 'medium', 'sharp'] as const;

export type BackdropScope = 'standard' | 'mine';
export const backdropPrefix = (scope: BackdropScope, tenantId: string | null) => {
  if (scope === 'mine' && !tenantId) throw new Error('My backdrops need an account');
  return scope === 'standard' ? 'genie-backdrops/standard/' : `genie-backdrops/${tenantId}/`;
};
const uploadPrefix = (scope: BackdropScope, tenantId: string | null) => backdropPrefix(scope, tenantId) + 'uploads/';

export function newUploadKey(scope: BackdropScope, tenantId: string | null, contentType: keyof typeof BACKDROP_SOURCE_TYPES) {
  return uploadPrefix(scope, tenantId) + randomUUID() + '.' + BACKDROP_SOURCE_TYPES[contentType];
}

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

// Stores a file content-addressed (same file, same URL: iPads cache by sha256 across events)
async function storeJpeg(prefix: string, body: Buffer): Promise<RemoteAsset> {
  const sha256 = sha(body);
  const key = prefix + sha256 + '.jpg';
  if (!(await headR2Object(key))) await uploadToR2(key, body, 'image/jpeg');
  return { url: r2PublicUrl(key), sha256, contentType: 'image/jpeg', bytes: body.length };
}

export type ProcessedBackdrop = { image: RemoteAsset; thumbnail: RemoteAsset; width: number; height: number; warning?: string };

// Turns an uploaded source (JPEG/PNG under .../uploads/) into the stored backdrop: long side at most 1800 px, PNG
// transparency flattened onto white, JPEG about quality 88, plus a 360 px wide thumbnail. The source is deleted.
export async function processBackdropUpload(url: string, scope: BackdropScope, tenantId: string | null): Promise<ProcessedBackdrop | { error: string }> {
  const key = keyForUrl(url);
  if (!key || key.includes('..') || !key.startsWith(uploadPrefix(scope, tenantId))) return { error: "That upload isn't in your account's storage." };
  const { run, probe } = await import('./attractEncode');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'backdrop-'));
  try {
    const obj = await getR2Object(key);
    if (!obj) return { error: "The upload hasn't finished. Try again." };
    if (obj.body.length > BACKDROP_SOURCE_MAX_BYTES) return { error: 'Backdrops must be 25 MB or smaller.' };
    const src = path.join(dir, 'source' + path.extname(key));
    await fs.writeFile(src, obj.body);
    if (!(await probe(src))) return { error: "That image couldn't be read. Use a JPG or PNG." };
    const out = path.join(dir, 'out.jpg'), thumb = path.join(dir, 'thumb.jpg');
    // Scale down only; a white layer under the picture flattens any transparency; ffmpeg applies EXIF rotation
    const vf = `scale=w='min(${BACKDROP_MAX_SIDE},iw)':h='min(${BACKDROP_MAX_SIDE},ih)':force_original_aspect_ratio=decrease,format=rgba,split[fg][w];[w]drawbox=x=0:y=0:w=iw:h=ih:color=white@1:t=fill[bg];[bg][fg]overlay=format=auto,format=yuvj420p`;
    const r = await run(['-y', '-i', src, '-filter_complex', vf, '-frames:v', '1', '-q:v', '3', out]);
    if (r.code !== 0) { console.error('[backdrop] convert failed', r.stderr.slice(-2000)); return { error: "That image couldn't be converted. Try a different file." }; }
    const t = await run(['-y', '-i', out, '-vf', `scale=${BACKDROP_THUMB_WIDTH}:-2`, '-frames:v', '1', '-q:v', '5', thumb]);
    if (t.code !== 0) { console.error('[backdrop] thumbnail failed', t.stderr.slice(-2000)); return { error: "That image couldn't be converted. Try a different file." }; }
    const info = await probe(out);
    if (!info) return { error: "That image couldn't be converted. Try a different file." };
    const prefix = backdropPrefix(scope, tenantId);
    const image = await storeJpeg(prefix, await fs.readFile(out));
    const thumbnail = await storeJpeg(prefix + 'thumbs/', await fs.readFile(thumb));
    const long = Math.max(info.width, info.height);
    return {
      image, thumbnail, width: info.width, height: info.height,
      ...(long < BACKDROP_SMALL_SIDE ? { warning: `It's ${info.width}×${info.height}, so it may look soft in prints. 1800×1200 or larger is best.` } : {}),
    };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    await deleteFromR2(key).catch(err => console.error('[backdrop] source cleanup failed', key, err));
  }
}

// ── Library ─────────────────────────────────────────────────────────────────
export function backdropAsset(b: GenieBackdrop) {
  return {
    id: b.id,
    name: b.name,
    source: b.tenantId ? 'account' as const : 'standard' as const,
    image: b.image as RemoteAsset,
    ...(b.thumbnail ? { thumbnail: b.thumbnail as RemoteAsset } : {}),
  };
}

export function backdropView(b: GenieBackdrop) {
  return { ...backdropAsset(b), thumbnail: (b.thumbnail as RemoteAsset | null) ?? null, width: b.width, height: b.height, isActive: b.isActive };
}

export const libraryBackdropsWhere = (tenantId: string) => ({ OR: [{ tenantId: null, isActive: true }, { tenantId }] });

export async function eventsUsingBackdrop(id: string): Promise<number> {
  const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM event_genie_settings WHERE "backdropIds" @> ${JSON.stringify([id])}::jsonb`;
  return Number(n);
}

// Deleting a My backdrop an event uses takes it off those events (they offer the rest; the default falls back)
export async function removeBackdropFromEvents(id: string) {
  const rows = await prisma.$queryRaw<{ id: string; backdropIds: unknown; backdropDefaultId: string | null }[]>`
    SELECT id, "backdropIds", "backdropDefaultId" FROM event_genie_settings WHERE "backdropIds" @> ${JSON.stringify([id])}::jsonb`;
  for (const r of rows) {
    await prisma.eventGenieSettings.update({
      where: { id: r.id },
      data: { backdropIds: storedIds(r.backdropIds).filter(x => x !== id), ...(r.backdropDefaultId === id ? { backdropDefaultId: null } : {}) },
    });
  }
}

const filesOf = (b: Pick<GenieBackdrop, 'image' | 'thumbnail'>) => [(b.image as RemoteAsset)?.url, (b.thumbnail as RemoteAsset | null)?.url];

// Files no backdrop uses any more are deleted (backdrops share content-addressed files)
export async function deleteUnusedBackdropFiles(b: Pick<GenieBackdrop, 'image' | 'thumbnail'>): Promise<number> {
  let deleted = 0;
  for (const url of filesOf(b)) {
    const key = url ? keyForUrl(url) : null;
    if (!key || !key.startsWith('genie-backdrops/')) continue;
    const pattern = '%' + key.replace(/[\\%_]/g, c => '\\' + c) + '%';
    const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM genie_backdrops WHERE image::text LIKE ${pattern} OR thumbnail::text LIKE ${pattern}`;
    if (Number(n) > 0) continue;
    try { await deleteFromR2(key); deleted++; } catch (err) { console.error('[genie] backdrop file cleanup failed', key, err); }
  }
  return deleted;
}

// Daily: sources never processed (6 h) and processed files never saved as a backdrop (a day)
export async function sweepAbandonedBackdropFiles(now = new Date()): Promise<{ sources: number; unsaved: number }> {
  const { listR2Objects } = await import('@/lib/storage/r2');
  const all = await listR2Objects('genie-backdrops/');
  const age = (o: { lastModified: Date }) => now.getTime() - o.lastModified.getTime();
  const used = new Set((await prisma.genieBackdrop.findMany({ select: { image: true, thumbnail: true } })).flatMap(filesOf).map(u => (u ? keyForUrl(u) : null)));
  let sources = 0, unsaved = 0;
  for (const o of all) {
    const isSource = o.key.includes('/uploads/');
    if (isSource ? age(o) < 6 * 3600_000 : age(o) < 24 * 3600_000 || used.has(o.key)) continue;
    try { await deleteFromR2(o.key); isSource ? sources++ : unsaved++; } catch (err) { console.error('[genie] backdrop sweep failed', o.key, err); }
  }
  return { sources, unsaved };
}

// ── Event ───────────────────────────────────────────────────────────────────
export const BackdropsPatch = z.object({
  enabled: z.boolean(),
  backdropIds: z.array(z.string().min(1).max(100)).max(100),
  defaultId: z.string().min(1).max(100).nullable(),
  guestPicks: z.boolean(),
  edgeSoftness: z.enum(EDGE_SOFTNESS),
}).strict();
export type BackdropsPatch = z.infer<typeof BackdropsPatch>;

export function storedIds(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

// New picks must be in the operator's library; ones the event already had stay allowed (switched off since)
export async function backdropsData(patch: BackdropsPatch, current: unknown, tenantId: string) {
  const ids = Array.from(new Set(patch.backdropIds));
  const kept = new Set(storedIds(current));
  const added = ids.filter(id => !kept.has(id));
  if (added.length) {
    const ok = await prisma.genieBackdrop.findMany({ where: { id: { in: added }, ...libraryBackdropsWhere(tenantId) }, select: { id: true } });
    if (ok.length !== added.length) return { error: "One of the backdrops isn't in your library any more. Reload the page and choose again." };
  }
  return {
    data: {
      backdropsEnabled: patch.enabled, backdropIds: ids,
      backdropDefaultId: patch.defaultId && ids.includes(patch.defaultId) ? patch.defaultId : null,
      backdropGuestPicks: patch.guestPicks, backdropEdgeSoftness: patch.edgeSoftness,
    },
  };
}

export async function eventBackdrops(ids: unknown, tenantId: string): Promise<GenieBackdrop[]> {
  const list = storedIds(ids);
  if (!list.length) return [];
  const rows = await prisma.genieBackdrop.findMany({ where: { id: { in: list }, OR: [{ tenantId: null }, { tenantId }] } });
  return list.map(id => rows.find(r => r.id === id)).filter((r): r is GenieBackdrop => !!r);
}

// EventBundle.backgroundRemoval: absent when off or nothing is chosen (the real background is kept)
export function bundleBackdrops(s: { backdropsEnabled: boolean; backdropDefaultId: string | null; backdropGuestPicks: boolean; backdropEdgeSoftness: string }, items: GenieBackdrop[]) {
  if (!s.backdropsEnabled || !items.length) return undefined;
  const edge = (EDGE_SOFTNESS as readonly string[]).includes(s.backdropEdgeSoftness) ? s.backdropEdgeSoftness : 'medium';
  return {
    enabled: true,
    guestPicks: s.backdropGuestPicks,
    items: items.map(backdropAsset),
    ...(s.backdropDefaultId && items.some(b => b.id === s.backdropDefaultId) ? { defaultId: s.backdropDefaultId } : {}),
    edgeSoftness: edge,
  };
}

export function backdropsView(s: { backdropsEnabled: boolean; backdropIds: unknown; backdropDefaultId: string | null; backdropGuestPicks: boolean; backdropEdgeSoftness: string }) {
  return { enabled: s.backdropsEnabled, backdropIds: storedIds(s.backdropIds), defaultId: s.backdropDefaultId, guestPicks: s.backdropGuestPicks, edgeSoftness: s.backdropEdgeSoftness as (typeof EDGE_SOFTNESS)[number] };
}

// ── Starter library ─────────────────────────────────────────────────────────
// content/genie-backdrops: catalog.json, jpg/ and thumb/ copied from the Genie repo's assets/backdrops (original art)
type Catalog = { backdrops: { id: string; name: string; jpg: string; thumbnail: string; size: { width: number; height: number } }[] };

export async function importStarterBackdrops(dir = path.join(process.cwd(), 'content', 'genie-backdrops')): Promise<{ backdrops: number; skipped: number }> {
  const catalog: Catalog = JSON.parse(await fs.readFile(path.join(dir, 'catalog.json'), 'utf8'));
  const existing = new Set((await prisma.genieBackdrop.findMany({ where: { tenantId: null }, select: { id: true } })).map(b => b.id));
  const prefix = backdropPrefix('standard', null);
  let backdrops = 0;
  for (const [i, b] of catalog.backdrops.entries()) {
    if (existing.has(b.id)) continue;
    const image = await storeJpeg(prefix, await fs.readFile(path.join(dir, b.jpg)));
    const thumbnail = await storeJpeg(prefix + 'thumbs/', await fs.readFile(path.join(dir, b.thumbnail)));
    await prisma.genieBackdrop.create({ data: { id: b.id, tenantId: null, name: b.name, image, thumbnail, width: b.size.width, height: b.size.height, sortOrder: i } });
    backdrops++;
  }
  return { backdrops, skipped: catalog.backdrops.length - backdrops };
}
