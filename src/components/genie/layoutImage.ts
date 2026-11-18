'use client';
import { artUrl, type Layout } from './parts';

// Drawing a layout to a PNG in the browser: the designer's saved thumbnail, and the full-size guide operators
// download to design artwork on (Designer → Download, event Designs tab → Download layout)

// Printers can trim up to 1/8 inch at the edges; keep faces and text inside this line
export const SAFE_INCH = 0.125;
const round = (n: number) => Math.round(n);

// Sample photos for the preview: soft gradients with a simple figure, drawn once
const SAMPLE_COLORS = [['#F8B26A', '#E8618C'], ['#6CC3D5', '#3E6FB0'], ['#9BD08C', '#3F8F6B'], ['#C9A7EB', '#7155B7']];
export function makeSample(i: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = 600; c.height = 600;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 600, 600);
  grad.addColorStop(0, SAMPLE_COLORS[i % 4][0]); grad.addColorStop(1, SAMPLE_COLORS[i % 4][1]);
  g.fillStyle = grad; g.fillRect(0, 0, 600, 600);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath(); g.arc(300, 250, 95, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(300, 560, 190, 170, 0, Math.PI, 0); g.fill();
  return c;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img); img.onerror = reject; img.src = src;
  });
}

// Draws the layout with sample photos: small for the saved thumbnail, or full size (with the safe line, without the overlay) to design artwork on
export async function renderThumbnail(l: Layout, samples: HTMLCanvasElement[], fullSize = false): Promise<Blob | null> {
  const scale = fullSize ? 1 : 480 / Math.max(l.widthPx, l.heightPx);
  const c = document.createElement('canvas'); c.width = round(l.widthPx * scale); c.height = round(l.heightPx * scale);
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  g.fillStyle = l.backgroundColor; g.fillRect(0, 0, l.widthPx, l.heightPx);
  // Artwork the viewer can't load (e.g. no access to its storage) is left out rather than failing the image
  const bg = l.background ? await loadImage(artUrl(l.background.url)).catch(() => null) : null;
  if (bg) g.drawImage(bg, 0, 0, l.widthPx, l.heightPx);
  for (const s of l.slots) {
    g.save();
    g.translate(s.x + s.width / 2, s.y + s.height / 2); g.rotate(s.rotationDegrees * Math.PI / 180);
    const img = samples[s.shotIndex % samples.length];
    const k = s.fit === 'fill' ? Math.max(s.width / img.width, s.height / img.height) : Math.min(s.width / img.width, s.height / img.height);
    g.beginPath(); g.rect(-s.width / 2, -s.height / 2, s.width, s.height); g.clip();
    g.drawImage(img, -img.width * k / 2, -img.height * k / 2, img.width * k, img.height * k);
    g.restore();
  }
  if (fullSize) {
    // Boomerang & GIF sizes aren't printed, so no safe line
    if (l.format !== 'square' && l.format !== '9x16') {
      const safe = SAFE_INCH * l.dpi;
      g.strokeStyle = '#E2445C'; g.lineWidth = 3; g.setLineDash([18, 12]);
      g.strokeRect(safe, safe, l.widthPx - 2 * safe, l.heightPx - 2 * safe);
    }
  } else if (l.overlay) g.drawImage(await loadImage(artUrl(l.overlay.url)), 0, 0, l.widthPx, l.heightPx);
  return new Promise(resolve => { try { c.toBlob(b => resolve(b), 'image/png'); } catch { resolve(null); } });
}


// Saves the full-size guide (sample photos + safe line, no overlay) as <name>-<w>x<h>.png
export async function downloadLayoutPng(layout: Layout, name: string): Promise<boolean> {
  const samples = [0, 1, 2, 3].map(makeSample);
  const blob = await renderThumbnail(layout, samples, true).catch(() => null);
  if (!blob) return false;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(name.trim() || 'layout').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-')}-${layout.widthPx}x${layout.heightPx}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return true;
}

// Where a background sits when it's a different shape: 0–1 along each overflowing side (0.5 = centred)
export type BackgroundFocus = { x: number; y: number };

// A background image at any shape, made to fill the layout with no gaps: scaled up or down to cover it, placed at
// `focus` (centred by default), with the edges that don't fit trimmed off. Images already the layout's shape come
// back unchanged.
export async function coverBackground(file: File, canvas: { widthPx: number; heightPx: number }, focus: BackgroundFocus = { x: 0.5, y: 0.5 }): Promise<{ blob: Blob; contentType: string; notice?: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const W = canvas.widthPx, H = canvas.heightPx, w = img.naturalWidth, h = img.naturalHeight;
    if (sameShape({ width: w, height: h }, canvas)) return { blob: file, contentType: file.type };
    const k = Math.max(W / w, H / h); // cover
    const sw = W / k, sh = H / k, sx = (w - sw) * focus.x, sy = (h - sh) * focus.y;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    const contentType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, contentType, 0.92));
    if (!blob) throw new Error('That image could not be resized. Try a PNG or JPG.');
    const trimmed = w / h > W / H ? 'left and right' : 'top and bottom';
    return { blob, contentType, notice: `The image was ${w}×${h}, so it was ${k > 1 ? 'enlarged' : 'resized'} to cover the ${W}×${H} layout; the ${trimmed} edges that don't fit were trimmed.${k > 1.05 ? ' It was smaller than the print size, so it may print soft.' : ''}` };
  } finally { URL.revokeObjectURL(url); }
}

export const sameShape = (img: { width: number; height: number }, canvas: { widthPx: number; heightPx: number }) =>
  Math.abs((img.width / img.height) / (canvas.widthPx / canvas.heightPx) - 1) <= 0.02;

// An image file's pixel size (to decide whether it needs positioning)
export async function imageSize(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try { const img = await loadImage(url); return { width: img.naturalWidth, height: img.naturalHeight }; }
  catch { throw new Error('That image could not be read. Try a PNG or JPG.'); }
  finally { URL.revokeObjectURL(url); }
}
