import { z } from 'zod';
import { FONT_OPTIONS, type ColorVariant, type FontPairing, type TextZone } from './clientOptions';

// Template text: boxes on a layout that draw the client's words (a template's Text fields) in the chosen font pairing
// and palette, with an optional outline and drop shadow. The same drawing code runs in the designer, the client portal
// and on the server (the text layer sent to iPads as part of the overlay), so all three look identical. It only uses
// the canvas 2D calls that browsers and @napi-rs/canvas share.

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
// A palette colour (follows the client's palette) or a fixed colour
export const ColorRef = z.union([z.enum(['text', 'accent', 'background']), hex]);
export type ColorRef = z.infer<typeof ColorRef>;

export const TextBox = z.object({
  id: z.string().min(1).max(64),
  zoneId: z.string().min(1).max(64), // the template's Text field it shows
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive(),
  rotationDegrees: z.number().min(-180).max(180),
  align: z.enum(['left', 'center', 'right']),
  color: ColorRef,
  maxFontPx: z.number().int().min(8).max(1000), // largest size; long text shrinks to fit the box
  fontId: z.string().max(40).optional(), // used when the template has no font pairings
  outline: z.object({ enabled: z.boolean(), color: ColorRef, widthPx: z.number().min(0).max(60) }).strict(),
  shadow: z.object({
    enabled: z.boolean(), color: ColorRef, opacity: z.number().min(0).max(1),
    blurPx: z.number().min(0).max(100), distancePx: z.number().min(0).max(100), angleDegrees: z.number().min(-180).max(180),
  }).strict(),
}).strict();
export type TextBox = z.infer<typeof TextBox>;

export const SHADOW_PRESETS = {
  soft: { color: '#000000', opacity: 0.4, blurPx: 12, distancePx: 6, angleDegrees: 45 },
  hard: { color: '#000000', opacity: 0.7, blurPx: 0, distancePx: 6, angleDegrees: 45 },
  glow: { color: '#FFFFFF', opacity: 0.9, blurPx: 24, distancePx: 0, angleDegrees: 0 },
} as const;

export function newTextBox(id: string, zoneId: string, canvas: { widthPx: number; heightPx: number }): TextBox {
  const width = Math.round(canvas.widthPx * 0.6), height = Math.round(Math.min(canvas.heightPx * 0.12, width / 3));
  return {
    id, zoneId, x: Math.round((canvas.widthPx - width) / 2), y: Math.round(canvas.heightPx - height - canvas.heightPx * 0.06), width, height,
    rotationDegrees: 0, align: 'center', color: 'text', maxFontPx: Math.max(8, Math.round(height * 0.7)),
    outline: { enabled: false, color: 'accent', widthPx: 3 },
    shadow: { enabled: false, ...SHADOW_PRESETS.soft },
  };
}

// What the client (or operator) changed on a box: outline/shadow on or off, size up or down
export const TextAdjust = z.object({ outline: z.boolean().optional(), shadow: z.boolean().optional(), scale: z.number().min(0.5).max(2).optional() }).strict();
export type TextAdjust = z.infer<typeof TextAdjust>;
export const TEXT_SCALE_STEPS = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6] as const;

export type Colors = ColorVariant['colors'];
// Used when the template has no colour palettes
export const DEFAULT_TEXT_COLORS: Colors = { background: '#FFFFFF', text: '#1F1F3D', accent: '#B8860B' };

export type TextLook = { colors: Colors; pairing: FontPairing | null; adjust?: Record<string, TextAdjust> };

// The font family the drawing code loads each font under (BoothGen-hosted files, never the CSS families)
export const fontFamilyFor = (fontId: string) => `BGT-${FONT_OPTIONS.some(f => f.id === fontId) ? fontId : 'montserrat'}`;
export const fontFileFor = (fontId: string) => `/fonts/template/${FONT_OPTIONS.some(f => f.id === fontId) ? fontId : 'montserrat'}.ttf`;

export function boxFontId(box: TextBox, pairing: FontPairing | null): string {
  return pairing?.fonts.find(f => f.zoneId === box.zoneId)?.fontId ?? box.fontId ?? 'montserrat';
}

export function resolveColor(ref: ColorRef, colors: Colors): string {
  return ref === 'text' || ref === 'accent' || ref === 'background' ? colors[ref] : ref;
}

function rgba(hexColor: string, opacity: number): string {
  const n = parseInt(hexColor.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${opacity})`;
}

// The canvas 2D calls the drawing uses (browser and @napi-rs/canvas)
export type Ctx2D = {
  font: string; fillStyle: unknown; strokeStyle: unknown; lineWidth: number; lineJoin: string; textAlign: string; textBaseline: string;
  shadowColor: string; shadowBlur: number; shadowOffsetX: number; shadowOffsetY: number; globalAlpha: number;
  save(): void; restore(): void; translate(x: number, y: number): void; rotate(a: number): void; scale(x: number, y: number): void;
  fillText(t: string, x: number, y: number): void; strokeText(t: string, x: number, y: number): void;
  measureText(t: string): { width: number }; clearRect(x: number, y: number, w: number, h: number): void;
  drawImage(img: any, x: number, y: number, w?: number, h?: number): void;
};
export type CanvasLike = { width: number; height: number; getContext(type: '2d'): any };
export type MakeCanvas = (w: number, h: number) => CanvasLike;

const LINE_HEIGHT = 1.2;
const MIN_FONT_PX = 6;

function wrap(ctx: Ctx2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) { out.push(''); continue; }
    let line = words[0];
    for (const w of words.slice(1)) {
      const t = line + ' ' + w;
      if (ctx.measureText(t).width <= maxWidth) line = t;
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

// The largest size (up to the box's, times the client's adjustment) at which the text fits the box, and its lines
export function fitText(ctx: Ctx2D, text: string, family: string, box: Pick<TextBox, 'width' | 'height' | 'maxFontPx'>, scale = 1): { size: number; lines: string[] } {
  let size = Math.max(MIN_FONT_PX, box.maxFontPx * scale);
  for (;;) {
    ctx.font = `${size}px "${family}"`;
    const lines = wrap(ctx, text, box.width);
    const fits = lines.length * size * LINE_HEIGHT <= box.height + 0.5 && lines.every(l => ctx.measureText(l).width <= box.width + 0.5);
    if (fits || size <= MIN_FONT_PX) return { size, lines };
    size = Math.max(MIN_FONT_PX, Math.floor(size * 0.95));
  }
}

// Draws one box's text (outline under the fill) at layout coordinates, no shadow
function drawBoxText(ctx: Ctx2D, box: TextBox, text: string, look: TextLook) {
  const adjust = look.adjust?.[box.id] ?? {};
  const family = fontFamilyFor(boxFontId(box, look.pairing));
  const { size, lines } = fitText(ctx, text, family, box, adjust.scale ?? 1);
  const k = size / box.maxFontPx; // effects follow the text's size
  const outlineOn = adjust.outline ?? box.outline.enabled;
  ctx.save();
  ctx.translate(box.x + box.width / 2, box.y + box.height / 2);
  ctx.rotate(box.rotationDegrees * Math.PI / 180);
  ctx.font = `${size}px "${family}"`;
  ctx.textAlign = box.align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const x = box.align === 'left' ? -box.width / 2 : box.align === 'right' ? box.width / 2 : 0;
  const top = -(lines.length * size * LINE_HEIGHT) / 2 + size * LINE_HEIGHT / 2;
  lines.forEach((line, i) => {
    const y = top + i * size * LINE_HEIGHT;
    if (outlineOn && box.outline.widthPx > 0) {
      ctx.strokeStyle = resolveColor(box.outline.color, look.colors);
      ctx.lineWidth = box.outline.widthPx * 2 * k; // half of the stroke sits under the fill
      ctx.strokeText(line, x, y);
    }
    ctx.fillStyle = resolveColor(box.color, look.colors);
    ctx.fillText(line, x, y);
  });
  ctx.restore();
  return k;
}

// Draws every box that has text onto ctx (sized widthPx × heightPx × scale). values: Text field id → text; boxes
// whose field is empty are left out. Shadows are drawn from a copy of each box's text, so an outlined box casts one
// shadow, not two.
export function drawTextLayer(ctx: Ctx2D, layout: { widthPx: number; heightPx: number; texts?: TextBox[] }, values: Record<string, string>, look: TextLook, makeCanvas: MakeCanvas, scale = 1) {
  for (const box of layout.texts ?? []) {
    const text = (values[box.zoneId] ?? '').trim();
    if (!text) continue;
    const adjust = look.adjust?.[box.id] ?? {};
    const shadowOn = (adjust.shadow ?? box.shadow.enabled) && box.shadow.opacity > 0;
    if (!shadowOn) {
      ctx.save(); ctx.scale(scale, scale); drawBoxText(ctx, box, text, look); ctx.restore();
      continue;
    }
    const w = Math.max(1, Math.round(layout.widthPx * scale)), h = Math.max(1, Math.round(layout.heightPx * scale));
    const layer = makeCanvas(w, h);
    const lctx = layer.getContext('2d') as Ctx2D;
    lctx.scale(scale, scale);
    const k = drawBoxText(lctx, box, text, look);
    const a = box.shadow.angleDegrees * Math.PI / 180, d = box.shadow.distancePx * k * scale;
    ctx.save();
    ctx.shadowColor = rgba(resolveColor(box.shadow.color, look.colors), box.shadow.opacity);
    ctx.shadowBlur = box.shadow.blurPx * k * scale;
    ctx.shadowOffsetX = Math.cos(a) * d;
    ctx.shadowOffsetY = Math.sin(a) * d;
    ctx.drawImage(layer, 0, 0, w, h);
    ctx.restore();
  }
}

// ── Which words, palette and fonts ─────────────────────────────────────────────
export const labelKey = (label: string) => label.trim().toLowerCase().replace(/\s+/g, ' ');

// Sample words for previews: the field's placeholder, else its label
export function sampleValues(zones: TextZone[]): Record<string, string> {
  return Object.fromEntries(zones.map(z => [z.id, z.placeholder?.trim() || z.label]));
}

// The event's words for a template: its fields matched by label to the event's answers (labelKey → text)
export function valuesFor(zones: TextZone[], answers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const z of zones) {
    const v = answers[labelKey(z.label)];
    if (v?.trim()) out[z.id] = v;
  }
  return out;
}

// A chosen palette/pairing by id, else one with the same name as the client's choice on their brief layout, else the first
export function pickByIdOrName<T extends { id: string; name: string }>(list: T[], id?: string | null, name?: string | null): T | null {
  return list.find(x => x.id === id) ?? (name ? list.find(x => x.name.trim().toLowerCase() === name.trim().toLowerCase()) : undefined) ?? list[0] ?? null;
}
