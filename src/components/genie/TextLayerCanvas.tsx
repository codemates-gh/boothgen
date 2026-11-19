'use client';
import { useEffect, useRef, useState } from 'react';
import { boxFontId, drawTextLayer, fontFamilyFor, fontFileFor, type TextBox, type TextLook } from '@/lib/templates/textLayer';

// Template text drawn in the browser with the same code and font files as the iPad's overlay (src/lib/genie/textRender.ts)

const loading = new Map<string, Promise<void>>();
export function loadTemplateFont(fontId: string): Promise<void> {
  const family = fontFamilyFor(fontId);
  let p = loading.get(family);
  if (!p) {
    const face = new FontFace(family, `url(${fontFileFor(fontId)})`);
    p = face.load().then(f => { document.fonts.add(f); }).catch(() => {});
    loading.set(family, p);
  }
  return p;
}

const makeCanvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// A transparent canvas the size of the layout on screen (width × height px), with the text drawn on it
export function TextLayerCanvas({ layout, values, look, width, className = '' }: {
  layout: { widthPx: number; heightPx: number; texts?: TextBox[] }; values: Record<string, string>; look: TextLook; width: number; className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [fontsReady, setFontsReady] = useState(0);
  const scale = width / layout.widthPx, height = layout.heightPx * scale;
  const dpr = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const fontIds = [...new Set((layout.texts ?? []).map(b => boxFontId(b, look.pairing)))].join(',');

  useEffect(() => {
    let live = true;
    Promise.all(fontIds.split(',').filter(Boolean).map(loadTemplateFont)).then(() => { if (live) setFontsReady(n => n + 1); });
    return () => { live = false; };
  }, [fontIds]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = Math.max(1, Math.round(width * dpr)); c.height = Math.max(1, Math.round(height * dpr));
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    drawTextLayer(ctx as any, layout, values, look, makeCanvas, scale * dpr);
  }, [layout, values, look, width, height, scale, dpr, fontsReady]);

  if (!layout.texts?.length) return null;
  return <canvas ref={ref} className={'absolute left-0 top-0 pointer-events-none ' + className} style={{ width, height }}/>;
}
