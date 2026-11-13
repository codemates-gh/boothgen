'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Upload, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { Field, artUrl } from './parts';

// Virtual props: shared pieces for Super Admin → Props, Genie → Props (My props) and the event's Props section.
// Placement follows the Genie anchor model (src/lib/genie/props.ts): the prop is drawn for an eye distance of
// eyeDistance units, and anchorPoint (prop units) sits on the anchor face point.

export type PropAnchor = 'eyes' | 'nose' | 'mouth' | 'chin';
export type Placement = { category: string; subcategory: string };
export type Prop = {
  id: string; name: string; category: string; subcategory: string; alsoIn: Placement[];
  source: 'standard' | 'account'; image: { url: string; sha256: string; bytes: number };
  size: { width: number; height: number }; anchor: PropAnchor; anchorPoint: { x: number; y: number }; eyeDistance: number;
  isActive: boolean;
};
export type Category = { id: string; name: string; subcategories: { id: string; name: string }[] };

export const ANCHORS: { id: PropAnchor; label: string }[] = [
  { id: 'eyes', label: 'Eyes (glasses, masks, hats)' },
  { id: 'nose', label: 'Nose' },
  { id: 'mouth', label: 'Mouth (mustaches, lips)' },
  { id: 'chin', label: 'Chin (bow ties, beards)' },
];
export const PROPS_RECOMMENDED_MAX = 10;

// Reference face (keep in step with REFERENCE_FACE in src/lib/genie/props.ts): eye midpoint at 0,0, eyes 300 apart
const FACE = { leftEye: { x: -150, y: 0 }, rightEye: { x: 150, y: 0 }, nose: { x: 0, y: 130 }, mouth: { x: 0, y: 250 }, chin: { x: 0, y: 420 }, top: -480 };
const anchorOnFace = (a: PropAnchor) => (a === 'eyes' ? { x: 0, y: 0 } : FACE[a]);

// Where the prop's image lands on the reference face (face units)
function boxOnFace(p: Pick<Prop, 'size' | 'anchor' | 'anchorPoint' | 'eyeDistance'>) {
  const s = 300 / p.eyeDistance, a = anchorOnFace(p.anchor);
  return { x: a.x - p.anchorPoint.x * s, y: a.y - p.anchorPoint.y * s, w: p.size.width * s, h: p.size.height * s };
}

function FaceDrawing() {
  return (
    <g>
      <ellipse cx={0} cy={-30} rx={330} ry={460} className="fill-amber-50 stroke-gray-300" strokeWidth={6}/>
      <circle cx={FACE.leftEye.x} cy={0} r={22} className="fill-gray-400"/>
      <circle cx={FACE.rightEye.x} cy={0} r={22} className="fill-gray-400"/>
      <path d="M -20 60 L -32 130 L 0 140" className="fill-none stroke-gray-300" strokeWidth={6}/>
      <path d="M -90 245 Q 0 290 90 245" className="fill-none stroke-gray-400" strokeWidth={8}/>
    </g>
  );
}

const PAD = 40;
function viewBoxFor(box: { x: number; y: number; w: number; h: number }) {
  const x0 = Math.min(-360, box.x) - PAD, y0 = Math.min(-520, box.y) - PAD;
  const x1 = Math.max(360, box.x + box.w) + PAD, y1 = Math.max(460, box.y + box.h) + PAD;
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

// A prop drawn on the reference face, for previews
export function PropOnFace({ prop, className = 'w-full h-40' }: { prop: Pick<Prop, 'image' | 'size' | 'anchor' | 'anchorPoint' | 'eyeDistance'>; className?: string }) {
  const box = boxOnFace(prop);
  const v = viewBoxFor(box);
  return (
    <svg viewBox={`${v.x0} ${v.y0} ${v.w} ${v.h}`} className={className} preserveAspectRatio="xMidYMid meet">
      <FaceDrawing/>
      <image href={artUrl(prop.image.url)} x={box.x} y={box.y} width={box.w} height={box.h} preserveAspectRatio="none"/>
    </svg>
  );
}

export function PropThumb({ prop, className = 'w-full h-20' }: { prop: Pick<Prop, 'image' | 'name'>; className?: string }) {
  return <img src={artUrl(prop.image.url)} alt={prop.name} className={className + ' object-contain'}/>;
}

// ── Placement editor ────────────────────────────────────────────────────────
export type PlacementValue = { anchor: PropAnchor; size: { width: number; height: number }; anchorPoint: { x: number; y: number }; eyeDistance: number };

// A sensible first placement for a new PNG: centered on the anchor, a width that suits the face point
export function defaultPlacement(anchor: PropAnchor, px: { width: number; height: number }): PlacementValue {
  const width = anchor === 'eyes' ? 700 : anchor === 'nose' ? 220 : anchor === 'mouth' ? 420 : 520;
  const height = width * px.height / px.width;
  return { anchor, size: { width, height }, anchorPoint: { x: width / 2, y: anchor === 'chin' ? 0 : height / 2 }, eyeDistance: 300 };
}

// Drag the prop on the reference face and size it with the slider. Saves with eyeDistance 300, so prop units are
// face units.
export function PlacementEditor({ imageUrl, value, onChange, disabled }: { imageUrl: string; value: PlacementValue; onChange: (v: PlacementValue) => void; disabled?: boolean }) {
  const box = boxOnFace(value);
  // Fixed frame around the face (with room above for hats), so the face doesn't move while dragging
  const view = { x0: -620, y0: -820, w: 1240, h: 1560 };
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; box: typeof box } | null>(null);

  const emit = (b: { x: number; y: number; w: number; h: number }, anchor = value.anchor) => {
    const a = anchorOnFace(anchor);
    const r = (n: number) => Math.round(n * 10) / 10;
    onChange({ anchor, size: { width: r(b.w), height: r(b.h) }, anchorPoint: { x: r(a.x - b.x), y: r(a.y - b.y) }, eyeDistance: 300 });
  };
  const toFace = (e: React.PointerEvent) => {
    const p = svg.current!.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const m = svg.current!.getScreenCTM();
    const q = m ? p.matrixTransform(m.inverse()) : p;
    return { x: q.x, y: q.y };
  };
  const setWidth = (w: number) => {
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2, h = w * box.h / box.w;
    emit({ x: cx - w / 2, y: cy - h / 2, w, h });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Attaches to">
          <Select value={value.anchor} disabled={disabled} onChange={e => emit(box, e.target.value as PropAnchor)}>
            {ANCHORS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </Select>
        </Field>
        <Field label="Size">
          <input type="range" min={60} max={1600} step={5} value={Math.round(box.w)} disabled={disabled} onChange={e => setWidth(Number(e.target.value))} className="w-full h-10 accent-brand"/>
        </Field>
      </div>
      <svg ref={svg} viewBox={`${view.x0} ${view.y0} ${view.w} ${view.h}`} className="w-full h-96 bg-gray-50 rounded-lg border border-gray-200 touch-none select-none"
        onPointerMove={e => {
          if (!drag.current) return;
          const p = toFace(e);
          emit({ ...drag.current.box, x: drag.current.box.x + p.x - drag.current.x, y: drag.current.box.y + p.y - drag.current.y });
        }}
        onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}>
        <FaceDrawing/>
        <image href={artUrl(imageUrl)} x={box.x} y={box.y} width={box.w} height={box.h} preserveAspectRatio="none"
          className={disabled ? '' : 'cursor-move'}
          onPointerDown={e => { if (disabled) return; (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { ...toFace(e), box }; }}/>
        <rect x={box.x} y={box.y} width={box.w} height={box.h} className="fill-none stroke-brand pointer-events-none" strokeWidth={4} strokeDasharray="16 10"/>
        <circle cx={anchorOnFace(value.anchor).x} cy={anchorOnFace(value.anchor).y} r={14} className="fill-brand pointer-events-none"/>
      </svg>
      <p className="text-xs text-gray-500">Drag the prop into place on the face and set its size. The colored dot is the face point it follows; the gray dots are the eyes.</p>
    </div>
  );
}

// ── Library browser ─────────────────────────────────────────────────────────
const inSub = (p: Prop, sub: string) => p.subcategory === sub || p.alsoIn.some(a => a.subcategory === sub);
const inCat = (p: Prop, cat: string) => p.category === cat || p.alsoIn.some(a => a.category === cat);

// Category → sub-category browsing with search. renderCard draws each prop (selection, on/off, edit…).
export function PropBrowser({ props, categories, renderCard, empty = 'No props here yet.' }: {
  props: Prop[]; categories: Category[]; renderCard: (p: Prop) => React.ReactNode; empty?: string;
}) {
  const [cat, setCat] = useState('');
  const [sub, setSub] = useState('');
  const [q, setQ] = useState('');
  const subs = categories.find(c => c.id === cat)?.subcategories ?? [];
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return props.filter(p => (!cat || inCat(p, cat)) && (!sub || inSub(p, sub)) && (!needle || p.name.toLowerCase().includes(needle)));
  }, [props, cat, sub, q]);
  const count = (c: string) => props.filter(p => inCat(p, c)).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400"/>
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search props" className="pl-9"/>
        </div>
        <Select value={cat} onChange={e => { setCat(e.target.value); setSub(''); }} className="sm:w-48">
          <option value="">All categories</option>
          {categories.filter(c => count(c.id) > 0).map(c => <option key={c.id} value={c.id}>{c.name} ({count(c.id)})</option>)}
        </Select>
      </div>
      {cat && subs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setSub('')} className={'px-2.5 py-1 rounded-full text-xs border ' + (!sub ? 'bg-brand text-white border-brand' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>All</button>
          {subs.filter(s => props.some(p => inSub(p, s.id))).map(s => (
            <button key={s.id} onClick={() => setSub(s.id)} className={'px-2.5 py-1 rounded-full text-xs border ' + (sub === s.id ? 'bg-brand text-white border-brand' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>{s.name}</button>
          ))}
        </div>
      )}
      {shown.length === 0 ? <p className="text-sm text-gray-400 py-6 text-center">{q || cat ? 'No props match.' : empty}</p> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">{shown.map(renderCard)}</div>
      )}
    </div>
  );
}

// ── Add / edit form ─────────────────────────────────────────────────────────
export type PropSaveBody = { name: string; category: string; subcategory: string; alsoIn?: Placement[]; imageUrl: string } & Omit<PlacementValue, never>;

export function PropFormModal({ open, onClose, prop, categories, scope, onSave, allowAlsoIn }: {
  open: boolean; onClose: () => void; prop: Prop | null; categories: Category[]; scope: 'mine' | 'standard';
  onSave: (body: PropSaveBody) => Promise<string | null>; allowAlsoIn?: boolean;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [alsoIn, setAlsoIn] = useState<Placement[]>([]);
  const [image, setImage] = useState<{ url: string; px: { width: number; height: number } } | null>(null);
  const [placement, setPlacement] = useState<PlacementValue | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(''); setBusy(false);
    setName(prop?.name ?? '');
    setCategory(prop?.category ?? '');
    setSubcategory(prop?.subcategory ?? '');
    setAlsoIn(prop?.alsoIn ?? []);
    setImage(prop ? { url: prop.image.url, px: prop.size } : null);
    setPlacement(prop ? { anchor: prop.anchor, size: prop.size, anchorPoint: prop.anchorPoint, eyeDistance: prop.eyeDistance } : null);
  }, [open, prop]);

  async function upload(f: File) {
    setError('');
    if (f.type !== 'image/png') { setError('Use a PNG with a transparent background.'); return; }
    if (f.size > 2 * 1024 * 1024) { setError('Props must be 2 MB or smaller. Export the PNG smaller (2048 px on the long side is plenty).'); return; }
    setBusy(true);
    const form = new FormData();
    form.append('file', f); form.append('scope', scope);
    const r = await fetch('/api/genie-props/upload', { method: 'POST', body: form });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(d.error || 'Could not upload'); return; }
    const px = { width: d.width, height: d.height };
    setImage({ url: d.image.url, px });
    if (!name) setName(f.name.replace(/\.png$/i, '').replace(/[-_]+/g, ' ').slice(0, 80));
    // A replacement keeps the placement's box width and anchor, with the new shape
    setPlacement(p => {
      if (!p) return defaultPlacement('eyes', px);
      const s = 300 / p.eyeDistance, w = p.size.width * s, h = w * px.height / px.width;
      const a = anchorOnFace(p.anchor), b = boxOnFace(p);
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      return { anchor: p.anchor, size: { width: w, height: h }, anchorPoint: { x: a.x - (cx - w / 2), y: a.y - (cy - h / 2) }, eyeDistance: 300 };
    });
  }

  async function save() {
    if (!image || !placement) { setError('Upload a PNG first.'); return; }
    if (!name.trim()) { setError('Give the prop a name.'); return; }
    if (!category || !subcategory) { setError('Choose a category and sub-category.'); return; }
    setBusy(true); setError('');
    const err = await onSave({ name: name.trim(), category, subcategory, ...(allowAlsoIn ? { alsoIn: alsoIn.filter(a => a.subcategory && a.subcategory !== subcategory) } : {}), imageUrl: image.url, ...placement });
    setBusy(false);
    if (err) setError(err); else onClose();
  }

  const subsOf = (c: string) => categories.find(x => x.id === c)?.subcategories ?? [];

  return (
    <Modal open={open} onClose={onClose} title={prop ? 'Edit Prop' : 'Add Prop'} className="max-w-2xl">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <input ref={file} type="file" accept="image/png" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }}/>
          <Button variant="outline" onClick={() => file.current?.click()} disabled={busy}><Upload className="w-4 h-4 mr-1.5"/>{image ? 'Replace PNG' : 'Upload PNG'}</Button>
          <p className="text-xs text-gray-500">Transparent PNG, up to 2 MB. 2048 px or smaller on the long side.</p>
        </div>
        {image && placement && <PlacementEditor imageUrl={image.url} value={placement} onChange={setPlacement} disabled={busy}/>}
        <Field label="Name"><Input value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="Party Shades"/></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Category">
            <Select value={category} onChange={e => { setCategory(e.target.value); setSubcategory(''); }}>
              <option value="">Choose…</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Sub-category">
            <Select value={subcategory} disabled={!category} onChange={e => setSubcategory(e.target.value)}>
              <option value="">Choose…</option>
              {subsOf(category).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        </div>
        {allowAlsoIn && (
          <Field label="Also listed under" hint="Other sub-categories operators find it in.">
            <div className="space-y-2">
              {alsoIn.map((a, i) => (
                <div key={i} className="flex gap-2">
                  <Select value={a.category} onChange={e => setAlsoIn(l => l.map((x, j) => j === i ? { category: e.target.value, subcategory: '' } : x))}>
                    <option value="">Category…</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                  <Select value={a.subcategory} disabled={!a.category} onChange={e => setAlsoIn(l => l.map((x, j) => j === i ? { ...x, subcategory: e.target.value } : x))}>
                    <option value="">Sub-category…</option>
                    {subsOf(a.category).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                  <Button variant="ghost" size="icon" onClick={() => setAlsoIn(l => l.filter((_, j) => j !== i))} aria-label="Remove"><X className="w-4 h-4"/></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setAlsoIn(l => [...l, { category: '', subcategory: '' }])}><Plus className="w-3.5 h-3.5 mr-1"/>Add a listing</Button>
            </div>
          </Field>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || !image}>{busy ? 'Working…' : prop ? 'Save Prop' : 'Add Prop'}</Button>
        </div>
      </div>
    </Modal>
  );
}
