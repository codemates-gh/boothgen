import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { Prisma, type GenieMusicTrack, type GenieSpinOverlay, type GenieSpinStyle } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { deleteFromR2, getR2Object, headR2Object, r2PublicUrl, uploadToR2 } from '@/lib/storage/r2';
import { keyForUrl, type RemoteAsset } from './templateAssets';
import { designChoiceError } from './clipDesigns';
import { attractFromUrl } from './attract';
import {
  END_LIMITS, END_VIDEO_MAX_BYTES, MUSIC_MAX_BYTES, MUSIC_MAX_MS, MUSIC_TYPES, OVERLAY_MAX_BYTES, OVERLAY_TYPES,
  SPIN360_DEFAULT, STANDARD_SPIN_STYLES, Segments, Spin360Patch, defaultSpinConsent, type Segment, type StoredSpin360,
} from './spin360Options';

// Genie 360 (Genie P15): the event's 360 section (EventGenieSettings.spin360), the Standard libraries Super Admin
// keeps (styles, music, music links, animated overlays) and each account's uploaded songs and overlays.

// Offered to operators only once Super Admin turns "Genie 360 available" on (when the TestFlight build is ready)
export const GENIE360_READY_SETTING = 'genie360_ready';
export async function genie360Ready(): Promise<boolean> {
  return (await prisma.systemSetting.findUnique({ where: { key: GENIE360_READY_SETTING } }))?.value === 'on';
}

export function storedSpin360(v: unknown): StoredSpin360 | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const p = Spin360Patch.safeParse({ ...SPIN360_DEFAULT, ...(v as object) });
  return p.success ? p.data : null;
}
export const spin360View = (v: unknown): StoredSpin360 => storedSpin360(v) ?? SPIN360_DEFAULT;
export const spinConsentFor = (s: Pick<StoredSpin360, 'consentText' | 'showInGallery'>) =>
  (s.consentText?.trim() || defaultSpinConsent(s.showInGallery)).slice(0, 300);

// ── Gallery ───────────────────────────────────────────────────────────────
export const SPIN360_MODE = 'spin360';
export const isSpinClip = (a: { genieMode?: string | null }) => a.genieMode === SPIN360_MODE;
// 360 clips show in the event's public gallery unless the event turned that off
export const showsSpinInGallery = (v: unknown) => storedSpin360(v)?.showInGallery ?? true;

// ── Styles ────────────────────────────────────────────────────────────────
// The Standard styles, added the first time the library is read (Super Admin edits them from there)
async function seedStyles() {
  if ((await prisma.genieSpinStyle.count()) > 0) return;
  await prisma.genieSpinStyle.createMany({
    data: STANDARD_SPIN_STYLES.map((s, i) => ({ id: s.id, name: s.name, description: s.description, captureFps: s.captureFps, segments: s.segments, defaultEffects: s.defaultEffects, sortOrder: i })),
    skipDuplicates: true,
  });
}
export async function spinStyles(all = false): Promise<GenieSpinStyle[]> {
  await seedStyles();
  return prisma.genieSpinStyle.findMany({ where: all ? {} : { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
}
export function styleView(s: GenieSpinStyle) {
  return {
    id: s.id, name: s.name, description: s.description, version: s.version, captureFps: s.captureFps as 120 | 240,
    segments: (Segments.safeParse(s.segments).data ?? []) as Segment[], defaultMusicId: s.defaultMusicId,
    defaultEffects: (s.defaultEffects ?? {}) as { lightTrails?: boolean; backgroundRemoval?: boolean },
    sampleVideo: (s.sampleVideo as { url: string } | null)?.url ?? null, samplePoster: (s.samplePoster as { url: string } | null)?.url ?? null,
    isActive: s.isActive,
  };
}

// ── Music, links, overlays ───────────────────────────────────────────────
export const musicWhere = (tenantId: string) => ({ OR: [{ tenantId: null, isActive: true }, { tenantId }] });
export function trackView(t: GenieMusicTrack) {
  return { id: t.id, name: t.name, moods: t.moods, url: (t.file as RemoteAsset).url, durationMs: t.durationMs, credit: t.credit, source: t.tenantId ? 'account' as const : 'standard' as const, isActive: t.isActive };
}
export const overlaysWhere = musicWhere;
export function overlayView(o: GenieSpinOverlay) {
  const f = o.file as RemoteAsset;
  return { id: o.id, name: o.name, url: f.url, contentType: f.contentType, bytes: f.bytes, source: o.tenantId ? 'account' as const : 'standard' as const, isActive: o.isActive };
}

// What the event's 360 section needs to show its pickers
export async function spin360Library(tenantId: string) {
  const [styles, music, links, overlays, backdrops] = await Promise.all([
    spinStyles(),
    prisma.genieMusicTrack.findMany({ where: musicWhere(tenantId), orderBy: [{ tenantId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }] }),
    prisma.genieMusicLink.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.genieSpinOverlay.findMany({ where: overlaysWhere(tenantId), orderBy: [{ tenantId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }] }),
    // 360 panoramas first, then the rest of the library
    prisma.genieBackdrop.findMany({ where: { OR: [{ tenantId: null, isActive: true }, { tenantId }] }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
  ]);
  const pano = (b: { tags: string[] }) => b.tags.includes('360');
  return {
    styles: styles.map(styleView),
    music: music.map(trackView),
    links: links.map(l => ({ id: l.id, name: l.name, url: l.url, note: l.note })),
    overlays: overlays.map(overlayView),
    backdrops: [...backdrops.filter(pano), ...backdrops.filter(b => !pano(b))].map(b => ({
      id: b.id, name: b.name, is360: pano(b), thumbnail: ((b.thumbnail ?? b.image) as RemoteAsset).url, source: b.tenantId ? 'account' : 'standard',
    })),
  };
}

// ── Saving the event's section ───────────────────────────────────────────
// Every choice must be in the operator's library; ones the event already had stay allowed (switched off since)
export async function spin360Data(patch: Spin360Patch, current: unknown, tenantId: string): Promise<{ value: Prisma.InputJsonValue } | { error: string; path: string }> {
  const prev = storedSpin360(current);
  await seedStyles();
  const style = await prisma.genieSpinStyle.findUnique({ where: { id: patch.styleId } });
  if (!style || (!style.isActive && prev?.styleId !== patch.styleId)) return { error: "That 360 style isn't available. Pick another.", path: 'spin360.styleId' };

  if (patch.music && patch.music.trackId !== prev?.music?.trackId) {
    const t = await prisma.genieMusicTrack.findFirst({ where: { id: patch.music.trackId, ...musicWhere(tenantId) } });
    if (!t) return { error: "That song isn't in your library any more. Pick another.", path: 'spin360.music' };
  }
  if (patch.music) {
    const t = await prisma.genieMusicTrack.findUnique({ where: { id: patch.music.trackId }, select: { durationMs: true } });
    if (t && patch.music.startMs >= t.durationMs) return { error: 'The song starts after it ends. Pick an earlier start point.', path: 'spin360.music' };
  }
  if (patch.animatedOverlay && patch.animatedOverlay.id !== prev?.animatedOverlay?.id) {
    const o = await prisma.genieSpinOverlay.findFirst({ where: { id: patch.animatedOverlay.id, ...overlaysWhere(tenantId) } });
    if (!o) return { error: "That animated overlay isn't in your library any more.", path: 'spin360.animatedOverlay' };
  }
  const bd = patch.backgroundRemoval.backdropId;
  if (bd && bd !== prev?.backgroundRemoval.backdropId) {
    const b = await prisma.genieBackdrop.findFirst({ where: { id: bd, OR: [{ tenantId: null, isActive: true }, { tenantId }] } });
    if (!b) return { error: "That backdrop isn't in your library any more.", path: 'spin360.backgroundRemoval' };
  }
  if (patch.backgroundRemoval.enabled && !bd) return { error: 'Pick a backdrop for background removal, or turn it off.', path: 'spin360.backgroundRemoval' };
  if (patch.design && (patch.design.source !== prev?.design?.source || patch.design.id !== prev?.design?.id || patch.format !== prev?.format)) {
    const err = await designChoiceError(patch.design, tenantId, patch.format);
    if (err) return { error: err.replace('Boomerang', '360'), path: 'spin360.design' };
  }
  const ends: Partial<Pick<StoredSpin360, 'intro' | 'outro'>> = {};
  for (const which of ['intro', 'outro'] as const) {
    const e = patch[which];
    if (!e) { ends[which] = null; continue; }
    const lim = END_LIMITS[e.kind];
    if (e.seconds < lim.min || e.seconds > lim.max) return { error: `A ${e.kind === 'logoCard' ? 'logo card' : e.kind} ${which} is ${lim.min} to ${lim.max} seconds.`, path: `spin360.${which}` };
    if (e.kind === 'logoCard') { ends[which] = { kind: 'logoCard', seconds: e.seconds, media: null }; continue; }
    if (!e.media?.url) return { error: `Upload the ${which} ${e.kind}, or pick another kind.`, path: `spin360.${which}` };
    const same = prev?.[which]?.media?.url === e.media.url;
    const m = same ? { kind: prev![which]!.kind, media: prev![which]!.media!, durationMs: (prev![which]!.media as { durationMs?: number }).durationMs } : await attractFromUrl(e.media.url, tenantId);
    if ('error' in m) return { error: m.error.replace('attract file', `${which} file`), path: `spin360.${which}` };
    if (m.kind !== e.kind) return { error: `That file is ${m.kind === 'video' ? 'a video' : 'an image'}. Pick "${m.kind === 'video' ? 'Video' : 'Image'}" for it.`, path: `spin360.${which}` };
    if (e.kind === 'video' && ((m.durationMs ?? 0) > 5_000 + 250 || (m.media as RemoteAsset).bytes > END_VIDEO_MAX_BYTES)) {
      return { error: `The ${which} video must be 5 seconds or shorter.`, path: `spin360.${which}` };
    }
    ends[which] = { kind: e.kind, seconds: e.kind === 'video' ? Math.min(e.seconds, Math.max(1, (m.durationMs ?? 5000) / 1000)) : e.seconds, media: { ...(m.media as object), ...(m.durationMs !== undefined ? { durationMs: m.durationMs } : {}) } as { url: string } };
  }
  const value: StoredSpin360 = {
    ...patch, ...ends,
    title: patch.title ? { ...patch.title, lines: patch.title.lines.map(l => l.trim()).filter(Boolean) } : null,
    consentText: patch.consentText?.trim() || null,
  };
  return { value: value as unknown as Prisma.InputJsonValue };
}

// ── Files ─────────────────────────────────────────────────────────────────
// Songs, animated overlays and style samples are uploaded straight to R2 under uploads/, then checked and moved to a
// content-addressed key (same file, same URL: the iPhone caches by sha256)
export type SpinFileKind = 'music' | 'overlay' | 'sample';
const ROOT: Record<SpinFileKind, string> = { music: 'genie-music/', overlay: 'genie-spin-overlays/', sample: 'genie-spin-styles/' };
export const spinFilePrefix = (kind: SpinFileKind, tenantId: string | null) => ROOT[kind] + (tenantId ?? 'standard') + '/';
export const spinUploadPrefix = (kind: SpinFileKind, tenantId: string | null) => spinFilePrefix(kind, tenantId) + 'uploads/';
export const SAMPLE_MAX_BYTES = 50 * 1024 * 1024;

export function spinUploadKey(kind: SpinFileKind, tenantId: string | null, contentType: string): { key: string } | { error: string } {
  const ext = kind === 'music' ? MUSIC_TYPES[contentType]?.ext : kind === 'overlay' ? OVERLAY_TYPES[contentType] : contentType === 'video/mp4' ? 'mp4' : undefined;
  if (!ext) return { error: kind === 'music' ? 'Use an MP3 or M4A file.' : kind === 'overlay' ? 'Use an animated PNG, WebP, GIF, or a MOV with transparency.' : 'Use an MP4 video.' };
  return { key: spinUploadPrefix(kind, tenantId) + randomUUID() + '.' + ext };
}
export const spinMaxBytes = (kind: SpinFileKind) => (kind === 'music' ? MUSIC_MAX_BYTES : kind === 'overlay' ? OVERLAY_MAX_BYTES : SAMPLE_MAX_BYTES);
const tooBig = (kind: SpinFileKind) => kind === 'music' ? 'Songs must be 10 MB or smaller.' : kind === 'overlay' ? 'Animated overlays must be 15 MB or smaller.' : 'Example videos must be 50 MB or smaller.';
export const spinTooBig = tooBig;

const CONTENT_TYPE_BY_EXT: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mov: 'video/quicktime', mp4: 'video/mp4', jpg: 'image/jpeg' };

async function store(prefix: string, body: Buffer, ext: string): Promise<RemoteAsset> {
  const sha256 = createHash('sha256').update(body).digest('hex');
  const key = prefix + sha256 + '.' + ext;
  const contentType = CONTENT_TYPE_BY_EXT[ext];
  if (!(await headR2Object(key))) await uploadToR2(key, body, contentType);
  return { url: r2PublicUrl(key), sha256, contentType, bytes: body.length } as RemoteAsset;
}

// Checks an upload and moves it to its stored key; the upload is deleted either way. Songs report their length;
// Example videos also get a poster (their first frame).
export async function finishSpinUpload(kind: SpinFileKind, url: string, tenantId: string | null): Promise<{ file: RemoteAsset; durationMs?: number; poster?: RemoteAsset } | { error: string }> {
  const key = keyForUrl(url);
  if (!key || key.includes('..') || !key.startsWith(spinUploadPrefix(kind, tenantId))) return { error: "That upload isn't in your account's storage." };
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'spin360-'));
  try {
    const obj = await getR2Object(key);
    if (!obj) return { error: "The upload hasn't finished. Try again." };
    if (obj.body.length > spinMaxBytes(kind)) return { error: tooBig(kind) };
    const ext = key.split('.').pop()!;
    const { run, probe } = await import('./attractEncode');
    const src = path.join(dir, 'source.' + ext);
    await fs.writeFile(src, obj.body);
    if (kind === 'music') {
      const { stderr } = await run(['-i', src]);
      if (!/Stream #\d+:\d+.*?: Audio:/.test(stderr)) return { error: "That file has no sound we can read. Use an MP3 or M4A." };
      const d = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
      const durationMs = d ? Math.round(((Number(d[1]) * 60 + Number(d[2])) * 60 + Number(d[3])) * 1000) : 0;
      if (!durationMs) return { error: "That song's length can't be read. Try another file." };
      if (durationMs > MUSIC_MAX_MS + 1000) return { error: 'Songs must be 6 minutes or shorter.' };
      return { file: await store(spinFilePrefix(kind, tenantId), obj.body, ext), durationMs };
    }
    if (kind === 'sample') {
      const info = await probe(src);
      if (!info) return { error: "That video can't be read. Use an MP4." };
      const poster = path.join(dir, 'poster.jpg');
      const r = await run(['-y', '-i', src, '-frames:v', '1', '-vf', "scale='min(720,iw)':-2", '-q:v', '4', poster]);
      if (r.code !== 0) return { error: "That video can't be read. Use an MP4." };
      const prefix = spinFilePrefix(kind, tenantId);
      return { file: await store(prefix, obj.body, ext), poster: await store(prefix + 'posters/', await fs.readFile(poster), 'jpg'), durationMs: info.durationMs ?? undefined };
    }
    return { file: await store(spinFilePrefix(kind, tenantId), obj.body, ext) };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    await deleteFromR2(key).catch(err => console.error('[spin360] upload cleanup failed', key, err));
  }
}

// A stored file no row uses any more is deleted (files are shared by content)
export async function deleteUnusedSpinFile(url: string | null | undefined): Promise<void> {
  const key = url ? keyForUrl(url) : null;
  if (!key || !Object.values(ROOT).some(r => key.startsWith(r)) || key.includes('/uploads/')) return;
  const pattern = '%' + key.replace(/[\\%_]/g, c => '\\' + c) + '%';
  const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT (
      (SELECT count(*) FROM genie_music_tracks WHERE file::text LIKE ${pattern})
      + (SELECT count(*) FROM genie_spin_overlays WHERE file::text LIKE ${pattern})
      + (SELECT count(*) FROM genie_spin_styles WHERE "sampleVideo"::text LIKE ${pattern} OR "samplePoster"::text LIKE ${pattern})
    ) AS n`;
  if (Number(n) > 0) return;
  await deleteFromR2(key).catch(err => console.error('[spin360] file cleanup failed', key, err));
}

// Events whose 360 section uses this song / overlay (stored ids in EventGenieSettings.spin360)
export async function eventsUsingSpin(kind: 'music' | 'overlay', id: string): Promise<number> {
  const json = kind === 'music' ? { music: { trackId: id } } : { animatedOverlay: { id } };
  const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM event_genie_settings WHERE spin360 @> ${JSON.stringify(json)}::jsonb`;
  return Number(n);
}
