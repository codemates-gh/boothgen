import { createHash } from 'crypto';
import path from 'path';
import { readFile } from 'fs/promises';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { boxFontId, drawTextLayer, fontFamilyFor, fontFileFor, type TextLook } from '@/lib/templates/textLayer';
import { getR2Object, headR2Object, r2KeyForPublicUrl, r2PublicUrl, uploadToR2 } from '@/lib/storage/r2';
import { appUrl } from './urls';
import type { StoredLayout } from './schemas';
import type { RemoteAsset } from './templateAssets';

// Template text drawn on the server: the layout's overlay artwork with the event's words on top, as one PNG the iPad
// uses as the overlay. Files are named by what's in them, so the same words and look are drawn once and reused.

const RENDER_VERSION = 1;
const registered = new Set<string>();

// Fonts come from public/fonts/template (in the deployment, else from the site itself)
async function ensureFont(fontId: string) {
  const family = fontFamilyFor(fontId);
  if (registered.has(family)) return;
  const file = fontFileFor(fontId);
  let buf: Buffer;
  try {
    buf = await readFile(path.join(process.cwd(), 'public', file));
  } catch {
    const r = await fetch(appUrl() + file);
    if (!r.ok) throw new Error(`Font ${fontId} could not be loaded`);
    buf = Buffer.from(await r.arrayBuffer());
  }
  GlobalFonts.register(buf, family);
  registered.add(family);
}

async function readArt(url: string): Promise<Buffer> {
  const key = r2KeyForPublicUrl(url);
  const obj = key ? await getR2Object(key) : null;
  if (obj) return obj.body;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Overlay artwork could not be read');
  return Buffer.from(await r.arrayBuffer());
}

// The overlay artwork with the text on top, as a PNG, or null when no box has words
export async function renderTextOverlay(layout: StoredLayout, values: Record<string, string>, look: TextLook): Promise<Buffer | null> {
  const boxes = (layout.texts ?? []).filter(b => values[b.zoneId]?.trim());
  if (boxes.length === 0) return null;
  await Promise.all([...new Set(boxes.map(b => boxFontId(b, look.pairing)))].map(ensureFont));
  const canvas = createCanvas(layout.widthPx, layout.heightPx);
  const ctx = canvas.getContext('2d');
  if (layout.overlay) ctx.drawImage(await loadImage(await readArt(layout.overlay.url)), 0, 0, layout.widthPx, layout.heightPx);
  drawTextLayer(ctx as any, { ...layout, texts: boxes }, values, look, (w, h) => createCanvas(w, h) as any);
  return canvas.toBuffer('image/png');
}

// What decides the picture (a change to any of it makes a new file)
export function textOverlayKey(layout: StoredLayout, values: Record<string, string>, look: TextLook): string | null {
  const boxes = (layout.texts ?? []).filter(b => values[b.zoneId]?.trim());
  if (boxes.length === 0) return null;
  const used = Object.fromEntries(boxes.map(b => [b.zoneId, values[b.zoneId]]));
  const fonts = Object.fromEntries(boxes.map(b => [b.id, boxFontId(b, look.pairing)]));
  const adjust = Object.fromEntries(boxes.map(b => [b.id, look.adjust?.[b.id] ?? null]));
  return createHash('sha256').update(JSON.stringify({
    v: RENDER_VERSION, w: layout.widthPx, h: layout.heightPx, overlay: layout.overlay?.sha256 ?? null, boxes, used, fonts, colors: look.colors, adjust,
  })).digest('hex');
}

// Remembered for a few minutes only: the nightly cleanup (storageSweep.ts) may delete a file, and it's drawn again
const cache = new Map<string, { asset: RemoteAsset; at: number }>();
const CACHE_MS = 10 * 60_000;
export const textOverlayR2Key = (tenantId: string, key: string) => `genie-templates/${tenantId}/text/${key}.png`;

// The text overlay for a layout as a RemoteAsset (drawn and stored the first time), or null when no box has words
export async function textOverlayAsset(tenantId: string, layout: StoredLayout, values: Record<string, string>, look: TextLook): Promise<RemoteAsset | null> {
  const key = textOverlayKey(layout, values, look);
  if (!key) return null;
  const r2Key = textOverlayR2Key(tenantId, key);
  const hit = cache.get(r2Key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.asset;
  const head = await headR2Object(r2Key);
  if (head?.metadata?.sha256) {
    const asset: RemoteAsset = { url: r2PublicUrl(r2Key), sha256: head.metadata.sha256, contentType: 'image/png', bytes: head.bytes };
    cache.set(r2Key, { asset, at: Date.now() });
    return asset;
  }
  const png = await renderTextOverlay(layout, values, look);
  if (!png) return null;
  const sha256 = createHash('sha256').update(png).digest('hex');
  const url = await uploadToR2(r2Key, png, 'image/png', { sha256 });
  const asset: RemoteAsset = { url, sha256, contentType: 'image/png', bytes: png.length };
  cache.set(r2Key, { asset, at: Date.now() });
  return asset;
}
