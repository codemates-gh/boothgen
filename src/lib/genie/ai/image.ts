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

// A placeholder sample: a soft two-color gradient (colors from the seed), JPEG, size × size. No text: the iPad shows the
// theme's name under its picture.
export async function placeholderJpeg(seed: string, size = 800): Promise<Buffer | null> {
  const { run } = await import('../attractEncode');
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const PALETTE = ['6d28d9', 'db2777', 'f97316', '0ea5e9', '10b981', 'eab308', '4f46e5', 'e11d48', '14b8a6', '9333ea'];
  const c0 = PALETTE[h % PALETTE.length], c1 = PALETTE[(h >>> 8) % PALETTE.length] === c0 ? PALETTE[(h + 3) % PALETTE.length] : PALETTE[(h >>> 8) % PALETTE.length];
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-ph-'));
  try {
    const out = path.join(dir, 'out.jpg');
    const r = await run(['-y', '-f', 'lavfi', '-i', `gradients=s=${size}x${size}:c0=0x${c0}:c1=0x${c1}:x0=0:y0=0:x1=${size}:y1=${size}:nb_colors=2:d=1`, '-frames:v', '1', '-q:v', '3', out]);
    if (r.code !== 0) { console.error('[ai-image] placeholder failed', r.stderr.slice(-800)); return null; }
    return await fs.readFile(out);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
