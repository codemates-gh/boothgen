import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { z } from 'zod';
import type { GeniePose } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { deleteFromR2, getR2Object, headR2Object, r2PublicUrl, uploadToR2 } from '@/lib/storage/r2';
import { keyForUrl, type RemoteAsset } from './templateAssets';
import { readImageInfo } from './image';

// Pose library (Genie P11): guests who don't know how to pose see ideas on the iPad before Start and as a card during
// each countdown (never drawn into photos, never for Boomerangs). BoothGen keeps the library (Standard in Super Admin,
// My poses per account), the account's Event defaults + each event's override, and the files.
// Wire shapes: PosesConfig.json / PoseAsset.json in the Genie repo's shared/schemas.

export const POSE_MAX_SIDE = 1200;
export const POSE_THUMB_SIDE = 360;
export const POSE_SOURCE_MAX_BYTES = 15 * 1024 * 1024;
export const POSE_SOURCE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png' } as const;
export const POSES_PER_CATEGORY_HINT = 8;

// Categories operators browse by; on the wire a pose is group + soloStyle (solo) or people (group)
export const POSE_CATEGORIES = [
  { value: 'her', label: 'Her' },
  { value: 'him', label: 'Him' },
  { value: 'all', label: 'All' },
  { value: 'two', label: 'For two' },
  { value: 'groups', label: 'For groups' },
] as const;
export type PoseCategory = (typeof POSE_CATEGORIES)[number]['value'];
export const POSE_CATEGORY_VALUES = POSE_CATEGORIES.map(c => c.value) as unknown as [PoseCategory, ...PoseCategory[]];

type PoseKind = Pick<GeniePose, 'group' | 'soloStyle' | 'people'>;
export function poseCategory(p: PoseKind): PoseCategory {
  if (p.group === 'group') return (p.people ?? 3) <= 2 ? 'two' : 'groups';
  return p.soloStyle === 'female' ? 'her' : p.soloStyle === 'male' ? 'him' : 'all';
}

// Category (+ people for For groups, 3–10) → stored kind
export const PoseKindInput = z.object({
  category: z.enum(POSE_CATEGORY_VALUES),
  people: z.number().int().min(3, 'For groups means 3 people or more').max(10, 'At most 10 people').optional(),
}).strict();
export function kindFor(k: z.infer<typeof PoseKindInput>): Pick<GeniePose, 'group' | 'soloStyle' | 'people'> {
  switch (k.category) {
    case 'her': return { group: 'solo', soloStyle: 'female', people: null };
    case 'him': return { group: 'solo', soloStyle: 'male', people: null };
    case 'all': return { group: 'solo', soloStyle: 'any', people: null };
    case 'two': return { group: 'group', soloStyle: null, people: 2 };
    case 'groups': return { group: 'group', soloStyle: null, people: k.people ?? 3 };
  }
}

export type PoseScope = 'standard' | 'mine';
export const posePrefix = (scope: PoseScope, tenantId: string | null) => {
  if (scope === 'mine' && !tenantId) throw new Error('My poses need an account');
  return scope === 'standard' ? 'genie-poses/standard/' : `genie-poses/${tenantId}/`;
};
const uploadPrefix = (scope: PoseScope, tenantId: string | null) => posePrefix(scope, tenantId) + 'uploads/';

export function newPoseUploadKey(scope: PoseScope, tenantId: string | null, contentType: keyof typeof POSE_SOURCE_TYPES) {
  return uploadPrefix(scope, tenantId) + randomUUID() + '.' + POSE_SOURCE_TYPES[contentType];
}

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

// Stores a file content-addressed (same file, same URL: iPads cache by sha256 across events)
async function store(prefix: string, body: Buffer, contentType: 'image/png' | 'image/jpeg'): Promise<RemoteAsset> {
  const sha256 = sha(body);
  const key = prefix + sha256 + (contentType === 'image/png' ? '.png' : '.jpg');
  if (!(await headR2Object(key))) await uploadToR2(key, body, contentType);
  return { url: r2PublicUrl(key), sha256, contentType, bytes: body.length };
}

export type ProcessedPose = { image: RemoteAsset; thumbnail: RemoteAsset; width: number; height: number };

// Turns an uploaded source (JPEG/PNG under .../uploads/) into the stored pose: at most 1200 px on the long side and a
// 360 px thumbnail. A PNG with transparency stays a PNG (illustrations); anything else becomes a JPEG (photos). The
// source is deleted.
export async function processPoseUpload(url: string, scope: PoseScope, tenantId: string | null): Promise<ProcessedPose | { error: string }> {
  const key = keyForUrl(url);
  if (!key || key.includes('..') || !key.startsWith(uploadPrefix(scope, tenantId))) return { error: "That upload isn't in your account's storage." };
  const { run, probe } = await import('./attractEncode');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pose-'));
  try {
    const obj = await getR2Object(key);
    if (!obj) return { error: "The upload hasn't finished. Try again." };
    if (obj.body.length > POSE_SOURCE_MAX_BYTES) return { error: 'Pose pictures must be 15 MB or smaller.' };
    const info = readImageInfo(obj.body);
    if (!info) return { error: "That image couldn't be read. Use a JPG or PNG." };
    const png = info.contentType === 'image/png' && info.hasAlpha;
    const ext = png ? '.png' : '.jpg';
    const src = path.join(dir, 'source' + path.extname(key));
    await fs.writeFile(src, obj.body);
    const out = path.join(dir, 'out' + ext), thumb = path.join(dir, 'thumb' + ext);
    const fit = (side: number) => `scale=w='min(${side},iw)':h='min(${side},ih)':force_original_aspect_ratio=decrease`;
    // PNG keeps its transparency; a JPEG gets a white layer under any transparency (an opaque PNG has none)
    const vf = (side: number) => png ? `${fit(side)},format=rgba`
      : `${fit(side)},format=rgba,split[fg][w];[w]drawbox=x=0:y=0:w=iw:h=ih:color=white@1:t=fill[bg];[bg][fg]overlay=format=auto,format=yuvj420p`;
    const quality = png ? [] : ['-q:v', '3'];
    const r = await run(['-y', '-i', src, png ? '-vf' : '-filter_complex', vf(POSE_MAX_SIDE), '-frames:v', '1', ...quality, out]);
    if (r.code !== 0) { console.error('[pose] convert failed', r.stderr.slice(-2000)); return { error: "That image couldn't be converted. Try a different file." }; }
    const t = await run(['-y', '-i', out, png ? '-vf' : '-filter_complex', vf(POSE_THUMB_SIDE), '-frames:v', '1', ...(png ? [] : ['-q:v', '5']), thumb]);
    if (t.code !== 0) { console.error('[pose] thumbnail failed', t.stderr.slice(-2000)); return { error: "That image couldn't be converted. Try a different file." }; }
    const size = await probe(out);
    if (!size) return { error: "That image couldn't be converted. Try a different file." };
    const type = png ? 'image/png' as const : 'image/jpeg' as const;
    const prefix = posePrefix(scope, tenantId);
    return {
      image: await store(prefix, await fs.readFile(out), type),
      thumbnail: await store(prefix + 'thumbs/', await fs.readFile(thumb), type),
      width: size.width, height: size.height,
    };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    await deleteFromR2(key).catch(err => console.error('[pose] source cleanup failed', key, err));
  }
}

// ── Library ─────────────────────────────────────────────────────────────────
// PoseAsset (the bundle shape): soloStyle only for solo poses, people only for group poses
export function poseAsset(p: GeniePose) {
  return {
    id: p.id,
    name: p.name.slice(0, 80),
    source: p.tenantId ? 'account' as const : 'standard' as const,
    group: p.group === 'group' ? 'group' as const : 'solo' as const,
    ...(p.group === 'group' ? { people: Math.min(10, Math.max(2, p.people ?? 2)) } : { soloStyle: (p.soloStyle ?? 'any') as 'female' | 'male' | 'any' }),
    image: p.image as RemoteAsset,
    ...(p.thumbnail ? { thumbnail: p.thumbnail as RemoteAsset } : {}),
  };
}

export function poseView(p: GeniePose) {
  return {
    id: p.id, name: p.name, source: p.tenantId ? 'account' as const : 'standard' as const,
    category: poseCategory(p), people: p.people,
    image: p.image as RemoteAsset, thumbnail: (p.thumbnail as RemoteAsset | null) ?? null,
    width: p.width, height: p.height, isActive: p.isActive,
  };
}
export type PoseView = ReturnType<typeof poseView>;

export const libraryPosesWhere = (tenantId: string) => ({ OR: [{ tenantId: null, isActive: true }, { tenantId }] });
const poseOrder = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];

export async function libraryPoses(tenantId: string) {
  return prisma.geniePose.findMany({ where: libraryPosesWhere(tenantId), orderBy: poseOrder });
}

export function storedPoseIds(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

// Events and the account's Event defaults that list a pose
export async function placesUsingPose(id: string): Promise<{ events: number; defaults: number }> {
  const json = JSON.stringify([id]);
  const [[{ n: events }], [{ n: defaults }]] = await Promise.all([
    prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM event_genie_settings WHERE "poseIds" @> ${json}::jsonb`,
    prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM genie_defaults WHERE "poseIds" @> ${json}::jsonb`,
  ]);
  return { events: Number(events), defaults: Number(defaults) };
}

// Deleting a My pose takes it off the account's events and Event defaults
export async function removePoseEverywhere(id: string) {
  const json = JSON.stringify([id]);
  const events = await prisma.$queryRaw<{ id: string; poseIds: unknown }[]>`SELECT id, "poseIds" FROM event_genie_settings WHERE "poseIds" @> ${json}::jsonb`;
  for (const r of events) await prisma.eventGenieSettings.update({ where: { id: r.id }, data: { poseIds: storedPoseIds(r.poseIds).filter(x => x !== id) } });
  const defaults = await prisma.$queryRaw<{ id: string; poseIds: unknown }[]>`SELECT id, "poseIds" FROM genie_defaults WHERE "poseIds" @> ${json}::jsonb`;
  for (const r of defaults) await prisma.genieDefaults.update({ where: { id: r.id }, data: { poseIds: storedPoseIds(r.poseIds).filter(x => x !== id) } });
}

const filesOf = (p: Pick<GeniePose, 'image' | 'thumbnail'>) => [(p.image as RemoteAsset)?.url, (p.thumbnail as RemoteAsset | null)?.url];

// Files no pose uses any more are deleted (poses share content-addressed files)
export async function deleteUnusedPoseFiles(p: Pick<GeniePose, 'image' | 'thumbnail'>): Promise<number> {
  let deleted = 0;
  for (const url of filesOf(p)) {
    const key = url ? keyForUrl(url) : null;
    if (!key || !key.startsWith('genie-poses/')) continue;
    const pattern = '%' + key.replace(/[\\%_]/g, c => '\\' + c) + '%';
    const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM genie_poses WHERE image::text LIKE ${pattern} OR thumbnail::text LIKE ${pattern}`;
    if (Number(n) > 0) continue;
    try { await deleteFromR2(key); deleted++; } catch (err) { console.error('[genie] pose file cleanup failed', key, err); }
  }
  return deleted;
}

// Daily: sources never processed (6 h) and processed files never saved as a pose (a day)
export async function sweepAbandonedPoseFiles(now = new Date()): Promise<{ sources: number; unsaved: number }> {
  const { listR2Objects } = await import('@/lib/storage/r2');
  const all = await listR2Objects('genie-poses/');
  const age = (o: { lastModified: Date }) => now.getTime() - o.lastModified.getTime();
  const used = new Set((await prisma.geniePose.findMany({ select: { image: true, thumbnail: true } })).flatMap(filesOf).map(u => (u ? keyForUrl(u) : null)));
  let sources = 0, unsaved = 0;
  for (const o of all) {
    const isSource = o.key.includes('/uploads/');
    if (isSource ? age(o) < 6 * 3600_000 : age(o) < 24 * 3600_000 || used.has(o.key)) continue;
    try { await deleteFromR2(o.key); isSource ? sources++ : unsaved++; } catch (err) { console.error('[genie] pose sweep failed', o.key, err); }
  }
  return { sources, unsaved };
}

// ── Event defaults + event ──────────────────────────────────────────────────
export const PosesPatch = z.object({
  enabled: z.boolean(),
  poseIds: z.array(z.string().min(1).max(100)).max(300),
}).strict();
export type PosesPatch = z.infer<typeof PosesPatch>;

// New picks must be in the operator's library; ones already chosen stay allowed (switched off since)
export async function posesData(patch: PosesPatch, current: unknown, tenantId: string) {
  const ids = Array.from(new Set(patch.poseIds));
  const kept = new Set(storedPoseIds(current));
  const added = ids.filter(id => !kept.has(id));
  if (added.length) {
    const ok = await prisma.geniePose.findMany({ where: { id: { in: added }, ...libraryPosesWhere(tenantId) }, select: { id: true } });
    if (ok.length !== added.length) return { error: "One of the poses isn't in your library any more. Reload the page and choose again." };
  }
  return { data: { posesEnabled: patch.enabled, poseIds: ids } };
}

export function posesView(s: { posesEnabled: boolean; poseIds: unknown }) {
  return { enabled: s.posesEnabled, poseIds: storedPoseIds(s.poseIds) };
}

// The chosen poses in the guests' order (Standard ones Super Admin switched off since are kept; deleted ones dropped)
export async function chosenPoses(ids: unknown, tenantId: string): Promise<GeniePose[]> {
  const list = storedPoseIds(ids);
  if (!list.length) return [];
  const rows = await prisma.geniePose.findMany({ where: { id: { in: list }, OR: [{ tenantId: null }, { tenantId }] } });
  return list.map(id => rows.find(r => r.id === id)).filter((r): r is GeniePose => !!r);
}

// EventBundle.poses: absent when off or nothing is chosen
export function bundlePoses(s: { posesEnabled: boolean }, items: GeniePose[]) {
  if (!s.posesEnabled || !items.length) return undefined;
  return { enabled: true, items: items.map(poseAsset) };
}

// ── Starter library ─────────────────────────────────────────────────────────
// content/genie-poses: catalog.json, png/ and thumb/ copied from the Genie repo's assets/poses (reviewed AI art)
type CatalogFile = { file: string; width: number; height: number; sha256: string };
type Catalog = { items: { id: string; name: string; group: 'solo' | 'group'; soloStyle?: string; people?: number; image: CatalogFile; thumbnail: CatalogFile }[] };

export async function importStarterPoses(dir = path.join(process.cwd(), 'content', 'genie-poses')): Promise<{ poses: number; skipped: number }> {
  const catalog: Catalog = JSON.parse(await fs.readFile(path.join(dir, 'catalog.json'), 'utf8'));
  const existing = new Set((await prisma.geniePose.findMany({ where: { tenantId: null }, select: { id: true } })).map(p => p.id));
  const prefix = posePrefix('standard', null);
  let poses = 0;
  for (const [i, p] of catalog.items.entries()) {
    if (existing.has(p.id)) continue;
    const image = await store(prefix, await fs.readFile(path.join(dir, p.image.file)), 'image/png');
    const thumbnail = await store(prefix + 'thumbs/', await fs.readFile(path.join(dir, p.thumbnail.file)), 'image/png');
    if (image.sha256 !== p.image.sha256) throw new Error(`${p.image.file} doesn't match the catalog`);
    await prisma.geniePose.create({ data: {
      id: p.id, tenantId: null, name: p.name.slice(0, 80), group: p.group,
      soloStyle: p.group === 'solo' ? (p.soloStyle ?? 'any') : null, people: p.group === 'group' ? (p.people ?? 2) : null,
      image, thumbnail, width: p.image.width, height: p.image.height, sortOrder: i,
    } });
    poses++;
  }
  return { poses, skipped: catalog.items.length - poses };
}
