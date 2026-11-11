'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus, Copy, Trash2, AlignCenterHorizontal, AlignCenterVertical, AlignHorizontalSpaceAround, AlignVerticalSpaceAround, Upload, X, Eye, Pencil, AlertTriangle, RotateCw } from 'lucide-react';
import { Field, Layout, RemoteAsset, Slot, Toggle, artUrl } from '@/components/genie/parts';

const PRESETS = [
  { id: '4x6-landscape', label: '4×6 landscape', format: '4x6', orientation: 'landscape', widthPx: 1800, heightPx: 1200 },
  { id: '4x6-portrait', label: '4×6 portrait', format: '4x6', orientation: 'portrait', widthPx: 1200, heightPx: 1800 },
  { id: '2x6-portrait', label: '2×6 strip', format: '2x6', orientation: 'portrait', widthPx: 600, heightPx: 1800 },
] as const;
type Preset = typeof PRESETS[number];
const presetOf = (l: Layout) => PRESETS.find(p => p.format === l.format && p.orientation === l.orientation) ?? PRESETS[0];
const otherOrientation = (p: Preset) => PRESETS.find(q => q.format === p.format && q.orientation !== p.orientation) ?? null;

const MIN = 40; // smallest frame side in px
const round = (n: number) => Math.round(n);
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const newId = () => 'f' + Math.random().toString(36).slice(2, 8);

// Frame shapes. A frame whose size matches one keeps that shape while resizing.
const RATIOS = [
  { id: '3:4', label: '3:4 portrait', r: 3 / 4 },
  { id: '4:3', label: '4:3 landscape', r: 4 / 3 },
  { id: '1:1', label: '1:1 square', r: 1 },
  { id: '9:16', label: '9:16 portrait', r: 9 / 16 },
  { id: '16:9', label: '16:9 landscape', r: 16 / 9 },
] as const;
const ratioOf = (s: Pick<Slot, 'width' | 'height'>) => RATIOS.find(q => Math.abs(s.width / s.height - q.r) / q.r < 0.01) ?? null;

// The same frame in a new shape: about the same area, same center, inside the canvas
function reshape(s: Slot, r: number, W: number, H: number): Slot {
  let w = Math.sqrt(s.width * s.height * r), h = w / r;
  const k = Math.min(1, W / w, H / h); w *= k; h *= k;
  const up = Math.max(1, MIN / w, MIN / h); w *= up; h *= up;
  const width = round(w), height = round(width / r);
  return { ...s, width, height, x: round(clamp(s.x + s.width / 2 - width / 2, 0, W - width)), y: round(clamp(s.y + s.height / 2 - height / 2, 0, H - height)) };
}

// Starting frames for a size: 3 photos laid out the usual way
function defaultSlots(p: Preset): Slot[] {
  const m = p.format === '2x6' ? 30 : 60;
  if (p.format === '2x6') {
    const h = (p.heightPx - m * 5) / 4;
    return [0, 1, 2].map(i => ({ id: newId(), shotIndex: i, x: m, y: m + i * (h + m), width: p.widthPx - 2 * m, height: round(h), rotationDegrees: 0, fit: 'fill' }));
  }
  if (p.orientation === 'landscape') {
    const big = { id: newId(), shotIndex: 0, x: m, y: m, width: 1050, height: p.heightPx - 2 * m, rotationDegrees: 0, fit: 'fill' as const };
    const w = p.widthPx - big.width - 3 * m, h = (p.heightPx - 3 * m) / 2;
    return [big, ...[1, 2].map(i => ({ id: newId(), shotIndex: i, x: big.width + 2 * m, y: m + (i - 1) * (h + m), width: w, height: round(h), rotationDegrees: 0, fit: 'fill' as const }))];
  }
  const h = (p.heightPx - 4 * m - 200) / 3;
  return [0, 1, 2].map(i => ({ id: newId(), shotIndex: i, x: m, y: m + i * (h + m), width: p.widthPx - 2 * m, height: round(h), rotationDegrees: 0, fit: 'fill' }));
}

function blankLayout(p: Preset): Layout {
  return { format: p.format, orientation: p.orientation, widthPx: p.widthPx, heightPx: p.heightPx, dpi: 300, backgroundColor: '#FFFFFF', slots: defaultSlots(p) };
}

// Same frames on a different canvas size, scaled to fit; artwork is dropped (it no longer matches)
function resize(l: Layout, p: Preset): Layout {
  const sx = p.widthPx / l.widthPx, sy = p.heightPx / l.heightPx;
  const { background: _b, overlay: _o, ...rest } = l;
  return {
    ...rest, format: p.format, orientation: p.orientation, widthPx: p.widthPx, heightPx: p.heightPx,
    slots: l.slots.map(s => ({ ...s, x: round(s.x * sx), y: round(s.y * sy), width: Math.max(MIN, round(s.width * sx)), height: Math.max(MIN, round(s.height * sy)) })),
  };
}

// Sample photos for the preview: soft gradients with a simple figure, drawn once
const SAMPLE_COLORS = [['#F8B26A', '#E8618C'], ['#6CC3D5', '#3E6FB0'], ['#9BD08C', '#3F8F6B'], ['#C9A7EB', '#7155B7']];
function makeSample(i: number): HTMLCanvasElement {
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

// Draws the layout with sample photos; used for the saved thumbnail
async function renderThumbnail(l: Layout, samples: HTMLCanvasElement[]): Promise<Blob | null> {
  const scale = 480 / Math.max(l.widthPx, l.heightPx);
  const c = document.createElement('canvas'); c.width = round(l.widthPx * scale); c.height = round(l.heightPx * scale);
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  g.fillStyle = l.backgroundColor; g.fillRect(0, 0, l.widthPx, l.heightPx);
  if (l.background) g.drawImage(await loadImage(artUrl(l.background.url)), 0, 0, l.widthPx, l.heightPx);
  for (const s of l.slots) {
    g.save();
    g.translate(s.x + s.width / 2, s.y + s.height / 2); g.rotate(s.rotationDegrees * Math.PI / 180);
    const img = samples[s.shotIndex % samples.length];
    const k = s.fit === 'fill' ? Math.max(s.width / img.width, s.height / img.height) : Math.min(s.width / img.width, s.height / img.height);
    g.beginPath(); g.rect(-s.width / 2, -s.height / 2, s.width, s.height); g.clip();
    g.drawImage(img, -img.width * k / 2, -img.height * k / 2, img.width * k, img.height * k);
    g.restore();
  }
  if (l.overlay) g.drawImage(await loadImage(artUrl(l.overlay.url)), 0, 0, l.widthPx, l.heightPx);
  return new Promise(resolve => { try { c.toBlob(b => resolve(b), 'image/png'); } catch { resolve(null); } });
}

type Drag =
  | { kind: 'move'; startX: number; startY: number; orig: Record<string, { x: number; y: number }> }
  | { kind: 'resize'; id: string; corner: 'nw' | 'ne' | 'sw' | 'se'; startX: number; startY: number; orig: Slot; ratio: number | null }
  | { kind: 'rotate'; id: string; cx: number; cy: number };

export default function TemplateDesignerPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const isNew = templateId === 'new';

  const [loaded, setLoaded] = useState(isNew);
  const [notFound, setNotFound] = useState(false);
  const [canEdit, setCanEdit] = useState(true);
  const [superAdmin, setSuperAdmin] = useState(false);
  const [scope, setScope] = useState<'mine' | 'standard'>(search.get('scope') === 'standard' ? 'standard' : 'mine');
  const [isPublished, setIsPublished] = useState(false);
  const [name, setName] = useState('');
  const [layouts, setLayouts] = useState<{ main: Layout; alt: Layout | null }>({ main: blankLayout(PRESETS[0]), alt: null });
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [thumbnail, setThumbnail] = useState<RemoteAsset | null>(null);
  const [active, setActive] = useState<'main' | 'alt'>('main');
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const [uploading, setUploading] = useState<'background' | 'overlay' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notices, setNotices] = useState<string[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  // Frames set to "Free" that happen to match a shape (this session only)
  const [freeIds, setFreeIds] = useState<string[]>([]);
  const lockedRatio = (s: Slot) => freeIds.includes(s.id) ? null : ratioOf(s);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(640);
  const [samples, setSamples] = useState<HTMLCanvasElement[]>([]);
  const sampleUrls = useMemo(() => samples.map(c => c.toDataURL('image/jpeg', 0.8)), [samples]);

  const layout = active === 'alt' && layouts.alt ? layouts.alt : layouts.main;
  const setLayout = useCallback((fn: (l: Layout) => Layout) => setLayouts(ls => active === 'alt' && ls.alt ? { ...ls, alt: fn(ls.alt) } : { ...ls, main: fn(ls.main) }), [active]);
  const setSlots = useCallback((fn: (s: Slot[]) => Slot[]) => setLayout(l => ({ ...l, slots: fn(l.slots) })), [setLayout]);
  const snapshot = JSON.stringify({ name, layouts, isPublished });
  const dirty = snapshot !== savedSnapshot;

  useEffect(() => { setSamples([0, 1, 2, 3].map(makeSample)); }, []);

  useEffect(() => {
    (async () => {
      const lib = await fetch('/api/genie-templates');
      if (lib.ok) setSuperAdmin((await lib.json()).superAdmin);
      if (isNew) { setSavedSnapshot(JSON.stringify({ name: '', layouts: { main: layouts.main, alt: null }, isPublished: false })); return; }
      const r = await fetch('/api/genie-templates/' + templateId);
      if (!r.ok) { setNotFound(true); return; }
      const t = await r.json();
      const main: Layout = t.layout ?? blankLayout(PRESETS.find(p => p.format === t.format && p.orientation === t.orientation) ?? PRESETS[0]);
      setName(t.name); setScope(t.scope); setIsPublished(t.isPublished); setCanEdit(t.canEdit);
      setLayouts({ main, alt: t.alternateLayout }); setThumbnail(t.thumbnail);
      setSavedSnapshot(JSON.stringify({ name: t.name, layouts: { main, alt: t.alternateLayout }, isPublished: t.isPublished }));
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, isNew]);

  // Stage size follows the available width
  useEffect(() => {
    const el = stageRef.current?.parentElement;
    if (!el) return;
    // Inside the p-4 padding
    const measure = () => setStageW(Math.max(200, el.clientWidth - 32));
    const ro = new ResizeObserver(measure);
    ro.observe(el); measure();
    return () => ro.disconnect();
  }, [loaded]);

  const maxH = 620;
  const scale = Math.min(stageW / layout.widthPx, maxH / layout.heightPx);
  const sel = layout.slots.filter(s => selected.includes(s.id));
  const one = sel.length === 1 ? sel[0] : null;
  const readOnly = !canEdit;

  const frameCount = new Set(layout.slots.map(s => s.shotIndex)).size;

  // ── pointer interactions ─────────────────────────────────────────────────
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      if (drag.kind === 'move') {
        const dx = (e.clientX - drag.startX) / scale, dy = (e.clientY - drag.startY) / scale;
        setSlots(slots => slots.map(s => drag.orig[s.id] ? { ...s, x: round(clamp(drag.orig[s.id].x + dx, 0, layout.widthPx - s.width)), y: round(clamp(drag.orig[s.id].y + dy, 0, layout.heightPx - s.height)) } : s));
      } else if (drag.kind === 'resize') {
        const dx = (e.clientX - drag.startX) / scale, dy = (e.clientY - drag.startY) / scale, o = drag.orig;
        let { x, y, width, height } = o;
        if (drag.corner.includes('e')) width = clamp(o.width + dx, MIN, layout.widthPx - o.x);
        if (drag.corner.includes('s')) height = clamp(o.height + dy, MIN, layout.heightPx - o.y);
        if (drag.corner.includes('w')) { x = clamp(o.x + dx, 0, o.x + o.width - MIN); width = o.x + o.width - x; }
        if (drag.corner.includes('n')) { y = clamp(o.y + dy, 0, o.y + o.height - MIN); height = o.y + o.height - y; }
        if (drag.ratio) {
          // Follow the larger movement, keep the shape, and stay inside the canvas with the opposite corner fixed
          const r = drag.ratio;
          let w = Math.abs(dx) >= Math.abs(dy) * r ? width : height * r;
          const maxW = drag.corner.includes('e') ? layout.widthPx - o.x : o.x + o.width;
          const maxH = drag.corner.includes('s') ? layout.heightPx - o.y : o.y + o.height;
          w = Math.max(w, MIN, MIN * r);
          w = Math.min(w, maxW, maxH * r);
          width = round(w); height = round(width / r);
          x = drag.corner.includes('w') ? o.x + o.width - width : o.x;
          y = drag.corner.includes('n') ? o.y + o.height - height : o.y;
        }
        setSlots(slots => slots.map(s => s.id === drag.id ? { ...s, x: round(x), y: round(y), width: round(width), height: round(height) } : s));
      } else {
        const rect = stageRef.current!.getBoundingClientRect();
        let deg = Math.atan2(e.clientY - (rect.top + drag.cy * scale), e.clientX - (rect.left + drag.cx * scale)) * 180 / Math.PI + 90;
        if (deg > 180) deg -= 360;
        const snapped = [-180, -90, 0, 90, 180].find(a => Math.abs(a - deg) < 4);
        setSlots(slots => slots.map(s => s.id === drag.id ? { ...s, rotationDegrees: round(snapped ?? deg) } : s));
      }
    };
    const up = () => setDrag(null);
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [drag, scale, layout.widthPx, layout.heightPx, setSlots]);

  function startMove(e: React.PointerEvent, s: Slot) {
    if (readOnly || preview) return;
    e.preventDefault(); e.stopPropagation();
    const ids = e.shiftKey ? (selected.includes(s.id) ? selected.filter(i => i !== s.id) : [...selected, s.id]) : selected.includes(s.id) ? selected : [s.id];
    setSelected(ids);
    if (!ids.includes(s.id)) return;
    setDrag({ kind: 'move', startX: e.clientX, startY: e.clientY, orig: Object.fromEntries(layout.slots.filter(x => ids.includes(x.id)).map(x => [x.id, { x: x.x, y: x.y }])) });
  }

  // Arrow keys nudge (Shift = 10 px), Delete removes
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (readOnly || preview || selected.length === 0) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const step = e.shiftKey ? 10 : 1;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (d) {
        e.preventDefault();
        setSlots(slots => slots.map(s => selected.includes(s.id) ? { ...s, x: clamp(s.x + d[0], 0, layout.widthPx - s.width), y: clamp(s.y + d[1], 0, layout.heightPx - s.height) } : s));
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && layout.slots.length > selected.length) {
        e.preventDefault(); removeSelected();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  // ── frame tools ──────────────────────────────────────────────────────────
  function updateOne(patch: Partial<Slot>) {
    if (!one) return;
    setSlots(slots => slots.map(s => {
      if (s.id !== one.id) return s;
      const n = { ...s, ...patch };
      n.width = clamp(n.width || MIN, MIN, layout.widthPx); n.height = clamp(n.height || MIN, MIN, layout.heightPx);
      n.x = clamp(n.x || 0, 0, layout.widthPx - n.width); n.y = clamp(n.y || 0, 0, layout.heightPx - n.height);
      n.rotationDegrees = clamp(n.rotationDegrees || 0, -180, 180);
      return n;
    }));
  }
  function setShape(id: string) {
    if (!one) return;
    const q = RATIOS.find(x => x.id === id);
    setFreeIds(f => q ? f.filter(i => i !== one.id) : [...f, one.id]);
    if (q) setSlots(slots => slots.map(s => s.id === one.id ? reshape(s, q.r, layout.widthPx, layout.heightPx) : s));
  }
  function setSize(k: 'width' | 'height', v: number) {
    const q = one && lockedRatio(one);
    if (!q || !v) return updateOne({ [k]: v });
    let w = k === 'width' ? v : v * q.r;
    w = Math.min(Math.max(w, MIN, MIN * q.r), layout.widthPx, layout.heightPx * q.r);
    updateOne({ width: round(w), height: round(round(w) / q.r) });
  }
  function addFrame() {
    const used = new Set(layout.slots.map(s => s.shotIndex));
    const shotIndex = Array.from({ length: 10 }, (_, i) => i).find(i => !used.has(i)) ?? 0;
    // New frames start 3:4 portrait on portrait canvases and 4:3 landscape on landscape ones
    const r = layout.widthPx >= layout.heightPx ? 4 / 3 : 3 / 4;
    const w = round(Math.min(layout.widthPx / 3, (layout.heightPx / 3) * r)), h = round(w / r);
    const s: Slot = { id: newId(), shotIndex, x: round((layout.widthPx - w) / 2), y: round((layout.heightPx - h) / 2), width: w, height: h, rotationDegrees: 0, fit: 'fill' };
    setSlots(slots => [...slots, s]); setSelected([s.id]);
  }
  function duplicateSelected() {
    const copies = sel.map(s => ({ ...s, id: newId(), x: clamp(s.x + 40, 0, layout.widthPx - s.width), y: clamp(s.y + 40, 0, layout.heightPx - s.height) }));
    setSlots(slots => [...slots, ...copies]); setSelected(copies.map(c => c.id));
  }
  function removeSelected() {
    setSlots(slots => slots.filter(s => !selected.includes(s.id))); setSelected([]);
  }
  function center(axis: 'h' | 'v') {
    setSlots(slots => slots.map(s => !selected.includes(s.id) ? s : axis === 'h' ? { ...s, x: round((layout.widthPx - s.width) / 2) } : { ...s, y: round((layout.heightPx - s.height) / 2) }));
  }
  // Equal gaps between the selected frames, keeping the first and last in place
  function distribute(axis: 'h' | 'v') {
    const pos = axis === 'h' ? 'x' : 'y', size = axis === 'h' ? 'width' : 'height';
    const sorted = [...sel].sort((a, b) => a[pos] - b[pos]);
    const first = sorted[0], last = sorted[sorted.length - 1];
    const span = last[pos] + last[size] - first[pos];
    const gap = (span - sorted.reduce((t, s) => t + s[size], 0)) / (sorted.length - 1);
    let at = first[pos];
    const placed: Record<string, number> = {};
    for (const s of sorted) { placed[s.id] = round(at); at += s[size] + gap; }
    setSlots(slots => slots.map(s => placed[s.id] !== undefined ? { ...s, [pos]: placed[s.id] } : s));
  }

  function changePreset(id: string) {
    const p = PRESETS.find(x => x.id === id)!;
    if (p.id === presetOf(layout).id) return;
    if (layout.background || layout.overlay) setNotices(n => [...n, 'Artwork was removed because it no longer fits the new size. Upload artwork for this size.']);
    setLayouts(ls => {
      const next = { ...ls };
      if (active === 'alt' && ls.alt) next.alt = resize(ls.alt, p);
      else {
        next.main = resize(ls.main, p);
        // The alternate must stay the other orientation of the same size
        const other = otherOrientation(p);
        if (ls.alt && (!other || ls.alt.orientation === p.orientation || ls.alt.format !== p.format)) next.alt = other ? resize(ls.alt, other) : null;
      }
      return next;
    });
    setSelected([]);
  }

  // ── artwork upload ──────────────────────────────────────────────────────
  async function uploadArt(kind: 'background' | 'overlay', file: File) {
    setError(''); setUploading(kind);
    try {
      if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Use a PNG or JPG image.');
      if (kind === 'overlay' && file.type !== 'image/png') throw new Error('The overlay must be a PNG with transparent windows over the photos.');
      const asset = await uploadFile(file, file.type, { widthPx: layout.widthPx, heightPx: layout.heightPx }, kind);
      setLayout(l => ({ ...l, [kind]: asset }));
    } catch (e: any) {
      setError(e.message || 'Upload failed');
    } finally { setUploading(null); }
  }

  async function uploadFile(body: Blob, contentType: string, canvas?: { widthPx: number; heightPx: number }, kind?: 'background' | 'overlay'): Promise<RemoteAsset> {
    const r = await fetch('/api/genie-templates/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, contentType, bytes: body.size }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Could not start the upload');
    const put = await fetch(d.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body }).catch(() => null);
    if (!put?.ok) throw new Error("The upload didn't go through. Check your connection and try again.");
    const v = await fetch('/api/genie-templates/assets/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: d.url, scope, ...(canvas ? { canvas } : {}) }) });
    const vd = await v.json().catch(() => ({}));
    if (!v.ok) throw new Error(vd.error || 'That image could not be used');
    if (kind === 'overlay' && !vd.hasAlpha) throw new Error('This PNG has no transparent areas, so it would cover the photos. Use it as the background instead.');
    if (vd.warning) setNotices(n => [...n, vd.warning]);
    return vd.asset;
  }

  // ── save ────────────────────────────────────────────────────────────────
  async function save() {
    setSaving(true); setError('');
    let thumb: RemoteAsset | null = thumbnail;
    try {
      const blob = await renderThumbnail(layouts.main, samples).catch(() => null);
      thumb = blob ? await uploadFile(blob, 'image/png') : null;
    } catch { thumb = null; }
    const body = { name, ...(isNew ? { scope } : {}), ...(scope === 'standard' ? { isPublished } : {}), layout: layouts.main, alternateLayout: layouts.alt, thumbnail: thumb };
    const r = await fetch(isNew ? '/api/genie-templates' : '/api/genie-templates/' + templateId, { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) { setError(d.error || 'Could not save'); return; }
    setThumbnail(d.thumbnail ?? null);
    setNotices(d.warnings?.length ? d.warnings : []);
    setSavedSnapshot(snapshot);
    if (isNew) router.replace('/genie/templates/' + d.id);
  }

  const handle = (corner: 'nw' | 'ne' | 'sw' | 'se', s: Slot) => (
    <div key={corner} onPointerDown={e => { e.preventDefault(); e.stopPropagation(); setDrag({ kind: 'resize', id: s.id, corner, startX: e.clientX, startY: e.clientY, orig: s, ratio: lockedRatio(s)?.r ?? null }); }}
      className={'absolute w-3 h-3 bg-white border-2 border-[#0085FF] rounded-sm ' + { nw: '-left-1.5 -top-1.5 cursor-nwse-resize', ne: '-right-1.5 -top-1.5 cursor-nesw-resize', sw: '-left-1.5 -bottom-1.5 cursor-nesw-resize', se: '-right-1.5 -bottom-1.5 cursor-nwse-resize' }[corner]}/>
  );

  const preset = presetOf(layout);
  const altPreset = otherOrientation(presetOf(layouts.main));

  if (notFound) return (<><TopBar title="Template Designer"/><div className="p-8 text-sm text-gray-500">Template not found. <Link href="/genie/templates" className="text-brand hover:underline">Back to templates</Link></div></>);
  if (!loaded) return (<><TopBar title="Template Designer"/><div className="p-8 text-sm text-gray-400">Loading…</div></>);

  return (
    <>
      <TopBar title="Template Designer"/>
      <div className="p-4 sm:p-8 space-y-4 max-w-7xl pb-24">
        <Link href="/genie/templates" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>Back to Templates</Link>

        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="flex-1 max-w-md">
            <Field label="Template name"><Input value={name} disabled={readOnly} maxLength={80} onChange={e => setName(e.target.value)} placeholder="Gold Wedding Strip"/></Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {scope === 'standard' && <Badge variant="info">Standard</Badge>}
            {readOnly && <Badge variant="default">View only</Badge>}
            <Button variant={preview ? 'default' : 'outline'} onClick={() => { setPreview(p => !p); setSelected([]); }}>{preview ? <><Pencil className="w-4 h-4 mr-1.5"/>Edit frames</> : <><Eye className="w-4 h-4 mr-1.5"/>Preview</>}</Button>
          </div>
        </div>

        {(layouts.main.slots.length === 0 || (layouts.alt && layouts.alt.slots.length === 0)) && (
          <p className="text-sm text-amber-700 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4"/>Every layout needs at least one photo frame.</p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="flex border border-gray-200 rounded-lg overflow-hidden text-[13px]">
                  <button className={'px-3 py-1.5 ' + (active === 'main' ? 'bg-[#F5F6F8] font-semibold' : 'text-[#676879]')} onClick={() => { setActive('main'); setSelected([]); }}>{presetOf(layouts.main).label}</button>
                  {layouts.alt && <button className={'px-3 py-1.5 border-l border-gray-200 ' + (active === 'alt' ? 'bg-[#F5F6F8] font-semibold' : 'text-[#676879]')} onClick={() => { setActive('alt'); setSelected([]); }}>Alternate: {presetOf(layouts.alt).label}</button>}
                </div>
                {!readOnly && !layouts.alt && altPreset && (
                  <Button variant="ghost" size="sm" onClick={() => { setLayouts(ls => ({ ...ls, alt: resize(ls.main, altPreset) })); setActive('alt'); setSelected([]); }}><Plus className="w-3.5 h-3.5 mr-1"/>Add {altPreset.orientation} version</Button>
                )}
                {!readOnly && layouts.alt && active === 'alt' && (
                  <Button variant="ghost" size="sm" className="text-[#E2445C] hover:bg-red-50" onClick={() => { setLayouts(ls => ({ ...ls, alt: null })); setActive('main'); setSelected([]); }}><X className="w-3.5 h-3.5 mr-1"/>Remove alternate</Button>
                )}
                <span className="text-xs text-gray-400 ml-auto">{layout.widthPx}×{layout.heightPx} px · 300 dpi · {frameCount} photo{frameCount === 1 ? '' : 's'}</span>
              </div>

              <div className="w-full flex justify-center bg-[#F5F6F8] rounded-lg p-4 pt-8 select-none" onPointerDown={() => setSelected([])}>
                <div ref={stageRef} className="relative shadow-md touch-none" style={{ width: layout.widthPx * scale, height: layout.heightPx * scale, backgroundColor: layout.backgroundColor }}>
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  {layout.background && <img src={artUrl(layout.background.url)} alt="" draggable={false} className="absolute inset-0 w-full h-full pointer-events-none"/>}
                  {layout.slots.map(s => (
                    <div key={s.id} className="absolute overflow-hidden pointer-events-none" style={{ left: s.x * scale, top: s.y * scale, width: s.width * scale, height: s.height * scale, transform: `rotate(${s.rotationDegrees}deg)` }}>
                      {preview && sampleUrls[s.shotIndex % 4]
                        ? <img src={sampleUrls[s.shotIndex % 4]} alt="" className={'w-full h-full ' + (s.fit === 'fill' ? 'object-cover' : 'object-contain')}/>
                        : <div className="w-full h-full bg-gray-300/80"/>}
                    </div>
                  ))}
                  {layout.overlay && <img src={artUrl(layout.overlay.url)} alt="" draggable={false} className={'absolute inset-0 w-full h-full pointer-events-none ' + (preview ? '' : 'opacity-60')}/>}
                  </div>
                  {!preview && layout.slots.map(s => {
                    const on = selected.includes(s.id);
                    return (
                      <div key={s.id} onPointerDown={e => startMove(e, s)}
                        className={'absolute border-2 ' + (on ? 'border-[#0085FF]' : 'border-dashed border-gray-600/70') + (readOnly ? '' : ' cursor-move')}
                        style={{ left: s.x * scale, top: s.y * scale, width: s.width * scale, height: s.height * scale, transform: `rotate(${s.rotationDegrees}deg)` }}>
                        <span className="absolute left-1 top-1 bg-[#1F1F3D] text-white text-[11px] font-semibold rounded px-1.5 py-0.5">{s.shotIndex + 1}</span>
                        {on && one?.id === s.id && !readOnly && (
                          <>
                            {(['nw', 'ne', 'sw', 'se'] as const).map(c => handle(c, s))}
                            <div onPointerDown={e => { e.preventDefault(); e.stopPropagation(); setDrag({ kind: 'rotate', id: s.id, cx: s.x + s.width / 2, cy: s.y + s.height / 2 }); }}
                              className="absolute left-1/2 -top-7 -ml-2.5 w-5 h-5 rounded-full bg-white border-2 border-[#0085FF] flex items-center justify-center cursor-grab" title="Rotate">
                              <RotateCw className="w-3 h-3 text-[#0085FF]"/>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              {!readOnly && !preview && <p className="text-xs text-gray-400 mt-2">Drag frames to move, corners to resize, the round handle to rotate. Shift-click to select several. Arrow keys nudge.</p>}
            </CardContent>
          </Card>

          {/* On wide screens the side panel stays in view and scrolls on its own, between the top bar and the save bar */}
          <div className="space-y-4 lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-160px)] lg:overflow-y-auto lg:overscroll-contain">
            <Card>
              <CardHeader className="pb-3"><CardTitle>Canvas</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Field label="Size">
                  <Select value={preset.id} disabled={readOnly} onChange={e => changePreset(e.target.value)}>
                    {PRESETS.filter(p => active === 'main' || (p.format === layouts.main.format && p.orientation !== layouts.main.orientation)).map(p => <option key={p.id} value={p.id}>{p.label} ({p.widthPx}×{p.heightPx})</option>)}
                  </Select>
                </Field>
                <Field label="Background colour">
                  <div className="flex gap-2">
                    <input type="color" value={layout.backgroundColor} disabled={readOnly} onChange={e => setLayout(l => ({ ...l, backgroundColor: e.target.value.toUpperCase() }))} className="h-10 w-12 rounded border border-gray-300 cursor-pointer"/>
                    <Input key={layout.backgroundColor} defaultValue={layout.backgroundColor} disabled={readOnly} maxLength={7}
                      onBlur={e => { const v = e.target.value.trim().toUpperCase(); if (/^#[0-9A-F]{6}$/.test(v)) setLayout(l => ({ ...l, backgroundColor: v })); else e.target.value = layout.backgroundColor; }}/>
                  </div>
                </Field>
                {(['background', 'overlay'] as const).map(kind => (
                  <Field key={kind} label={kind === 'background' ? 'Background image' : 'Overlay'} hint={kind === 'background' ? 'PNG or JPG behind the photos.' : 'PNG with transparent windows, drawn over the photos.'}>
                    {layout[kind] ? (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="flex-1 truncate text-gray-600">{layout[kind]!.contentType === 'image/png' ? 'PNG' : 'JPG'} · {(layout[kind]!.bytes / 1024 / 1024).toFixed(1)} MB</span>
                        {!readOnly && <Button variant="ghost" size="sm" onClick={() => setLayout(l => { const n = { ...l }; delete n[kind]; return n; })}><X className="w-3.5 h-3.5 mr-1"/>Remove</Button>}
                      </div>
                    ) : !readOnly && (
                      <label className={'flex items-center justify-center gap-2 h-10 rounded-lg border border-dashed border-gray-300 text-sm text-gray-600 hover:bg-gray-50 ' + (uploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer')}>
                        <Upload className="w-4 h-4"/>{uploading === kind ? 'Uploading…' : 'Upload'}
                        <input type="file" accept={kind === 'overlay' ? 'image/png' : 'image/png,image/jpeg'} className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadArt(kind, f); }}/>
                      </label>
                    )}
                  </Field>
                ))}
              </CardContent>
            </Card>

            {!readOnly && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle>Photo Frames</CardTitle>
                    <Button variant="outline" size="sm" onClick={addFrame} disabled={layout.slots.length >= 10}><Plus className="w-3.5 h-3.5 mr-1"/>Add</Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {sel.length === 0 ? <p className="text-sm text-gray-500">Select a frame to edit it.</p> : (
                    <>
                      <div className="flex flex-wrap gap-1">
                        <Button variant="outline" size="sm" onClick={() => center('h')} title="Center horizontally"><AlignCenterVertical className="w-3.5 h-3.5"/></Button>
                        <Button variant="outline" size="sm" onClick={() => center('v')} title="Center vertically"><AlignCenterHorizontal className="w-3.5 h-3.5"/></Button>
                        <Button variant="outline" size="sm" disabled={sel.length < 3} onClick={() => distribute('h')} title="Distribute horizontally"><AlignHorizontalSpaceAround className="w-3.5 h-3.5"/></Button>
                        <Button variant="outline" size="sm" disabled={sel.length < 3} onClick={() => distribute('v')} title="Distribute vertically"><AlignVerticalSpaceAround className="w-3.5 h-3.5"/></Button>
                        <Button variant="outline" size="sm" onClick={duplicateSelected} disabled={layout.slots.length + sel.length > 10} title="Duplicate"><Copy className="w-3.5 h-3.5"/></Button>
                        <Button variant="outline" size="sm" className="text-[#E2445C]" onClick={removeSelected} disabled={layout.slots.length <= sel.length} title="Delete"><Trash2 className="w-3.5 h-3.5"/></Button>
                      </div>
                      {sel.length > 1 && <p className="text-xs text-gray-500">{sel.length} frames selected.{sel.length < 3 ? ' Select 3 or more to distribute.' : ''}</p>}
                      {one && (
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Photo number">
                            <Select value={one.shotIndex} onChange={e => updateOne({ shotIndex: Number(e.target.value) })}>
                              {Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>Photo {i + 1}</option>)}
                            </Select>
                          </Field>
                          <Field label="Photo fit">
                            <Select value={one.fit} onChange={e => updateOne({ fit: e.target.value as 'fill' | 'fit' })}>
                              <option value="fill">Fill (crop)</option>
                              <option value="fit">Fit (no crop)</option>
                            </Select>
                          </Field>
                          <div className="col-span-2">
                            <Field label="Shape" hint={lockedRatio(one) ? 'Resizing keeps this shape.' : 'Resize freely.'}>
                              <Select value={lockedRatio(one)?.id ?? 'free'} onChange={e => setShape(e.target.value)}>
                                {RATIOS.map(q => <option key={q.id} value={q.id}>{q.label}</option>)}
                                <option value="free">Free</option>
                              </Select>
                            </Field>
                          </div>
                          {([['x', 'X'], ['y', 'Y'], ['width', 'Width'], ['height', 'Height'], ['rotationDegrees', 'Rotation °']] as const).map(([k, label]) => (
                            <Field key={k} label={label}>
                              <Input type="number" value={one[k]} onChange={e => k === 'width' || k === 'height' ? setSize(k, Number(e.target.value)) : updateOne({ [k]: Number(e.target.value) } as Partial<Slot>)}/>
                            </Field>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {scope === 'standard' && superAdmin && (
              <Card><CardContent className="pt-6">
                <Toggle checked={isPublished} onChange={setIsPublished} label="Published" hint="Shows in every Genie tenant's Standard library."/>
              </CardContent></Card>
            )}
          </div>
        </div>
      </div>

      {!readOnly && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-white border-t border-gray-200 pl-4 sm:pl-8 pr-20 sm:pr-24 py-3 flex items-center justify-end gap-3 z-30">
          <div className="mr-auto text-sm min-w-0">
            {error ? <p className="text-red-600">{error}</p>
              : notices.length ? <p className="text-amber-600 truncate" title={notices.join(' ')}>{notices[notices.length - 1]}</p>
              : <p className="text-gray-500">{dirty ? 'Unsaved changes' : isNew ? 'New template' : 'Saved'}</p>}
          </div>
          <Button onClick={save} disabled={saving || !!uploading || !name.trim() || layouts.main.slots.length === 0 || (!!layouts.alt && layouts.alt.slots.length === 0) || (!dirty && !isNew)}>{saving ? 'Saving…' : 'Save Template'}</Button>
        </div>
      )}
    </>
  );
}
