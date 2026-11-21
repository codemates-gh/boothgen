'use client';
import { useEffect, useRef, useState } from 'react';
import { Copy, Pencil, RotateCw, Trash2, Upload } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { artUrl } from '@/components/genie/parts';
import { putWithProgress } from '@/components/genie/SettingsForms';
import { RampDrawing, RampEditor } from '@/components/genie/SpinRamp';
import { Spin360Editor, spin360Body, spin360NumbersFilled, type Library, type Spin360Value } from '@/app/(tenant)/events/[id]/genie/Genie360';
import { OVERLAY_MAX_BYTES, OVERLAY_TYPES, STABILIZATION_NOTE, needs240, type Segment } from '@/lib/genie/spin360Options';

// Genie → Genie 360 (Genie P15): the spinner booth's setup. Styles (Standard + My styles), the music library, animated
// overlays, and the full setup new 360 events start from. Events keep an on/off switch and quick tweaks.

type Style = Library['styles'][number] & { version?: number };
const json = (method: string, body?: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });

function StyleEdit({ style, onClose, onSaved }: { style: Style; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(style.name);
  const [description, setDescription] = useState(style.description);
  const [fps, setFps] = useState<120 | 240>(style.captureFps);
  const [segments, setSegments] = useState<Segment[]>(style.segments);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true); setError('');
    const r = await fetch('/api/genie-360/styles/' + style.id, json('PATCH', { name, description, captureFps: fps, segments }));
    const d = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) { setError(d.error || 'Could not save'); return; }
    onSaved(); onClose();
  }
  return (
    <Modal open onClose={onClose} title="Edit My Style" className="max-w-3xl">
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="Name"/>
          <Input value={description} maxLength={80} onChange={e => setDescription(e.target.value)} placeholder="One line about it"/>
        </div>
        <select value={String(fps)} onChange={e => setFps(Number(e.target.value) as 120 | 240)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
          <option value="120">Capture 120 fps: brighter, cooler</option>
          <option value="240">Capture 240 fps: smoothest slow motion; needs more light</option>
        </select>
        {needs240(segments) && fps === 120 && <p className="text-xs text-amber-700">This speed ramp is slower than 4×: 240 fps makes it smoother.</p>}
        <RampEditor segments={segments} onChange={setSegments}/>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </Modal>
  );
}

async function uploadMine(kind: 'music' | 'overlay', file: File, type: string, onPct: (n: number) => void, extra: Record<string, unknown>) {
  const r = await fetch('/api/genie-360/upload', json('POST', { scope: 'mine', kind, contentType: type, bytes: file.size }));
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Could not start the upload');
  if (!(await putWithProgress(d.uploadUrl, new File([file], file.name, { type }), onPct))) throw new Error("The upload didn't go through. Try again.");
  const name = file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 80) || (kind === 'music' ? 'Song' : 'Overlay');
  const s = await fetch('/api/genie-360/' + (kind === 'music' ? 'music' : 'overlays'), json('POST', { scope: 'mine', url: d.url, name, ...extra }));
  const sd = await s.json().catch(() => ({}));
  if (!s.ok) throw new Error(sd.error || 'Could not save the file');
}

export default function Genie360Page() {
  const [lib, setLib] = useState<Library | null>(null);
  const [setup, setSetup] = useState<Spin360Value | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [editing, setEditing] = useState<Style | null>(null);
  const [busy, setBusy] = useState('');
  const overlayRef = useRef<HTMLInputElement>(null);

  const loadLib = () => fetch('/api/genie-360/library').then(r => (r.ok ? r.json() : null)).then(d => { if (d) setLib(d); });
  async function loadSetup() {
    const r = await fetch('/api/genie-360/setup');
    if (!r.ok) { setError('Could not load your Genie 360 setup'); return; }
    const s = (await r.json()).setup as Spin360Value;
    setSetup(s); setSaved(JSON.stringify(s));
  }
  useEffect(() => { loadLib(); loadSetup(); }, []);

  async function call(url: string, init: RequestInit) {
    setError('');
    const r = await fetch(url, init);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Something went wrong'); return null; }
    await loadLib();
    return d;
  }
  async function saveSetup() {
    if (!setup) return;
    if (!spin360NumbersFilled({ ...setup, enabled: true })) { setError('Fill in every number before saving.'); return; }
    setSaving(true); setError('');
    const r = await fetch('/api/genie-360/setup', json('PUT', spin360Body(setup)));
    const d = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) { setError(d.error || 'Could not save'); return; }
    setSetup(d.setup); setSaved(JSON.stringify(d.setup)); setSavedAt(Date.now());
  }

  const mine = lib?.styles.filter(s => s.source === 'account') ?? [];
  const songs = lib?.music.filter(t => t.source === 'account') ?? [];
  const overlays = lib?.overlays.filter(o => o.source === 'account') ?? [];
  const dirty = !!setup && JSON.stringify(setup) !== saved;

  if (lib && !lib.available) {
    return (
      <>
        <TopBar title="Genie 360"/>
        <div className="p-4 sm:p-8 max-w-6xl">
          <Card><CardContent className="text-center py-12 text-gray-500">
            <RotateCw className="w-10 h-10 mx-auto mb-3 text-gray-300"/>
            <p className="font-medium text-gray-700 mb-1">Genie 360 is coming soon</p>
            <p className="text-sm">The spinner booth isn&apos;t available yet.</p>
          </CardContent></Card>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Genie 360"/>
      <div className="p-4 sm:p-8 space-y-6 max-w-6xl">
        <p className="text-sm text-gray-500">The spinner booth: an iPhone on the arm records guests as it turns and edits a slow-motion video with your music and design. {STABILIZATION_NOTE} Set it up here; each event has an on/off switch (a paid add-on) and quick changes on its Genie page.</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!lib || !setup ? <p className="text-sm text-gray-400">Loading…</p> : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><RotateCw className="w-4 h-4"/>My styles</CardTitle>
                <p className="text-sm text-gray-500 mt-1">Your own speed ramps, next to the Standard styles everywhere you pick one. Change their pieces: forward or rewind, how fast, and how they join.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {mine.length === 0 ? <p className="text-sm text-gray-500">None yet. Pick a style in the setup below and use &ldquo;Copy to My styles&rdquo;.</p> : (
                  <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
                    {mine.map(s => (
                      <div key={s.id} className="flex items-center gap-3 p-3">
                        <div className="w-32 flex-shrink-0"><RampDrawing segments={s.segments} className="h-8"/></div>
                        <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{s.name}</p><p className="text-xs text-gray-500 truncate">{s.description} · {s.captureFps} fps</p></div>
                        <Button variant="ghost" size="sm" onClick={() => setEditing(s)}><Pencil className="w-3.5 h-3.5 mr-1"/>Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => call('/api/genie-360/styles', json('POST', { fromId: s.id }))}><Copy className="w-3.5 h-3.5 mr-1"/>Copy</Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-[#E2445C]" aria-label="Delete" onClick={() => confirm(`Delete ${s.name}?`) && call('/api/genie-360/styles/' + s.id, { method: 'DELETE' })}><Trash2 className="w-4 h-4"/></Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>My songs and overlays</CardTitle>
                <p className="text-sm text-gray-500 mt-1">Rename or delete the songs you uploaded (upload new ones in Music below). Animated overlays move on top of every frame; pick one under Advanced.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {songs.length > 0 && (
                  <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
                    {songs.map(t => (
                      <div key={t.id} className="flex items-center gap-3 p-3">
                        <p className="text-sm flex-1 truncate">{t.name}</p>
                        <Badge variant="info">Song</Badge>
                        <Button variant="ghost" size="sm" onClick={() => { const name = prompt('Rename song', t.name)?.trim(); if (name && name !== t.name) call('/api/genie-360/music/' + t.id, json('PATCH', { name })); }}>Rename</Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-[#E2445C]" aria-label="Delete" onClick={() => confirm(`Delete ${t.name}?`) && call('/api/genie-360/music/' + t.id, { method: 'DELETE' })}><Trash2 className="w-4 h-4"/></Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-start gap-3 flex-wrap">
                  <input ref={overlayRef} type="file" accept=".png,.webp,.gif,.mov,image/png,image/webp,image/gif,video/quicktime" className="hidden" onChange={async e => {
                    const f = e.target.files?.[0]; e.target.value = '';
                    if (!f) return;
                    const type = /\.mov$/i.test(f.name) ? 'video/quicktime' : f.type;
                    if (!OVERLAY_TYPES[type]) { setError('Use an animated PNG, WebP, GIF, or a MOV with transparency.'); return; }
                    if (f.size > OVERLAY_MAX_BYTES) { setError('Animated overlays must be 15 MB or smaller.'); return; }
                    setBusy('Uploading…');
                    try { await uploadMine('overlay', f, type, n => setBusy(n < 100 ? `Uploading ${n}%` : 'Saving…'), {}); await loadLib(); } catch (err) { setError((err as Error).message); }
                    setBusy('');
                  }}/>
                  <Button variant="outline" size="sm" disabled={!!busy} onClick={() => overlayRef.current?.click()}><Upload className="w-3.5 h-3.5 mr-1.5"/>{busy || 'Upload an animated overlay'}</Button>
                </div>
                {overlays.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                    {overlays.map(o => (
                      <div key={o.id} className="rounded-lg border border-gray-100 overflow-hidden">
                        <div className="aspect-square bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:16px_16px] flex items-center justify-center">
                          {o.contentType === 'video/quicktime' ? <video src={artUrl(o.url)} muted loop autoPlay playsInline className="max-w-full max-h-full"/> : <img src={artUrl(o.url)} alt={o.name} className="max-w-full max-h-full"/>}
                        </div>
                        <div className="p-1.5 flex items-center gap-1">
                          <p className="text-xs flex-1 truncate">{o.name}</p>
                          <button type="button" className="text-[#E2445C]" aria-label="Delete" onClick={() => confirm(`Delete ${o.name}?`) && call('/api/genie-360/overlays/' + o.id, { method: 'DELETE' })}><Trash2 className="w-3.5 h-3.5"/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <CardTitle>Setup for new 360 events</CardTitle>
                    <p className="text-sm text-gray-500 mt-1">What an event starts from when you add Genie 360 to it. Changing it here doesn&apos;t change events that already have 360; use &ldquo;Use my Genie 360 setup again&rdquo; on an event for that.</p>
                  </div>
                  <Button onClick={saveSetup} disabled={saving || !dirty}>{saving ? 'Saving…' : savedAt && !dirty ? '✓ Saved' : 'Save setup'}</Button>
                </div>
              </CardHeader>
              <CardContent>
                <Spin360Editor mode="setup" value={setup} lib={lib} onLibrary={loadLib} onChange={p => setSetup(s => s && ({ ...s, ...p }))}
                  onCopyStyle={async id => { const d = await call('/api/genie-360/styles', json('POST', { fromId: id })); if (d?.style) setEditing(d.style); }}/>
                <div className="flex justify-end pt-4 border-t mt-6">
                  <Button onClick={saveSetup} disabled={saving || !dirty}>{saving ? 'Saving…' : savedAt && !dirty ? '✓ Saved' : 'Save setup'}</Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
      {editing && <StyleEdit style={editing} onClose={() => setEditing(null)} onSaved={loadLib}/>}
    </>
  );
}
