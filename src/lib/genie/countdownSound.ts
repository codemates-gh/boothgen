import { spawn } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { deleteFromR2, getR2Object, headR2Object, r2PublicUrl, uploadToR2 } from '@/lib/storage/r2';
import { keyForUrl } from './templateAssets';

// Countdown sound (EventBundle capture.countdownSound): what the iPad plays with the countdown. Account default with
// a per-event override, in the Capture section. null = "Use the iPad's setting": the field is left out of the bundle
// and the attendant picks on the iPad (beeps by default). A custom sound is re-encoded once on upload (mono AAC .m4a,
// 44.1 kHz, ~96 kbit/s, at most 15 s); saving never re-encodes, so the file and its sha256 stay the same and iPads
// don't download it again.

export const COUNTDOWN_STYLES = ['off', 'beeps', 'femaleVoice', 'maleVoice', 'custom'] as const;
export type CountdownStyle = typeof COUNTDOWN_STYLES[number];
export const COUNTDOWN_MAX_SECONDS = 15;
export const COUNTDOWN_SOURCE_MAX_BYTES = 20 * 1024 * 1024;
export const COUNTDOWN_SOURCE_TYPES: Record<string, string> = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/aac': 'aac',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/aiff': 'aiff', 'audio/x-aiff': 'aiff',
};

export const countdownPrefix = (tenantId: string) => `genie-countdown/${tenantId}/`;
export const countdownUploadPrefix = (tenantId: string) => `genie-countdown/${tenantId}/uploads/`;

// What's stored on GenieDefaults.countdownSound / EventGenieSettings.countdownSound (null = use the iPad's setting)
export type StoredCountdownSound =
  | { style: Exclude<CountdownStyle, 'custom'> }
  | { style: 'custom'; custom: { url: string; sha256: string; contentType: 'audio/mp4'; bytes: number; durationMs: number; name: string } };

export function storedCountdownSound(v: unknown): StoredCountdownSound | null {
  const s = v as StoredCountdownSound | null;
  if (!s || typeof s !== 'object' || !(COUNTDOWN_STYLES as readonly string[]).includes(s.style)) return null;
  if (s.style === 'custom' && !(s.custom?.url && s.custom.sha256)) return null;
  return s;
}

// The page's view and save shape: style 'ipad' = "Use the iPad's setting"; custom.url = an encoded file from /encode
export const CountdownSoundPatch = z.object({
  style: z.enum(['ipad', ...COUNTDOWN_STYLES]),
  custom: z.object({ url: z.string().url() }).passthrough().nullable().optional(),
}).strict();
export type CountdownSoundPatch = z.infer<typeof CountdownSoundPatch>;

export function countdownSoundView(v: unknown) {
  const s = storedCountdownSound(v);
  if (!s) return { style: 'ipad' as const, custom: null };
  return { style: s.style, custom: s.style === 'custom' ? { url: s.custom.url, name: s.custom.name, durationMs: s.custom.durationMs, bytes: s.custom.bytes } : null };
}

// Value to save, or an error. A custom sound must be an encoded file this account made.
export async function countdownSoundData(patch: CountdownSoundPatch, current: unknown, tenantId: string): Promise<{ value: StoredCountdownSound | typeof Prisma.DbNull } | { error: string }> {
  if (patch.style === 'ipad') return { value: Prisma.DbNull };
  if (patch.style !== 'custom') return { value: { style: patch.style } };
  const url = patch.custom?.url;
  if (!url) return { error: 'Upload a custom sound, or pick another countdown sound.' };
  const prev = storedCountdownSound(current);
  if (prev?.style === 'custom' && prev.custom.url === url) return { value: prev };
  const f = await countdownFromUrl(url, tenantId);
  return 'error' in f ? f : { value: { style: 'custom', custom: f } };
}

// An encoded file this account made, read back from its stored metadata
async function countdownFromUrl(url: string, tenantId: string): Promise<Extract<StoredCountdownSound, { style: 'custom' }>['custom'] | { error: string }> {
  const key = keyForUrl(url);
  if (!key || key.includes('..') || !key.startsWith(countdownPrefix(tenantId)) || key.startsWith(countdownUploadPrefix(tenantId))) {
    return { error: "That sound isn't in your account's storage. Upload it again." };
  }
  const head = await headR2Object(key);
  const m = head?.metadata ?? {};
  if (!head || !/^[0-9a-f]{64}$/.test(m.sha256 ?? '')) return { error: "That sound can't be found. Upload it again." };
  return { url: r2PublicUrl(key), sha256: m.sha256, contentType: 'audio/mp4', bytes: head.bytes, durationMs: Number(m['duration-ms']) || 0, name: decodeURIComponent(m.name ?? 'Custom sound') };
}

// EventBundle capture.countdownSound; undefined (left out) for "Use the iPad's setting"
export function bundleCountdownSound(v: unknown) {
  const s = storedCountdownSound(v);
  if (!s) return undefined;
  if (s.style !== 'custom') return { style: s.style };
  const { url, sha256, contentType, bytes } = s.custom;
  return { style: 'custom' as const, custom: { url, sha256, contentType, bytes } };
}

// ── Encoding ──────────────────────────────────────────────────────────────────
function ffmpegPath(): string {
  return process.env.FFMPEG_PATH || path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg');
}
function run(args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), ['-hide_banner', '-nostdin', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', d => { stderr = (stderr + d.toString()).slice(-20000); });
    const timer = setTimeout(() => p.kill('SIGKILL'), 120_000);
    p.on('error', err => { clearTimeout(timer); reject(err); });
    p.on('close', code => { clearTimeout(timer); resolve({ code, stderr }); });
  });
}
async function audioDurationMs(file: string): Promise<number | null | 'no-audio'> {
  const { stderr } = await run(['-i', file]);
  if (!/Stream #\d+:\d+.*?: Audio:/.test(stderr)) return 'no-audio';
  const d = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  return d ? Math.round(((Number(d[1]) * 60 + Number(d[2])) * 60 + Number(d[3])) * 1000) : null;
}

export type CountdownEncodeResult = { sound: { url: string; name: string; durationMs: number; bytes: number }; trimmed: boolean };

// Re-encodes an uploaded source to mono AAC .m4a (≤ 15 s) and stores it with its sha256; the source is deleted
export async function encodeCountdownSound(tenantId: string, sourceUrl: string, fileName: string): Promise<CountdownEncodeResult | { error: string }> {
  const key = keyForUrl(sourceUrl);
  if (!key || key.includes('..') || !key.startsWith(countdownUploadPrefix(tenantId))) return { error: "That upload isn't in your account's storage." };
  const obj = await getR2Object(key);
  if (!obj) return { error: "The upload hasn't finished. Try again." };
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'countdown-'));
  try {
    if (obj.body.length > COUNTDOWN_SOURCE_MAX_BYTES) return { error: 'Sounds must be 20 MB or smaller.' };
    const src = path.join(dir, 'source.' + (key.split('.').pop() || 'bin'));
    await fs.writeFile(src, obj.body);
    const length = await audioDurationMs(src);
    if (length === 'no-audio') return { error: "That file has no sound we can read. Use an MP3, M4A, WAV or AIFF." };
    const dst = path.join(dir, 'out.m4a');
    const r = await run(['-y', '-i', src, '-t', String(COUNTDOWN_MAX_SECONDS), '-vn', '-sn', '-dn', '-map_metadata', '-1', '-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', dst]);
    if (r.code !== 0) { console.error('[countdown] encode failed', r.stderr.slice(-2000)); return { error: "That sound couldn't be converted. Try an MP3 or M4A." }; }
    const out = await fs.readFile(dst);
    const outLength = await audioDurationMs(dst);
    const durationMs = typeof outLength === 'number' ? outLength : 0;
    const sha256 = createHash('sha256').update(out).digest('hex');
    const name = fileName.replace(/[^\w .()-]/g, '').slice(0, 80) || 'Custom sound';
    const outKey = countdownPrefix(tenantId) + randomUUID() + '.m4a';
    await uploadToR2(outKey, out, 'audio/mp4', { sha256, 'duration-ms': String(durationMs), name: encodeURIComponent(name) });
    return { sound: { url: r2PublicUrl(outKey), name, durationMs, bytes: out.length }, trimmed: typeof length === 'number' && length > COUNTDOWN_MAX_SECONDS * 1000 + 100 };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    await deleteFromR2(key).catch(err => console.error('[countdown] source cleanup failed', key, err));
  }
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
// A replaced custom sound is deleted once no defaults row and no event uses it (events copy the defaults' file).
export async function deleteUnusedCountdownSounds(urls: (string | undefined | null)[]): Promise<number> {
  const { prisma } = await import('@/lib/prisma/client');
  let deleted = 0;
  for (const key of Array.from(new Set(urls.map(u => (u ? keyForUrl(u) : null)).filter((k): k is string => !!k)))) {
    if (!key.startsWith('genie-countdown/') || key.includes('/uploads/')) continue;
    const pattern = '%' + key.replace(/[\\%_]/g, m => '\\' + m) + '%';
    const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT (
        (SELECT count(*) FROM genie_defaults WHERE "countdownSound"::text LIKE ${pattern})
        + (SELECT count(*) FROM event_genie_settings WHERE "countdownSound"::text LIKE ${pattern})
      ) AS n`;
    if (Number(n) > 0) continue;
    try { await deleteFromR2(key); deleted++; } catch (err) { console.error('[genie] countdown cleanup failed', key, err); }
  }
  return deleted;
}

// Daily: sources whose encode never ran, and encoded files nobody saved within a day
export async function sweepAbandonedCountdownFiles(now = new Date()): Promise<{ sources: number; unsaved: number }> {
  const { listR2Objects } = await import('@/lib/storage/r2');
  const all = await listR2Objects('genie-countdown/');
  let sources = 0;
  for (const o of all) {
    if (!o.key.includes('/uploads/') || now.getTime() - o.lastModified.getTime() < 6 * 3600_000) continue;
    try { await deleteFromR2(o.key); sources++; } catch (err) { console.error('[genie] countdown source cleanup failed', o.key, err); }
  }
  const old = all.filter(o => !o.key.includes('/uploads/') && now.getTime() - o.lastModified.getTime() >= 24 * 3600_000).map(o => r2PublicUrl(o.key));
  const unsaved = await deleteUnusedCountdownSounds(old);
  return { sources, unsaved };
}
