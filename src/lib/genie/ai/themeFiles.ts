import { createHash } from 'crypto';
import { Prisma, type GenieAiTheme } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { getR2Object, r2PublicUrl } from '@/lib/storage/r2';
import { keyForUrl, type RemoteAsset } from '../templateAssets';
import { toJpeg } from './image';
import { THEME_SAMPLE_SIDE, THEME_THUMB_SIDE, ensurePlaceholders, isPlaceholder, storeJpeg, themePrefix } from './themes';

// Geniefied theme files checked against storage. iPads verify every sample and thumbnail against the bundle (sha256,
// bytes; JPEG / PNG only) and leave a theme out of the picker on any mismatch or failed download. Before a bundle is
// built, each theme's files are checked (at most every 10 minutes per theme and server); anything that drifted is
// corrected, which changes the bundle so iPads download it again. A file that's gone is remade (the thumbnail from the
// sample, a sample as a placeholder). Repairs are logged as "[ai-theme] repaired files".

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const checkedAt = new Map<string, number>();
export const THEME_CHECK_EVERY_MS = 10 * 60_000;
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const imageType = (b: Buffer) => (b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b.subarray(0, 8).equals(PNG_SIG) ? 'image/png' : null);

async function publiclyReadable(url: string): Promise<boolean> {
  try { return (await fetch(url, { method: 'HEAD', cache: 'no-store' })).ok; } catch { return false; }
}

// The stored asset as it should be, 'ok' when it already is, or null when the file is gone / unusable
async function checkedAsset(a: RemoteAsset, prefix: string): Promise<RemoteAsset | 'ok' | null> {
  const key = a?.url ? keyForUrl(a.url) : null;
  if (!key) return null;
  const obj = await getR2Object(key);
  if (!obj || obj.body.length === 0) return null;
  const type = imageType(obj.body);
  if (!type) {
    // Not a JPEG / PNG: stored again as a JPEG
    const j = await toJpeg(obj.body, THEME_SAMPLE_SIDE);
    return j ? storeJpeg(prefix, j.body) : null;
  }
  const want = { url: r2PublicUrl(key), sha256: sha(obj.body), contentType: type, bytes: obj.body.length } as RemoteAsset;
  if (!(await publiclyReadable(want.url))) {
    // In storage but not readable at its public address: written again under its content address
    const body = type === 'image/jpeg' ? obj.body : (await toJpeg(obj.body, THEME_SAMPLE_SIDE))?.body;
    if (!body) return null;
    const again = await storeJpeg(prefix, body);
    return (await publiclyReadable(again.url)) ? again : null;
  }
  const same = a.url === want.url && a.sha256 === want.sha256 && a.bytes === want.bytes && a.contentType === want.contentType;
  return same ? 'ok' : want;
}

export async function verifyThemeFiles(t: GenieAiTheme, now = Date.now()): Promise<GenieAiTheme> {
  if (!t.sample || now - (checkedAt.get(t.id) ?? 0) < THEME_CHECK_EVERY_MS) return t;
  checkedAt.set(t.id, now);
  try {
    const sample = t.sample as RemoteAsset;
    const prefix = themePrefix(t.tenantId ? 'mine' : 'standard', t.tenantId) + (isPlaceholder(sample) ? 'placeholders/' : '');
    const s = await checkedAsset(sample, prefix);
    const th = t.thumbnail ? await checkedAsset(t.thumbnail as RemoteAsset, prefix + 'thumbs/') : null;
    const data: { sample?: RemoteAsset | typeof Prisma.DbNull; thumbnail?: RemoteAsset | typeof Prisma.DbNull } = {};
    const notes: string[] = [];
    if (s === null) {
      // The sample is gone: back to a placeholder (made below)
      data.sample = Prisma.DbNull; data.thumbnail = Prisma.DbNull;
      notes.push(`sample missing (${sample.url})`);
    } else {
      if (s !== 'ok') { data.sample = s; notes.push(`sample ${JSON.stringify(sample)} → ${JSON.stringify(s)}`); }
      if (th && th !== 'ok') { data.thumbnail = th; notes.push(`thumbnail ${JSON.stringify(t.thumbnail)} → ${JSON.stringify(th)}`); }
      if (th === null) {
        // Gone or never made: a new one from the sample
        const from = s === 'ok' ? sample : s;
        const obj = await getR2Object(keyForUrl(from.url)!);
        const small = obj && await toJpeg(obj.body, THEME_THUMB_SIDE, 5);
        if (small) { data.thumbnail = await storeJpeg(prefix + 'thumbs/', small.body); notes.push(`thumbnail ${t.thumbnail ? `missing (${(t.thumbnail as RemoteAsset).url})` : 'absent'}, remade from the sample`); }
      }
    }
    if (!notes.length) return t;
    console.warn(`[ai-theme] repaired files of ${t.id} (${t.name}): ${notes.join('; ')}`);
    const saved = await prisma.genieAiTheme.update({ where: { id: t.id }, data });
    return saved.sample ? saved : ((await ensurePlaceholders([saved]))[0] ?? saved);
  } catch (err) {
    console.error('[ai-theme] file check failed', t.id, err);
    return t;
  }
}
