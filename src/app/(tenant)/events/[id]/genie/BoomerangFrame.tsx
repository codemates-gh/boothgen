'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Check, Pencil, Plus, Trash2, Upload, AlertTriangle } from 'lucide-react';
import { ClipDesignPicture, Field, artUrl, type ClipDesignRow, type RemoteAsset, type Slot } from '@/components/genie/parts';
import { makeSample, renderThumbnail } from '@/components/genie/layoutImage';
import { CLIP_CANVAS, type BoomerangFormat } from '@/lib/genie/schemas';

// Event → Genie → Boomerang → Frame: None, a design at the Boomerang's shape (Standard, My Boomerang designs and, at
// 4x6, the account's single-photo print designs), Design one (designer in a new tab) or Upload a frame (PNG).

export type DesignChoice = { source: 'clip' | 'print'; id: string };
type Library = { standard: ClipDesignRow[]; mine: (ClipDesignRow & { source?: string })[]; print: ClipDesignRow[] };

// The Frame picker's designs; refreshed when the operator comes back from the designer tab
export function useClipDesigns() {
  const [lib, setLib] = useState<Library | null>(null);
  const load = useCallback(async () => {
    const r = await fetch('/api/genie-clip-designs');
    if (r.ok) setLib(await r.json());
  }, []);
  useEffect(() => {
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);
  return { lib, reload: load };
}

// The design (or print design) behind a choice, if the library still has it
export function findDesign(lib: Library | null, c: DesignChoice | null) {
  if (!lib || !c) return null;
  return c.source === 'print' ? lib.print.find(d => d.id === c.id) ?? null : [...lib.standard, ...lib.mine].find(d => d.id === c.id) ?? null;
}

// Uploads a PNG to the account's template storage and checks it (type, transparency, the shape's proportions)
async function uploadPng(body: Blob, canvas?: { widthPx: number; heightPx: number }): Promise<{ url: string; asset: RemoteAsset; width: number; height: number; hasAlpha: boolean }> {
  const r = await fetch('/api/genie-templates/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'mine', contentType: 'image/png', bytes: body.size }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Could not start the upload');
  const put = await fetch(d.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body }).catch(() => null);
  if (!put?.ok) throw new Error("The upload didn't go through. Check your connection and try again.");
  const v = await fetch('/api/genie-templates/assets/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: d.url, scope: 'mine', ...(canvas ? { canvas } : {}) }) });
  const vd = await v.json().catch(() => ({}));
  if (!v.ok) throw new Error(vd.error || 'That image could not be used');
  return { url: d.url, asset: vd.asset, width: vd.width, height: vd.height, hasAlpha: vd.hasAlpha };
}

// The frame's photo area: the bounding box of its largest transparent region (the window), found on a scaled-down
// copy and returned in canvas pixels
function findWindow(img: HTMLImageElement, format: BoomerangFormat): Slot | null {
  const c = CLIP_CANVAS[format];
  const k = Math.min(1, 400 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, w, h);
  const alpha = g.getImageData(0, 0, w, h).data;
  const clear = (i: number) => alpha[i * 4 + 3] < 128;
  const seen = new Uint8Array(w * h);
  let best: { n: number; x0: number; y0: number; x1: number; y1: number } | null = null;
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || !clear(start)) continue;
    let n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    seen[start] = 1; stack.push(start);
    while (stack.length) {
      const i = stack.pop()!, x = i % w, y = (i / w) | 0;
      n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && !seen[j] && clear(j)) { seen[j] = 1; stack.push(j); }
      }
    }
    if (!best || n > best.n) best = { n, x0, y0, x1, y1 };
  }
  if (!best) return null;
  const sx = c.widthPx / w, sy = c.heightPx / h, round = Math.round;
  const x = round(best.x0 * sx), y = round(best.y0 * sy);
  return { id: 'window', shotIndex: 0, x, y, width: Math.min(c.widthPx - x, round((best.x1 + 1) * sx) - x), height: Math.min(c.heightPx - y, round((best.y1 + 1) * sy) - y), rotationDegrees: 0, fit: 'fill' };
}

const SHAPE_OFF = 0.02;
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

// Upload a frame: a PNG at the shape with a transparent window. The window is found on upload and shown on a preview
// to adjust; saved to My Boomerang designs.
export function UploadFrameModal({ open, format, onClose, onSaved }: { open: boolean; format: BoomerangFormat; onClose: () => void; onSaved: (id: string) => void }) {
  const c = CLIP_CANVAS[format];
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [found, setFound] = useState<Slot | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!open) { setFile(null); setPreview(null); setFound(null); setSlot(null); setName(''); setError(''); } }, [open]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function pick(f: File) {
    setError('');
    if (f.type !== 'image/png') { setError('The frame must be a PNG with a transparent window where the Boomerang plays.'); return; }
    const url = URL.createObjectURL(f);
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); img.src = url; }).catch(() => null);
    if (!img.naturalWidth) { setError("That PNG couldn't be read."); URL.revokeObjectURL(url); return; }
    if (Math.abs((img.naturalWidth / img.naturalHeight) / (c.widthPx / c.heightPx) - 1) > SHAPE_OFF) {
      setError(`The PNG is ${img.naturalWidth}×${img.naturalHeight}, but a ${c.label} Boomerang needs that shape, e.g. ${c.widthPx}×${c.heightPx}.`);
      URL.revokeObjectURL(url); return;
    }
    const win = findWindow(img, format);
    if (!win || win.width < 16 || win.height < 16) { setError('This PNG has no transparent window, so it would cover the Boomerang. Use a PNG that is transparent where the clip shows through.'); URL.revokeObjectURL(url); return; }
    setFile(f); setPreview(url); setFound(win); setSlot(win);
    if (!name) setName(f.name.replace(/\.png$/i, '').slice(0, 80));
  }

  function edit(k: 'x' | 'y' | 'width' | 'height', v: number) {
    setSlot(s => {
      if (!s || Number.isNaN(v)) return s;
      const n = { ...s, [k]: Math.round(v) };
      n.width = clamp(n.width, 16, c.widthPx); n.height = clamp(n.height, 16, c.heightPx);
      n.x = clamp(n.x, 0, c.widthPx - n.width); n.y = clamp(n.y, 0, c.heightPx - n.height);
      return n;
    });
  }

  async function save() {
    if (!file || !slot) return;
    setSaving(true); setError('');
    try {
      const frame = await uploadPng(file, { widthPx: c.widthPx, heightPx: c.heightPx });
      if (!frame.hasAlpha) throw new Error('This PNG has no transparent area, so it would cover the Boomerang.');
      const layout = { format: '4x6' as const, orientation: (c.widthPx > c.heightPx ? 'landscape' : 'portrait') as 'landscape' | 'portrait', widthPx: c.widthPx, heightPx: c.heightPx, dpi: 0, backgroundColor: '#FFFFFF', overlay: frame.asset, slots: [slot] };
      const thumbBlob = await renderThumbnail(layout, [makeSample(0)]).catch(() => null);
      const thumbnail = thumbBlob ? (await uploadPng(thumbBlob).catch(() => null))?.asset ?? null : null;
      const r = await fetch('/api/genie-clip-designs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || 'Uploaded frame', source: 'upload', format, backgroundColor: '#FFFFFF', overlay: frame.asset, thumbnail, slot }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not save the frame');
      onSaved(d.id);
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving(false);
  }

  const W = c.widthPx > c.heightPx ? 360 : Math.round(360 * c.widthPx / c.heightPx), scale = W / c.widthPx;
  return (
    <Modal open={open} onClose={onClose} title="Upload a Boomerang frame" className="max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">A PNG in the {c.label} shape (e.g. {c.widthPx}×{c.heightPx}), transparent where the Boomerang plays. The window is found for you; adjust it if needed.</p>
        <input ref={fileRef} type="file" accept="image/png" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pick(f); }}/>
        {!preview ? (
          <button type="button" onClick={() => fileRef.current?.click()} className="w-full flex items-center justify-center gap-2 h-24 rounded-lg border border-dashed border-gray-300 text-sm text-gray-600 hover:bg-gray-50">
            <Upload className="w-4 h-4"/>Choose a PNG
          </button>
        ) : slot && (
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-shrink-0 mx-auto rounded border border-gray-200 overflow-hidden bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:12px_12px]" style={{ width: W, height: c.heightPx * scale }}>
              <img src={preview} alt="Frame" className="absolute inset-0 w-full h-full"/>
              <div className="absolute border-2 border-[#0085FF] bg-[#0085FF]/15 pointer-events-none" style={{ left: slot.x * scale, top: slot.y * scale, width: slot.width * scale, height: slot.height * scale }}>
                <span className="absolute left-1 top-1 bg-[#1F1F3D] text-white text-[11px] font-semibold rounded px-1.5 py-0.5">Boomerang</span>
              </div>
            </div>
            <div className="flex-1 space-y-3">
              <Field label="Name"><Input value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="Gold frame"/></Field>
              <div className="grid grid-cols-2 gap-3">
                {([['x', 'X'], ['y', 'Y'], ['width', 'Width'], ['height', 'Height']] as const).map(([k, label]) => (
                  <Field key={k} label={label}><Input type="number" value={slot[k]} onChange={e => edit(k, Number(e.target.value))}/></Field>
                ))}
              </div>
              <p className="text-xs text-gray-400">Photo area in {c.widthPx}×{c.heightPx} pixels. The Boomerang fills it (cropped to fit).</p>
              <div className="flex flex-wrap gap-2">
                {found && JSON.stringify(found) !== JSON.stringify(slot) && <Button type="button" variant="outline" size="sm" onClick={() => setSlot(found)}>Use the found window</Button>}
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>Choose another PNG</Button>
              </div>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!slot || saving}>{saving ? 'Saving…' : 'Save to My Boomerang designs'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function Tile({ selected, onClick, label, sub, children, actions }: { selected: boolean; onClick: () => void; label: string; sub?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className={'relative rounded-lg border-2 bg-white ' + (selected ? 'border-brand' : 'border-gray-200 hover:border-gray-300')}>
      <button type="button" onClick={onClick} className="w-full text-left disabled:cursor-not-allowed">
        <div className="h-28 bg-gray-50 rounded-t-md flex items-center justify-center overflow-hidden p-2">{children}</div>
        <div className="px-2 py-1.5">
          <p className="text-xs font-medium truncate">{label}</p>
          {sub && <p className="text-[11px] text-gray-400 truncate">{sub}</p>}
        </div>
      </button>
      {selected && <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-brand text-white flex items-center justify-center pointer-events-none"><Check className="w-3 h-3"/></span>}
      {actions && <div className="absolute top-1.5 left-1.5 flex gap-1">{actions}</div>}
    </div>
  );
}

// The Frame choice. value: the chosen design (or null); overlay: a plain overlay saved before designs existed.
export function BoomerangFramePicker({ eventId, format, design, designProblem, overlay, lib, reload, disabled, onChange }: {
  eventId: string; format: BoomerangFormat; design: DesignChoice | null; designProblem: 'deleted' | 'shape' | null;
  overlay: { url: string } | null; lib: Library | null; reload: () => void; disabled?: boolean;
  onChange: (p: { design?: DesignChoice | null; overlay?: null; designProblem?: null }) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const c = CLIP_CANVAS[format];
  const at = <T extends { format: string }>(xs: T[] | undefined) => (xs ?? []).filter(d => d.format === format);
  const choose = (d: DesignChoice | null) => { if (!disabled) onChange({ design: d, overlay: null, designProblem: null }); };
  const isChosen = (source: DesignChoice['source'], id: string) => design?.source === source && design.id === id;

  async function remove(d: ClipDesignRow) {
    if (!confirm(`Delete "${d.name}" from My Boomerang designs? Events that use it go back to the plain Boomerang.`)) return;
    const r = await fetch('/api/genie-clip-designs/' + d.id, { method: 'DELETE' });
    if (!r.ok) { alert((await r.json().catch(() => ({}))).error || 'Could not delete'); return; }
    if (isChosen('clip', d.id)) choose(null);
    reload();
  }

  const groups: { title: string; source: DesignChoice['source']; items: ClipDesignRow[]; mine?: boolean }[] = [
    { title: 'Standard designs', source: 'clip', items: at(lib?.standard) },
    { title: 'My Boomerang designs', source: 'clip', items: at(lib?.mine), mine: true },
    ...(format === 'portrait4x6' || format === 'landscape6x4' ? [{ title: 'My single-photo print designs', source: 'print' as const, items: at(lib?.print) }] : []),
  ];

  return (
    <div className="space-y-3">
      {designProblem && (
        <p className="text-sm text-amber-700 flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0"/>
          {designProblem === 'deleted' ? 'The design chosen for this Boomerang was deleted' : `The design chosen for this Boomerang is no longer ${c.label}`}, so iPads get the plain Boomerang. Choose another frame and save.
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        <Tile selected={!design && !overlay} onClick={() => choose(null)} label="None" sub="Plain clip">
          <div className="w-12 h-12 rounded border-2 border-dashed border-gray-300"/>
        </Tile>
        {overlay && !design && (
          <Tile selected onClick={() => {}} label="Overlay uploaded earlier" sub="Kept until you choose another frame">
            <img src={artUrl(overlay.url)} alt="" className="max-w-full max-h-full bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:12px_12px]"/>
          </Tile>
        )}
        {groups.flatMap(g => g.items.map(d => (
          <Tile key={g.source + d.id} selected={isChosen(g.source, d.id)} onClick={() => choose({ source: g.source, id: d.id })} label={d.name} sub={g.title}
            actions={g.mine && !disabled ? (
              <>
                <Link href={`/templates/boomerang/${d.id}?event=${eventId}`} target="_blank" title="Edit in the designer" className="w-6 h-6 rounded bg-white/90 border border-gray-200 flex items-center justify-center text-gray-600 hover:text-gray-900"><Pencil className="w-3 h-3"/></Link>
                <button type="button" onClick={() => remove(d)} title="Delete" className="w-6 h-6 rounded bg-white/90 border border-gray-200 flex items-center justify-center text-[#E2445C]"><Trash2 className="w-3 h-3"/></button>
              </>
            ) : undefined}>
            <ClipDesignPicture d={d} width={90}/>
          </Tile>
        )))}
      </div>
      {lib && groups.every(g => g.items.length === 0) && <p className="text-xs text-gray-400">No designs at {c.label} yet. Design one or upload a frame.</p>}
      <div className="flex flex-wrap gap-2">
        <Link href={`/templates/boomerang/new?format=${format}&event=${eventId}`} target="_blank" aria-disabled={disabled} className={disabled ? 'pointer-events-none opacity-50' : ''}>
          <Button type="button" variant="outline" size="sm" disabled={disabled}><Plus className="w-3.5 h-3.5 mr-1"/>Design one</Button>
        </Link>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setUploading(true)}><Upload className="w-3.5 h-3.5 mr-1"/>Upload a frame</Button>
      </div>
      <UploadFrameModal open={uploading} format={format} onClose={() => setUploading(false)} onSaved={id => { setUploading(false); reload(); choose({ source: 'clip', id }); }}/>
    </div>
  );
}
