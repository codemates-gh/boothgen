'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Pause, Play, Trash2, Upload } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { artUrl } from '@/components/genie/parts';
import { putWithProgress } from '@/components/genie/SettingsForms';
import { RampDrawing, RampEditor } from '@/components/genie/SpinRamp';
import type { Segment } from '@/lib/genie/spin360Options';

// Super Admin → Genie 360 (Genie P15): the available switch and add-on price, the six styles (with their "Example"
// videos), the Standard music library, royalty-free music links and Standard animated overlays

type Style = { id: string; name: string; description: string; version: number; captureFps: 120 | 240; segments: Segment[]; defaultMusicId: string | null; defaultEffects: { lightTrails?: boolean; backgroundRemoval?: boolean }; sampleVideo: string | null; samplePoster: string | null; isActive: boolean };
type Track = { id: string; name: string; moods: string[]; url: string; durationMs: number; credit: string | null; licenseNotes: string | null; isActive: boolean };
type Link = { id: string; name: string; url: string; note: string; isActive: boolean };
type Overlay = { id: string; name: string; url: string; contentType: string; isActive: boolean };
type Data = { ready: boolean; priceCents: number; styles: Style[]; music: Track[]; links: Link[]; overlays: Overlay[] };

const json = (method: string, body?: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const mmss = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

async function upload(kind: 'music' | 'overlay' | 'sample', file: File, type: string, onPct: (n: number) => void): Promise<string> {
  const r = await fetch('/api/genie-360/upload', json('POST', { scope: 'standard', kind, contentType: type, bytes: file.size }));
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Could not start the upload');
  if (!(await putWithProgress(d.uploadUrl, new File([file], file.name, { type }), onPct))) throw new Error("The upload didn't go through. Try again.");
  return d.url;
}

function UploadButton({ label, accept, onFile }: { label: string; accept: string; onFile: (f: File, progress: (s: string) => void) => Promise<void> }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={async e => {
        const f = e.target.files?.[0]; e.target.value = '';
        if (!f) return;
        setError(''); setBusy('Uploading…');
        try { await onFile(f, setBusy); } catch (err) { setError((err as Error).message); }
        setBusy('');
      }}/>
      <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => ref.current?.click()}><Upload className="w-3.5 h-3.5 mr-1.5"/>{busy || label}</Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

function StyleEditor({ style, music, onSaved }: { style: Style; music: Track[]; onSaved: () => void }) {
  const [draft, setDraft] = useState(style);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(style), [style]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(style);
  async function patch(body: Record<string, unknown>) {
    setSaving(true); setError('');
    const r = await fetch('/api/super-admin/genie-360/styles/' + style.id, json('PATCH', body));
    const d = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) { setError(d.error || 'Could not save'); return false; }
    onSaved();
    return true;
  }
  return (
    <Card className={style.isActive ? '' : 'opacity-60'}>
      <CardContent className="p-4 grid grid-cols-1 md:grid-cols-[180px_1fr] gap-4">
        <div className="space-y-2">
          <div className="relative aspect-[9/16] max-h-72 bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center">
            {style.sampleVideo
              ? <video src={artUrl(style.sampleVideo)} poster={style.samplePoster ? artUrl(style.samplePoster) : undefined} muted loop autoPlay playsInline className="w-full h-full object-cover"/>
              : <div className="w-full px-3"><RampDrawing segments={style.segments} className="h-16"/><p className="text-[11px] text-gray-400 text-center mt-2">No Example video yet</p></div>}
            {style.sampleVideo && <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-medium">Example</span>}
          </div>
          <UploadButton label={style.sampleVideo ? 'Replace Example' : 'Upload Example (MP4)'} accept="video/mp4"
            onFile={async (f, p) => { const url = await upload('sample', f, 'video/mp4', n => p(n < 100 ? `Uploading ${n}%` : 'Saving…')); if (!(await patch({ sampleUrl: url }))) throw new Error('Could not save the Example'); }}/>
          {style.sampleVideo && <Button type="button" size="sm" variant="ghost" onClick={() => confirm('Remove the Example video?') && patch({ sampleUrl: null })}>Remove Example</Button>}
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="default">{style.id}</Badge><span className="text-xs text-gray-400">version {style.version}</span>
            {!style.isActive && <Badge variant="default">Off</Badge>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input value={draft.name} maxLength={40} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Name"/>
            <Input value={draft.description} maxLength={80} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="One line"/>
            <Select value={String(draft.captureFps)} onChange={e => setDraft({ ...draft, captureFps: Number(e.target.value) as 120 | 240 })}>
              <option value="120">Capture 120 fps</option><option value="240">Capture 240 fps</option>
            </Select>
            <Select value={draft.defaultMusicId ?? ''} onChange={e => setDraft({ ...draft, defaultMusicId: e.target.value || null })}>
              <option value="">No default song</option>
              {music.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!draft.defaultEffects.lightTrails} onChange={e => setDraft({ ...draft, defaultEffects: { ...draft.defaultEffects, lightTrails: e.target.checked } })}/>Switches on light trails</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!draft.defaultEffects.backgroundRemoval} onChange={e => setDraft({ ...draft, defaultEffects: { ...draft.defaultEffects, backgroundRemoval: e.target.checked } })}/>Switches on background removal</label>
          </div>
          <RampEditor segments={draft.segments} onChange={segments => setDraft({ ...draft, segments })}/>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 flex-wrap">
            <Button type="button" size="sm" disabled={!dirty || saving} onClick={() => patch({ name: draft.name, description: draft.description, captureFps: draft.captureFps, segments: draft.segments, defaultMusicId: draft.defaultMusicId, defaultEffects: draft.defaultEffects })}>{saving ? 'Saving…' : 'Save style'}</Button>
            {dirty && <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(style)}>Undo changes</Button>}
            <Button type="button" size="sm" variant="outline" onClick={() => patch({ isActive: !style.isActive })}>{style.isActive ? <><EyeOff className="w-3.5 h-3.5 mr-1"/>Off</> : <><Eye className="w-3.5 h-3.5 mr-1"/>On</>}</Button>
          </div>
          <p className="text-xs text-gray-400">Changing the speed ramp or capture bumps the version, so iPhones pick it up with the event&apos;s next update. Events that customised the ramp keep theirs.</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Genie360Manager() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [price, setPrice] = useState('');
  const [priceSaved, setPriceSaved] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [link, setLink] = useState({ name: '', url: '', note: '' });
  const [track, setTrack] = useState({ moods: '', credit: '', licenseNotes: '' });

  async function load() {
    const r = await fetch('/api/super-admin/genie-360');
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Could not load Genie 360'); return; }
    setData(d);
    setPrice(p => p || (d.priceCents / 100).toFixed(2));
  }
  useEffect(() => { load(); return () => audio.current?.pause(); }, []);

  async function call(url: string, method: string, body?: unknown) {
    setError('');
    const r = await fetch(url, json(method, body));
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Could not save'); return null; }
    await load();
    return d;
  }

  async function toggleReady() {
    if (!data) return;
    if (!data.ready && !confirm('Operators will see Genie 360 on their events and can add it (a paid add-on). Turn it on once the Genie TestFlight build with 360 is ready. Turn it on?')) return;
    await call('/api/super-admin/genie-360', 'PATCH', { ready: !data.ready });
  }
  async function savePrice() {
    const cents = Math.round(Number(price) * 100);
    const r = await fetch('/api/super-admin/genie-usage', json('PATCH', { addOnPrices: { genie360: cents } }));
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error || 'Could not save the price'); return; }
    setPriceSaved(true); load();
  }
  function play(t: Track) {
    audio.current?.pause();
    if (playing === t.id) { setPlaying(null); return; }
    const a = audio.current ?? (audio.current = new Audio());
    a.src = artUrl(t.url); a.onended = () => setPlaying(null);
    a.play().then(() => setPlaying(t.id)).catch(() => setPlaying(null));
  }
  async function move<T extends { id: string }>(rows: T[], i: number, d: -1 | 1, url: (id: string) => string) {
    const a = rows[i], b = rows[i + d];
    if (!a || !b) return;
    await fetch(url(a.id), json('PATCH', { sortOrder: i + d }));
    await call(url(b.id), 'PATCH', { sortOrder: i });
  }

  if (!data) return <p className="text-sm text-gray-400">{error || 'Loading…'}</p>;
  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card><CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-700">Genie 360 available</p>
            <p className="text-sm text-gray-500">{data.ready
              ? 'On: operators see Genie 360 on their events and can add it.'
              : "Off: operators don't see Genie 360. Turn it on when the Genie TestFlight build with 360 is ready (events that already have it keep it)."}</p>
          </div>
          <Button variant={data.ready ? 'outline' : 'default'} onClick={toggleReady}>{data.ready ? 'Turn off' : 'Turn on'}</Button>
        </div>
        <div className="flex items-end gap-3 flex-wrap border-t pt-4">
          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Add-on price per event</span>
            <div className="flex items-center gap-2"><span className="text-sm text-gray-500">$</span><Input type="number" min="0.5" step="0.01" className="w-28" value={price} onChange={e => { setPrice(e.target.value); setPriceSaved(false); }}/></div>
          </label>
          <Button onClick={savePrice} disabled={!price}>{priceSaved ? '✓ Saved' : 'Save price'}</Button>
          <span className="text-xs text-gray-500">For every account, also Genius accounts that don&apos;t pay per event. No render allowance: editing runs on the iPhone.</span>
        </div>
      </CardContent></Card>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Styles</h2>
          <p className="text-sm text-gray-500">What operators pick first. Each card plays its Example video (labelled &quot;Example&quot;); until one is uploaded, operators see a drawing of the speed ramp.</p>
        </div>
        {data.styles.map((s, i) => (
          <div key={s.id} className="flex gap-2">
            <div className="flex flex-col gap-1 pt-4">
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => move(data.styles, i, -1, id => '/api/super-admin/genie-360/styles/' + id)} aria-label="Move up"><ArrowUp className="w-4 h-4"/></Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === data.styles.length - 1} onClick={() => move(data.styles, i, 1, id => '/api/super-admin/genie-360/styles/' + id)} aria-label="Move down"><ArrowDown className="w-4 h-4"/></Button>
            </div>
            <div className="flex-1"><StyleEditor style={s} music={data.music} onSaved={load}/></div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Standard music</h2>
          <p className="text-sm text-gray-500">Songs every operator can pick. Keep a note of which service, plan and date each was made or licensed on. Can stay empty: operators upload their own.</p>
        </div>
        <Card><CardContent className="p-4 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Input placeholder="Moods, comma-separated (e.g. upbeat, party)" value={track.moods} onChange={e => setTrack({ ...track, moods: e.target.value })}/>
            <Input placeholder="Credit line (optional)" value={track.credit} onChange={e => setTrack({ ...track, credit: e.target.value })}/>
            <Input placeholder="Licence notes: service, plan, date" value={track.licenseNotes} onChange={e => setTrack({ ...track, licenseNotes: e.target.value })}/>
          </div>
          <UploadButton label="Upload a song (MP3 / M4A)" accept=".mp3,.m4a,audio/mpeg,audio/mp4" onFile={async (f, p) => {
            const type = /\.mp3$/i.test(f.name) ? 'audio/mpeg' : 'audio/mp4';
            const url = await upload('music', f, type, n => p(n < 100 ? `Uploading ${n}%` : 'Checking…'));
            const d = await call('/api/genie-360/music', 'POST', {
              scope: 'standard', url, name: f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 80) || 'Song',
              moods: track.moods.split(',').map(m => m.trim()).filter(Boolean).slice(0, 6), credit: track.credit.trim() || null, licenseNotes: track.licenseNotes.trim() || null,
            });
            if (d) setTrack({ moods: '', credit: '', licenseNotes: '' });
          }}/>
        </CardContent></Card>
        {data.music.length > 0 && (
          <div className="border border-gray-100 rounded-xl divide-y divide-gray-100 bg-white">
            {data.music.map((t, i) => (
              <div key={t.id} className={'flex items-center gap-3 p-3 ' + (t.isActive ? '' : 'opacity-60')}>
                <button type="button" onClick={() => play(t)} aria-label={playing === t.id ? 'Pause' : 'Play'}>{playing === t.id ? <Pause className="w-4 h-4"/> : <Play className="w-4 h-4"/>}</button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.name} <span className="text-xs text-gray-400">{mmss(t.durationMs)}</span></p>
                  <p className="text-xs text-gray-500 truncate">{[t.moods.join(', '), t.credit, t.licenseNotes].filter(Boolean).join(' · ') || 'No notes'}</p>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={i === 0} onClick={() => move(data.music, i, -1, id => '/api/genie-360/music/' + id)} aria-label="Move up"><ArrowUp className="w-4 h-4"/></Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => { const name = prompt('Rename song', t.name)?.trim(); if (name && name !== t.name) call('/api/genie-360/music/' + t.id, 'PATCH', { name }); }}>Rename</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => { const n = prompt('Licence notes (service, plan, date)', t.licenseNotes ?? ''); if (n !== null) call('/api/genie-360/music/' + t.id, 'PATCH', { licenseNotes: n.trim() || null }); }}>Notes</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => call('/api/genie-360/music/' + t.id, 'PATCH', { isActive: !t.isActive })}>{t.isActive ? 'Off' : 'On'}</Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-[#E2445C]" onClick={() => confirm(`Delete ${t.name}?`) && call('/api/genie-360/music/' + t.id, 'DELETE')} aria-label="Delete"><Trash2 className="w-4 h-4"/></Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Royalty-free music links</h2>
          <p className="text-sm text-gray-500">Shown in the event&apos;s Music block under &quot;Find royalty-free music&quot;, opening in a new tab. Use your affiliate links.</p>
        </div>
        <Card><CardContent className="p-4 grid grid-cols-1 sm:grid-cols-[1fr_2fr_2fr_auto] gap-2">
          <Input placeholder="Site (e.g. Epidemic Sound)" value={link.name} onChange={e => setLink({ ...link, name: e.target.value })}/>
          <Input placeholder="https://… (affiliate link)" value={link.url} onChange={e => setLink({ ...link, url: e.target.value })}/>
          <Input placeholder="One-line note" value={link.note} onChange={e => setLink({ ...link, note: e.target.value })}/>
          <Button disabled={!link.name || !link.url} onClick={async () => { if (await call('/api/super-admin/genie-360/links', 'POST', link)) setLink({ name: '', url: '', note: '' }); }}>Add</Button>
        </CardContent></Card>
        {data.links.length > 0 && (
          <div className="border border-gray-100 rounded-xl divide-y divide-gray-100 bg-white">
            {data.links.map(l => (
              <div key={l.id} className={'flex items-center gap-3 p-3 ' + (l.isActive ? '' : 'opacity-60')}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{l.name}</p>
                  <p className="text-xs text-gray-500 truncate"><a href={l.url} target="_blank" rel="noopener noreferrer" className="underline">{l.url}</a>{l.note && ` · ${l.note}`}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => call('/api/super-admin/genie-360/links/' + l.id, 'PATCH', { isActive: !l.isActive })}>{l.isActive ? 'Off' : 'On'}</Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-[#E2445C]" onClick={() => confirm(`Delete ${l.name}?`) && call('/api/super-admin/genie-360/links/' + l.id, 'DELETE')} aria-label="Delete"><Trash2 className="w-4 h-4"/></Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Animated overlays</h2>
            <p className="text-sm text-gray-500">Standard overlays that move on top of every frame: animated PNG, WebP, GIF, or MOV with transparency, up to 15 MB.</p>
          </div>
          <UploadButton label="Upload an overlay" accept=".png,.webp,.gif,.mov,image/png,image/webp,image/gif,video/quicktime" onFile={async (f, p) => {
            const type = /\.mov$/i.test(f.name) ? 'video/quicktime' : f.type;
            const url = await upload('overlay', f, type, n => p(n < 100 ? `Uploading ${n}%` : 'Saving…'));
            await call('/api/genie-360/overlays', 'POST', { scope: 'standard', url, name: f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 80) || 'Overlay' });
          }}/>
        </div>
        {data.overlays.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {data.overlays.map(o => (
              <Card key={o.id} className={o.isActive ? '' : 'opacity-60'}>
                <div className="aspect-square bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:16px_16px] flex items-center justify-center rounded-t-lg overflow-hidden">
                  {o.contentType === 'video/quicktime' ? <video src={artUrl(o.url)} muted loop autoPlay playsInline className="max-w-full max-h-full"/> : <img src={artUrl(o.url)} alt={o.name} className="max-w-full max-h-full"/>}
                </div>
                <CardContent className="p-2 flex items-center gap-1">
                  <p className="text-sm flex-1 truncate">{o.name}</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => call('/api/genie-360/overlays/' + o.id, 'PATCH', { isActive: !o.isActive })}>{o.isActive ? 'Off' : 'On'}</Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-[#E2445C]" onClick={() => confirm(`Delete ${o.name}?`) && call('/api/genie-360/overlays/' + o.id, 'DELETE')} aria-label="Delete"><Trash2 className="w-4 h-4"/></Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
