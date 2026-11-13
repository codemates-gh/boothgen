import { spawn } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { deleteFromR2, getR2Object, r2PublicUrl, uploadToR2 } from '@/lib/storage/r2';
import { keyForUrl } from './templateAssets';
import {
  ATTRACT_IMAGE_SOURCE_MAX_BYTES, ATTRACT_MAX_SECONDS, ATTRACT_SOURCE_TYPES, ATTRACT_VIDEO_MAX_BYTES, ATTRACT_VIDEO_SOURCE_MAX_BYTES,
  attractMetadata, attractPrefix, attractUploadPrefix, type AttractMedia,
} from './attract';

// Shrinks an attract-screen upload for the iPad, once:
// - image: at most 2048 px on the long side, JPEG (quality about 80), aiming under 1 MB
// - video: H.264 MP4, at most 1080 on the short side, at most 30 fps, about 3.5 Mbit/s, no audio, faststart, first 30 s
// ffmpeg comes from the ffmpeg-static package (traced into the encode route's function, see next.config.js).

const FFMPEG_TIMEOUT_MS = 240_000;
const IMAGE_TARGET_BYTES = 1024 * 1024;

function ffmpegPath(): string {
  return process.env.FFMPEG_PATH || path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg');
}

function run(args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), ['-hide_banner', '-nostdin', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', d => { stderr = (stderr + d.toString()).slice(-20000); });
    const timer = setTimeout(() => p.kill('SIGKILL'), FFMPEG_TIMEOUT_MS);
    p.on('error', err => { clearTimeout(timer); reject(err); });
    p.on('close', code => { clearTimeout(timer); resolve({ code, stderr }); });
  });
}

type Probe = { durationMs: number | null; width: number; height: number; fps: number | null } | null;

// What ffmpeg reports for a file (its first video stream), or null when there's no picture in it
async function probe(file: string): Promise<Probe> {
  const { stderr } = await run(['-i', file]);
  const v = stderr.match(/Stream #\d+:\d+.*?: Video: .*?, (\d{2,5})x(\d{2,5})/);
  if (!v) return null;
  const d = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  const line = stderr.slice(v.index!).split('\n')[0];
  const fps = line.match(/, (\d+(?:\.\d+)?) fps/);
  return {
    width: Number(v[1]), height: Number(v[2]),
    durationMs: d ? Math.round(((Number(d[1]) * 60 + Number(d[2])) * 60 + Number(d[3])) * 1000) : null,
    fps: fps ? Number(fps[1]) : null,
  };
}

export type EncodeResult = { attract: AttractMedia; sourceBytes: number; trimmed: boolean };

export async function encodeAttract(tenantId: string, sourceUrl: string): Promise<EncodeResult | { error: string }> {
  const key = keyForUrl(sourceUrl);
  if (!key || key.includes('..') || !key.startsWith(attractUploadPrefix(tenantId))) return { error: "That upload isn't in your account's storage." };
  const ext = key.split('.').pop();
  const type = Object.values(ATTRACT_SOURCE_TYPES).find(t => t.ext === ext);
  if (!type) return { error: 'Use a JPG or PNG image, or an MP4 or MOV video.' };
  const obj = await getR2Object(key);
  if (!obj) return { error: "The upload hasn't finished. Try again." };
  const max = type.kind === 'image' ? ATTRACT_IMAGE_SOURCE_MAX_BYTES : ATTRACT_VIDEO_SOURCE_MAX_BYTES;
  if (obj.body.length > max) {
    await deleteFromR2(key).catch(() => {});
    return { error: type.kind === 'image' ? 'Images must be 20 MB or smaller.' : 'Videos must be 200 MB or smaller.' };
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'attract-'));
  try {
    const src = path.join(dir, 'source.' + type.ext);
    await fs.writeFile(src, obj.body);
    const info = await probe(src);
    if (!info) return { error: type.kind === 'image' ? "That image couldn't be read. Use a JPG or PNG." : "That video couldn't be read. Use an MP4 or MOV (H.264 or HEVC)." };

    let out: Buffer, trimmed = false;
    if (type.kind === 'image') {
      // ffmpeg applies a phone photo's EXIF orientation itself
      const vf = "scale=w='min(2048,iw)':h='min(2048,ih)':force_original_aspect_ratio=decrease,format=yuvj420p";
      const dst = path.join(dir, 'out.jpg');
      // Quality about 80 first; a busy image that's still over 1 MB goes a little lower
      for (const q of [4, 6, 9]) {
        const r = await run(['-y', '-i', src, '-vf', vf, '-frames:v', '1', '-q:v', String(q), dst]);
        if (r.code !== 0) { console.error('[attract] image encode failed', r.stderr.slice(-2000)); return { error: "That image couldn't be converted. Try a different file." }; }
        out = await fs.readFile(dst);
        if (out.length <= IMAGE_TARGET_BYTES) break;
      }
    } else {
      if (info.durationMs !== null && info.durationMs < 500) return { error: 'That video is too short to loop. Use 10–20 seconds.' };
      trimmed = info.durationMs !== null && info.durationMs > ATTRACT_MAX_SECONDS * 1000 + 100;
      // Short side at most 1080, even dimensions (the rotation from phone videos is already applied here)
      const scale = "scale='if(gte(iw,ih),-2,min(1080,trunc(iw/2)*2))':'if(gte(iw,ih),min(1080,trunc(ih/2)*2),-2)'";
      const vf = [scale, info.fps && info.fps > 30.5 ? 'fps=30' : null, 'format=yuv420p'].filter(Boolean).join(',');
      const dst = path.join(dir, 'out.mp4');
      const r = await run([
        '-y', '-i', src, '-t', String(ATTRACT_MAX_SECONDS), '-map', '0:v:0', '-an', '-sn', '-dn', '-map_metadata', '-1', '-vf', vf,
        '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high', '-crf', '23', '-maxrate', '3500k', '-bufsize', '7000k',
        '-movflags', '+faststart', dst,
      ]);
      if (r.code !== 0) { console.error('[attract] video encode failed', r.stderr.slice(-2000)); return { error: "That video couldn't be converted. Try exporting it as an MP4 first." }; }
      out = await fs.readFile(dst);
      if (out.length > ATTRACT_VIDEO_MAX_BYTES) return { error: 'Even shrunk, that video is over 15 MB. Use a shorter loop (10–20 seconds).' };
    }

    const kind = type.kind;
    const dst = path.join(dir, kind === 'image' ? 'out.jpg' : 'out.mp4');
    const outInfo = await probe(dst);
    const attract: AttractMedia = {
      media: { url: '', sha256: createHash('sha256').update(out!).digest('hex'), contentType: kind === 'image' ? 'image/jpeg' : 'video/mp4', bytes: out!.length },
      kind, width: outInfo?.width ?? 0, height: outInfo?.height ?? 0,
      ...(kind === 'video' && outInfo?.durationMs ? { durationMs: outInfo.durationMs } : {}),
    };
    const outKey = attractPrefix(tenantId) + randomUUID() + (kind === 'image' ? '.jpg' : '.mp4');
    await uploadToR2(outKey, out!, attract.media.contentType, attractMetadata(attract));
    attract.media.url = r2PublicUrl(outKey);
    return { attract, sourceBytes: obj.body.length, trimmed };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    // The source is only needed for this one encode, whether it worked or not
    await deleteFromR2(key).catch(err => console.error('[attract] source cleanup failed', key, err));
  }
}
