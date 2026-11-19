import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

// Any JPEG/PNG/WebP → a JPEG at most maxSide px on the long side (white under any transparency), with its size
export async function toJpeg(input: Buffer, maxSide: number, quality = 3): Promise<{ body: Buffer; width: number; height: number } | null> {
  const { run, probe } = await import('../attractEncode');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-img-'));
  try {
    const src = path.join(dir, 'in'), out = path.join(dir, 'out.jpg');
    await fs.writeFile(src, input);
    const fit = `scale=w='min(${maxSide},iw)':h='min(${maxSide},ih)':force_original_aspect_ratio=decrease`;
    const vf = `${fit},format=rgba,split[fg][w];[w]drawbox=x=0:y=0:w=iw:h=ih:color=white@1:t=fill[bg];[bg][fg]overlay=format=auto,format=yuvj420p`;
    const r = await run(['-y', '-i', src, '-filter_complex', vf, '-frames:v', '1', '-q:v', String(quality), out]);
    if (r.code !== 0) { console.error('[ai-image] convert failed', r.stderr.slice(-1500)); return null; }
    const size = await probe(out);
    if (!size) return null;
    return { body: await fs.readFile(out), width: size.width, height: size.height };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
