'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Music, Pause, Play, Upload, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Toggle, artUrl } from '@/components/genie/parts';
import { putWithProgress } from '@/components/genie/SettingsForms';
import { FONT_OPTIONS } from '@/lib/templates/clientOptions';
import {
  BRIGHTNESS, END_LIMITS, LIGHT_MODE_OPTIONS, MUSIC_LICENSE_REMINDER, MUSIC_MAX_BYTES, MUSIC_PREVIEW_MS, MUSIC_RIGHTS_LABEL,
  MUSIC_SOCIAL_NOTE, OVERLAY_MAX_BYTES, OVERLAY_TYPES, SPIN_FORMATS, SPIN_FORMAT_LABELS, SPIN_MOUNT_HINT,
  SPIN_VIDEO_SIZE_OPTIONS, STABILIZATION_NOTE, TITLE_ANIMATIONS, TRAIL_LENGTHS, defaultSpinConsent, needs240,
  type Segment, type SpinEnd, type SpinFormat, type StoredSpin360,
} from '@/lib/genie/spin360Options';
import { BoomerangTemplateField } from './BoomerangTemplate';
import { RampDrawing, RampEditor } from '@/components/genie/SpinRamp';

// Event → Genie → Genie 360 (Genie P15): the spinner booth, a paid add-on per event. The easy path is the first three
// blocks (style, music, design); everything else is under Advanced with good defaults.

export type Spin360Value = StoredSpin360;
type Style = { id: string; name: string; description: string; captureFps: 120 | 240; segments: Segment[]; defaultMusicId: string | null; defaultEffects: { lightTrails?: boolean; backgroundRemoval?: boolean }; sampleVideo: string | null; samplePoster: string | null };
type Track = { id: string; name: string; moods: string[]; url: string; durationMs: number; credit: string | null; source: 'standard' | 'account' };
type Overlay = { id: string; name: string; url: string; contentType: string; source: 'standard' | 'account' };
type LibBackdrop = { id: string; name: string; is360: boolean; thumbnail: string };
type Library = { styles: Style[]; music: Track[]; links: { id: string; name: string; url: string; note: string }[]; overlays: Overlay[]; backdrops: LibBackdrop[] };

const fmtCents = (c: number) => '$' + (c / 100).toFixed(c % 100 ? 2 : 0);
const mmss = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// The save body: consent text left empty = BoothGen's wording
export function spin360Body(v: Spin360Value): Spin360Value {
  return { ...v, consentText: v.consentText?.trim() || null };
}

function StyleCard({ style, selected, onPick, disabled }: { style: Style; selected: boolean; onPick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onPick}
      className={'text-left rounded-xl border-2 overflow-hidden transition-colors ' + (selected ? 'border-brand' : 'border-gray-100 hover:border-gray-300')}>
      <div className="relative aspect-[9/16] max-h-56 w-full bg-gray-900 flex items-center justify-center">
        {style.sampleVideo
          ? <video src={artUrl(style.sampleVideo)} poster={style.samplePoster ? artUrl(style.samplePoster) : undefined} muted loop autoPlay playsInline className="w-full h-full object-cover"/>
          : <div className="w-full px-3 text-center"><RampDrawing segments={style.segments} className="h-16"/><p className="text-[11px] text-gray-400 mt-2">Example video coming soon</p></div>}
        {style.sampleVideo && <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-medium">Example</span>}
      </div>
      <div className="p-2.5">
        <p className="text-sm font-semibold">{style.name}</p>
        <p className="text-xs text-gray-500 leading-snug">{style.description}</p>
      </div>
    </button>
  );
}

// One shared player for the Music list and the 15 s preview
function usePlayer() {
  const ref = useRef<HTMLAudioElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  function stop() { ref.current?.pause(); if (timer.current) clearTimeout(timer.current); setPlaying(null); }
  function play(key: string, url: string, startMs = 0, forMs?: number) {
    stop();
    const a = ref.current ?? (ref.current = new Audio());
    a.src = artUrl(url); a.currentTime = startMs / 1000;
    a.onended = () => setPlaying(null);
    a.play().then(() => setPlaying(key)).catch(() => setPlaying(null));
    if (forMs) timer.current = setTimeout(stop, forMs);
  }
  useEffect(() => stop, []);
  return { playing, play, stop };
}

// The song's waveform, to pick where the music starts
function Waveform({ url, durationMs, startMs, onChange, disabled }: { url: string; durationMs: number; startMs: number; onChange: (ms: number) => void; disabled?: boolean }) {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  useEffect(() => {
    let off = false;
    setPeaks(null);
    (async () => {
      try {
        const buf = await (await fetch(artUrl(url))).arrayBuffer();
        const ctx = new AudioContext();
        const audio = await ctx.decodeAudioData(buf);
        ctx.close();
        const data = audio.getChannelData(0), n = 160, step = Math.floor(data.length / n);
        const p = Array.from({ length: n }, (_, i) => { let m = 0; for (let j = i * step; j < (i + 1) * step; j += 32) m = Math.max(m, Math.abs(data[j] ?? 0)); return m; });
        const max = Math.max(...p) || 1;
        if (!off) setPeaks(p.map(v => v / max));
      } catch { if (!off) setPeaks([]); }
    })();
    return () => { off = true; };
  }, [url]);
  const at = startMs / durationMs, len = Math.min(1 - at, MUSIC_PREVIEW_MS / durationMs);
  return (
    <div className="space-y-1">
      <div className={'relative h-14 rounded-lg bg-gray-50 overflow-hidden ' + (disabled ? '' : 'cursor-pointer')}
        onClick={e => { if (disabled) return; const r = e.currentTarget.getBoundingClientRect(); onChange(Math.round(Math.max(0, Math.min(0.98, (e.clientX - r.left) / r.width)) * durationMs / 500) * 500); }}>
        {peaks && peaks.length > 0 && (
          <svg viewBox={`0 0 ${peaks.length} 100`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
            {peaks.map((p, i) => <rect key={i} x={i + 0.15} width={0.7} y={50 - p * 46} height={Math.max(1, p * 92)} className="fill-gray-300"/>)}
          </svg>
        )}
        {peaks === null && <p className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">Loading the waveform…</p>}
        <div className="absolute inset-y-0 bg-brand/20 border-l-2 border-brand" style={{ left: `${at * 100}%`, width: `${len * 100}%` }}/>
      </div>
      <p className="text-xs text-gray-500">Starts at {mmss(startMs)} of {mmss(durationMs)}. Click the waveform to move the start; the shaded part is the first 15 seconds.</p>
    </div>
  );
}

async function uploadSpinFile(kind: 'music' | 'overlay', file: File, onPct: (n: number) => void, extra: Record<string, unknown>) {
  const r = await fetch('/api/genie-360/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'mine', kind, contentType: file.type, bytes: file.size }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Could not start the upload');
  if (!(await putWithProgress(d.uploadUrl, file, onPct))) throw new Error("The upload didn't go through. Check your connection and try again.");
  const name = file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 80) || (kind === 'music' ? 'Song' : 'Overlay');
  const s = await fetch(`/api/genie-360/${kind === 'music' ? 'music' : 'overlays'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'mine', url: d.url, name, ...extra }) });
  const sd = await s.json().catch(() => ({}));
  if (!s.ok) throw new Error(sd.error || 'Could not save the file');
  return sd;
}

function MusicBlock({ value, lib, onChange, onLibrary, disabled }: { value: Spin360Value; lib: Library; onChange: (p: Partial<Spin360Value>) => void; onLibrary: () => void; disabled?: boolean }) {
  const player = usePlayer();
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [links, setLinks] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const track = value.music ? lib.music.find(t => t.id === value.music!.trackId) : undefined;

  async function upload(f: File) {
    setError('');
    if (!/\.(mp3|m4a)$/i.test(f.name)) { setError('Use an MP3 or M4A file.'); return; }
    if (f.size > MUSIC_MAX_BYTES) { setError('Songs must be 10 MB or smaller.'); return; }
    const type = f.type || (/\.mp3$/i.test(f.name) ? 'audio/mpeg' : 'audio/mp4');
    setBusy('Uploading…');
    try {
      const d = await uploadSpinFile('music', new File([f], f.name, { type }), pct => setBusy(pct < 100 ? `Uploading ${pct}%` : 'Checking…'), { rightsConfirmed: true });
      onLibrary();
      onChange({ music: { trackId: d.track.id, startMs: 0, volume: value.music?.volume ?? 0.8 } });
      setRights(false);
    } catch (e) { setError((e as Error).message); }
    setBusy('');
  }

  return (
    <div className="space-y-3">
      <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
        <label className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
          <input type="radio" name="spin-music" checked={!value.music} disabled={disabled} onChange={() => { player.stop(); onChange({ music: null }); }}/>
          <span className="flex-1">No music</span>
        </label>
        {lib.music.map(t => (
          <label key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
            <input type="radio" name="spin-music" checked={value.music?.trackId === t.id} disabled={disabled}
              onChange={() => onChange({ music: { trackId: t.id, startMs: 0, volume: value.music?.volume ?? 0.8 } })}/>
            <button type="button" className="text-gray-500 hover:text-brand" aria-label={player.playing === t.id ? 'Pause' : 'Play'}
              onClick={e => { e.preventDefault(); player.playing === t.id ? player.stop() : player.play(t.id, t.url); }}>
              {player.playing === t.id ? <Pause className="w-4 h-4"/> : <Play className="w-4 h-4"/>}
            </button>
            <span className="flex-1 min-w-0">
              <span className="truncate block">{t.name}</span>
              {t.credit && <span className="text-xs text-gray-400 truncate block">{t.credit}</span>}
            </span>
            {t.moods.map(m => <Badge key={m} variant="default">{m}</Badge>)}
            {t.source === 'account' && <Badge variant="info">Yours</Badge>}
            <span className="text-xs text-gray-400 w-10 text-right">{mmss(t.durationMs)}</span>
          </label>
        ))}
        {lib.music.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No Standard songs yet. Upload your own below.</p>}
      </div>

      {track && value.music && (
        <div className="space-y-3 p-3 border border-gray-100 rounded-lg">
          <Waveform url={track.url} durationMs={track.durationMs} startMs={value.music.startMs} disabled={disabled}
            onChange={startMs => onChange({ music: { ...value.music!, startMs } })}/>
          <div className="flex items-center gap-3 flex-wrap">
            <Button type="button" size="sm" variant="outline" onClick={() => player.playing === 'preview' ? player.stop() : player.play('preview', track.url, value.music!.startMs, MUSIC_PREVIEW_MS)}>
              {player.playing === 'preview' ? <><Pause className="w-3.5 h-3.5 mr-1"/>Stop</> : <><Play className="w-3.5 h-3.5 mr-1"/>Play 15 seconds</>}
            </Button>
            <label className="flex items-center gap-2 text-sm text-gray-600">Volume
              <input type="range" min={0} max={1} step={0.05} value={value.music.volume} disabled={disabled} onChange={e => onChange({ music: { ...value.music!, volume: Number(e.target.value) } })}/>
              <span className="w-10 text-xs text-gray-500">{Math.round(value.music.volume * 100)}%</span>
            </label>
          </div>
        </div>
      )}

      {!disabled && (
        <div className="p-3 border border-dashed border-gray-200 rounded-lg space-y-2">
          <p className="text-sm font-medium">Upload a song</p>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" className="mt-0.5" checked={rights} onChange={e => setRights(e.target.checked)}/>{MUSIC_RIGHTS_LABEL}
          </label>
          <p className="text-xs text-gray-500">MP3 or M4A, up to 10 MB and 6 minutes. {MUSIC_SOCIAL_NOTE}</p>
          <input ref={fileRef} type="file" accept=".mp3,.m4a,audio/mpeg,audio/mp4,audio/x-m4a" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }}/>
          <Button type="button" size="sm" variant="outline" disabled={!rights || !!busy} onClick={() => fileRef.current?.click()}><Upload className="w-3.5 h-3.5 mr-1.5"/>{busy || 'Upload a song'}</Button>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}

      {lib.links.length > 0 && (
        <div>
          <button type="button" className="text-sm text-brand inline-flex items-center gap-1" onClick={() => setLinks(o => !o)}>
            {links ? <ChevronDown className="w-4 h-4"/> : <ChevronRight className="w-4 h-4"/>}<Music className="w-3.5 h-3.5"/>Find royalty-free music
          </button>
          {links && (
            <div className="mt-2 p-3 border border-gray-100 rounded-lg space-y-2">
              {lib.links.map(l => (
                <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer sponsored" className="flex items-start gap-2 text-sm hover:text-brand">
                  <ExternalLink className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"/><span><span className="font-medium">{l.name}</span>{l.note && <span className="text-gray-500"> · {l.note}</span>}</span>
                </a>
              ))}
              <p className="text-xs text-amber-700">{MUSIC_LICENSE_REMINDER}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Intro or outro: None / Logo card / Image / Video, uploaded through the attract-screen encoder (JPEG / MP4)
function EndField({ label, value, onChange, disabled }: { label: 'intro' | 'outro'; value: SpinEnd | null; onChange: (v: SpinEnd | null) => void; disabled?: boolean }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const kind = value?.kind ?? 'none';
  async function upload(f: File) {
    setError(''); setBusy('Uploading…');
    try {
      const r = await fetch('/api/genie-attract/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contentType: f.type, bytes: f.size }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not start the upload');
      if (!(await putWithProgress(d.uploadUrl, f, pct => setBusy(pct < 100 ? `Uploading ${pct}%` : 'Converting…')))) throw new Error("The upload didn't go through. Try again.");
      const e = await fetch('/api/genie-attract/encode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: d.url }) });
      const ed = await e.json().catch(() => ({}));
      if (!e.ok) throw new Error(ed.error || "That file couldn't be converted. Try a different one.");
      const isVideo = String(ed.media.contentType).startsWith('video/');
      if (isVideo && (ed.durationMs ?? 0) > 5250) throw new Error(`The ${label} video must be 5 seconds or shorter.`);
      onChange({ kind: isVideo ? 'video' : 'image', media: ed.media, seconds: isVideo ? Math.min(5, Math.max(1, Math.round((ed.durationMs ?? 5000) / 1000))) : END_LIMITS.image.def });
    } catch (err) { setError((err as Error).message); }
    setBusy('');
  }
  const lim = value ? END_LIMITS[value.kind] : null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={kind} disabled={disabled} className="w-40" onChange={e => {
          const k = e.target.value;
          if (k === 'none') onChange(null);
          else if (k === 'logoCard') onChange({ kind: 'logoCard', seconds: END_LIMITS.logoCard.def, media: null });
          else onChange({ kind: k as 'image' | 'video', seconds: END_LIMITS[k as 'image' | 'video'].def, media: null });
        }}>
          <option value="none">None</option>
          <option value="logoCard">Logo card</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
        </Select>
        {value && lim && (
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <Input type="number" className="w-20" min={lim.min} max={lim.max} step={0.5} value={value.seconds} disabled={disabled}
              onChange={e => onChange({ ...value, seconds: Number(e.target.value) })}/>seconds ({lim.min}–{lim.max})
          </label>
        )}
      </div>
      {value?.kind === 'logoCard' && <p className="text-xs text-gray-500">Made by Genie from the event&apos;s start-screen logo and title.</p>}
      {value && value.kind !== 'logoCard' && (
        <div className="flex items-center gap-3">
          {value.media && (value.kind === 'video'
            ? <video src={artUrl(value.media.url)} muted playsInline className="h-16 rounded bg-black"/>
            : <img src={artUrl(value.media.url)} alt="" className="h-16 rounded"/>)}
          <input ref={ref} type="file" accept={value.kind === 'video' ? 'video/mp4,video/quicktime' : 'image/jpeg,image/png'} className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }}/>
          {!disabled && <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => ref.current?.click()}><Upload className="w-3.5 h-3.5 mr-1.5"/>{busy || (value.media ? 'Replace' : `Upload ${value.kind === 'video' ? 'a video (≤ 5 s)' : 'an image'}`)}</Button>}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function Genie360Fields({ value, onChange, priceCents, eventTitle, eventDate, disabled }: {
  value: Spin360Value; onChange: (p: Partial<Spin360Value>) => void; priceCents: number; eventTitle: string; eventDate: string | null; disabled?: boolean;
}) {
  const [lib, setLib] = useState<Library | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [overlayBusy, setOverlayBusy] = useState('');
  const [overlayError, setOverlayError] = useState('');
  const [designError, setDesignError] = useState('');
  const overlayRef = useRef<HTMLInputElement>(null);
  const loadLib = () => fetch('/api/genie-360/library').then(r => (r.ok ? r.json() : null)).then(d => d && setLib(d));
  useEffect(() => { if (value.enabled && !lib) loadLib(); }, [value.enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!value.enabled) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border border-dashed border-gray-200">
        <div className="flex-1">
          <p className="text-sm font-medium">Add Genie 360</p>
          <p className="text-sm text-gray-500">The spinner booth: an iPhone on the arm records guests as it turns, edits a slow-motion video with your music and design, and sends it to the iPad Sharing station. {STABILIZATION_NOTE} Add-on: {fmtCents(priceCents)} for this event, paid with the event; until it&apos;s paid the videos show a watermark.</p>
        </div>
        <Button type="button" disabled={disabled} onClick={() => onChange({ enabled: true })}>Add Genie 360</Button>
      </div>
    );
  }
  if (!lib) return <p className="text-sm text-gray-400">Loading…</p>;

  const style = lib.styles.find(s => s.id === value.styleId);
  const segments = value.segments ?? style?.segments ?? [];
  const fps = value.captureFps ?? style?.captureFps ?? 120;

  function pickStyle(s: Style) {
    onChange({
      styleId: s.id, segments: null, captureFps: null,
      // A style may switch on its effect and bring its song; both can be changed after
      ...(s.defaultEffects.lightTrails !== undefined ? { lightTrails: { ...value.lightTrails, enabled: s.defaultEffects.lightTrails } } : {}),
      ...(s.defaultEffects.backgroundRemoval !== undefined ? { backgroundRemoval: { ...value.backgroundRemoval, enabled: s.defaultEffects.backgroundRemoval, backdropId: value.backgroundRemoval.backdropId ?? (s.defaultEffects.backgroundRemoval ? lib!.backdrops[0]?.id ?? null : null) } } : {}),
      ...(s.defaultMusicId && !value.music && lib!.music.some(t => t.id === s.defaultMusicId) ? { music: { trackId: s.defaultMusicId, startMs: 0, volume: 0.8 } } : {}),
    });
  }

  async function uploadOverlay(f: File) {
    setOverlayError('');
    if (!OVERLAY_TYPES[f.type] && !/\.mov$/i.test(f.name)) { setOverlayError('Use an animated PNG, WebP, GIF, or a MOV with transparency.'); return; }
    if (f.size > OVERLAY_MAX_BYTES) { setOverlayError('Animated overlays must be 15 MB or smaller.'); return; }
    setOverlayBusy('Uploading…');
    try {
      const file = OVERLAY_TYPES[f.type] ? f : new File([f], f.name, { type: 'video/quicktime' });
      const d = await uploadSpinFile('overlay', file, pct => setOverlayBusy(pct < 100 ? `Uploading ${pct}%` : 'Saving…'), {});
      await loadLib();
      onChange({ animatedOverlay: { id: d.overlay.id, loop: true } });
    } catch (e) { setOverlayError((e as Error).message); }
    setOverlayBusy('');
  }

  const defaultTitle = [eventTitle.slice(0, 40), eventDate ? new Date(eventDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ''].filter(Boolean);
  const size = SPIN_VIDEO_SIZE_OPTIONS.find(o => o.value === value.videoSize);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-gray-500">Pick a style, a song and a design, and you&apos;re done. {STABILIZATION_NOTE} Add-on: {fmtCents(priceCents)} for this event.</p>
        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { if (confirm('Turn Genie 360 off for this event? Your 360 choices are kept if you add it again.')) onChange({ enabled: false }); }}>Turn off</Button>
      </div>

      <Field label="1. Style" hint="Each card plays an Example of the style. Picking one may also pick its song or effect, which you can change.">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {lib.styles.map(s => <StyleCard key={s.id} style={s} selected={s.id === value.styleId} disabled={disabled} onPick={() => pickStyle(s)}/>)}
        </div>
      </Field>

      <Field label="2. Music">
        <MusicBlock value={value} lib={lib} disabled={disabled} onChange={onChange} onLibrary={loadLib}/>
      </Field>

      <Field label="3. Design" hint={SPIN_MOUNT_HINT}>
        <div className="space-y-3">
          <div className="flex gap-2">
            {SPIN_FORMATS.map(f => (
              <Button key={f} type="button" size="sm" variant={value.format === f ? 'default' : 'outline'} disabled={disabled}
                onClick={() => { setDesignError(''); onChange({ format: f as SpinFormat, ...(value.design && f !== value.format ? { design: null } : {}) }); }}>{SPIN_FORMAT_LABELS[f]}</Button>
            ))}
          </div>
          <BoomerangTemplateField noun="360 video" format={value.format} design={value.design} designProblem={null} overlay={null} disabled={disabled}
            onChange={p => {
              if (p.design && p.format && !(SPIN_FORMATS as readonly string[]).includes(p.format)) { setDesignError('Genie 360 videos are portrait 9:16, square or landscape 16:9. Pick a layout at one of those shapes.'); return; }
              setDesignError('');
              onChange({ ...(p.design !== undefined ? { design: p.design } : {}), ...(p.format && p.design ? { format: p.format as SpinFormat } : {}) });
            }}/>
          {designError && <p className="text-xs text-red-600">{designError}</p>}
          <Toggle checked={!!value.title} disabled={disabled} label="Title text"
            hint="Words over the video, e.g. the event name and date."
            onChange={on => onChange({ title: on ? { lines: defaultTitle, color: '#FFFFFF', font: 'montserrat', animation: 'fade', position: 'bottom' } : null })}/>
          {value.title && (
            <div className="ml-[52px] grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[0, 1].map(i => (
                <Input key={i} maxLength={40} disabled={disabled} placeholder={i === 0 ? 'Line 1' : 'Line 2 (optional)'} value={value.title!.lines[i] ?? ''}
                  onChange={e => { const lines = [...value.title!.lines]; lines[i] = e.target.value; onChange({ title: { ...value.title!, lines: lines.slice(0, 2).filter((l, j) => j === 0 || l !== '') } }); }}/>
              ))}
              <Select value={value.title.font} disabled={disabled} onChange={e => onChange({ title: { ...value.title!, font: e.target.value } })}>
                {FONT_OPTIONS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </Select>
              <div className="flex gap-2">
                <input type="color" value={value.title.color} disabled={disabled} onChange={e => onChange({ title: { ...value.title!, color: e.target.value.toUpperCase() } })} className="h-9 w-12 rounded border border-gray-200"/>
                <Select value={value.title.animation} disabled={disabled} onChange={e => onChange({ title: { ...value.title!, animation: e.target.value as 'fade' } })}>
                  {TITLE_ANIMATIONS.map(a => <option key={a} value={a}>{a === 'fade' ? 'Fade in' : a === 'slideUp' ? 'Slide up' : 'Pop'}</option>)}
                </Select>
                <Select value={value.title.position} disabled={disabled} onChange={e => onChange({ title: { ...value.title!, position: e.target.value as 'top' } })}>
                  <option value="top">Top</option><option value="bottom">Bottom</option>
                </Select>
              </div>
            </div>
          )}
        </div>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Intro" hint="Plays before the spin.">
          <EndField label="intro" value={value.intro} disabled={disabled} onChange={intro => onChange({ intro })}/>
        </Field>
        <Field label="Outro" hint="Plays after the spin.">
          <EndField label="outro" value={value.outro} disabled={disabled} onChange={outro => onChange({ outro })}/>
        </Field>
      </div>

      <Field label="Recording light" hint="The iPhone's light, facing the guests on the arm.">
        <div className="space-y-1.5">
          {LIGHT_MODE_OPTIONS.map(o => (
            <label key={o.value} className="flex items-start gap-2 text-sm">
              <input type="radio" name="spin-light" className="mt-1" checked={value.recordingLight.mode === o.value} disabled={disabled}
                onChange={() => onChange({ recordingLight: { ...value.recordingLight, mode: o.value } })}/>
              <span><span className="font-medium">{o.label}</span> <span className="text-gray-500">{o.help}</span></span>
            </label>
          ))}
          {value.recordingLight.mode !== 'off' && (
            <div className="flex items-center gap-2 pt-1 text-sm text-gray-600">Brightness
              <Select className="w-32" value={value.recordingLight.brightness} disabled={disabled} onChange={e => onChange({ recordingLight: { ...value.recordingLight, brightness: e.target.value as 'medium' } })}>
                {BRIGHTNESS.map(b => <option key={b} value={b}>{b[0].toUpperCase() + b.slice(1)}</option>)}
              </Select>
            </div>
          )}
        </div>
      </Field>

      <div className="border-t pt-4">
        <button type="button" className="text-sm font-medium inline-flex items-center gap-1" onClick={() => setAdvanced(a => !a)}>
          {advanced ? <ChevronDown className="w-4 h-4"/> : <ChevronRight className="w-4 h-4"/>}Advanced
        </button>
        {advanced && (
          <div className="mt-4 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Video length (seconds)" hint="8–30. The finished video, with any intro and outro.">
                <Input type="number" className="w-24" min={8} max={30} disabled={disabled} value={Number.isNaN(value.videoSeconds) ? '' : value.videoSeconds} onChange={e => onChange({ videoSeconds: parseInt(e.target.value, 10) })}/>
              </Field>
              <Field label="Video size">
                <Select value={value.videoSize} disabled={disabled} onChange={e => onChange({ videoSize: e.target.value as '1080p' })}>
                  {SPIN_VIDEO_SIZE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
                {size && <p className="text-sm text-gray-600 mt-1.5">{size.help}</p>}
              </Field>
              <Field label="Longest recording (seconds)" hint="4–20. Recording stops by itself at this length.">
                <Input type="number" className="w-24" min={4} max={20} disabled={disabled} value={Number.isNaN(value.recording.maxSeconds) ? '' : value.recording.maxSeconds} onChange={e => onChange({ recording: { ...value.recording, maxSeconds: parseInt(e.target.value, 10) } })}/>
              </Field>
              <Field label="Lead-in (milliseconds)" hint="0–3000. Wait this long after the arm starts turning before recording.">
                <Input type="number" className="w-28" min={0} max={3000} step={100} disabled={disabled} value={Number.isNaN(value.recording.leadInMs) ? '' : value.recording.leadInMs} onChange={e => onChange({ recording: { ...value.recording, leadInMs: parseInt(e.target.value, 10) } })}/>
              </Field>
            </div>
            <Toggle checked={value.recording.stopWhenStill} disabled={disabled} onChange={v => onChange({ recording: { ...value.recording, stopWhenStill: v } })} label="Stop when the arm stops"/>
            <Field label="Capture" hint={needs240(segments) && fps === 120 ? 'This speed ramp is slower than 4×: 240 fps makes it smoother.' : undefined}>
              <Select value={String(fps)} disabled={disabled} onChange={e => onChange({ captureFps: Number(e.target.value) as 120 | 240 })}>
                <option value="120">120 fps: brighter, cooler</option>
                <option value="240">240 fps: smoothest slow motion; needs more light</option>
              </Select>
            </Field>
            <Field label="Custom speed ramp" hint={`Starts from the ${style?.name ?? 'chosen'} style.`}>
              <RampEditor segments={segments} disabled={disabled} onChange={s => onChange({ segments: s })} onReset={() => onChange({ segments: null, captureFps: null })}/>
            </Field>
            <Field label="Animated overlay" hint="Moves on top of every frame: animated PNG, WebP, GIF, or MOV with transparency, up to 15 MB.">
              <div className="space-y-2">
                <Select value={value.animatedOverlay?.id ?? ''} disabled={disabled} onChange={e => onChange({ animatedOverlay: e.target.value ? { id: e.target.value, loop: value.animatedOverlay?.loop ?? true } : null })}>
                  <option value="">None</option>
                  {lib.overlays.map(o => <option key={o.id} value={o.id}>{o.name}{o.source === 'account' ? ' (yours)' : ''}</option>)}
                </Select>
                {value.animatedOverlay && <Toggle checked={value.animatedOverlay.loop} disabled={disabled} onChange={loop => onChange({ animatedOverlay: { ...value.animatedOverlay!, loop } })} label="Loop it"/>}
                {!disabled && <>
                  <input ref={overlayRef} type="file" accept=".png,.webp,.gif,.mov,image/png,image/webp,image/gif,video/quicktime" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadOverlay(f); }}/>
                  <Button type="button" size="sm" variant="outline" disabled={!!overlayBusy} onClick={() => overlayRef.current?.click()}><Upload className="w-3.5 h-3.5 mr-1.5"/>{overlayBusy || 'Upload an overlay'}</Button>
                </>}
                {overlayError && <p className="text-xs text-red-600">{overlayError}</p>}
              </div>
            </Field>
            <Toggle checked={value.backgroundRemoval.enabled} disabled={disabled} label="Background removal" hint="Guests on a backdrop instead of the room (AI, on the iPhone)."
              onChange={enabled => onChange({ backgroundRemoval: { ...value.backgroundRemoval, enabled, backdropId: value.backgroundRemoval.backdropId ?? (enabled ? lib.backdrops[0]?.id ?? null : null) } })}/>
            {value.backgroundRemoval.enabled && (
              <div className="ml-[52px] space-y-3">
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 max-h-64 overflow-y-auto">
                  {lib.backdrops.map(b => (
                    <button key={b.id} type="button" disabled={disabled} onClick={() => onChange({ backgroundRemoval: { ...value.backgroundRemoval, backdropId: b.id } })}
                      className={'relative rounded-lg overflow-hidden border-2 ' + (value.backgroundRemoval.backdropId === b.id ? 'border-brand' : 'border-transparent')}>
                      <img src={artUrl(b.thumbnail)} alt={b.name} className="w-full aspect-[3/2] object-cover"/>
                      {b.is360 && <span className="absolute top-1 left-1 px-1 rounded bg-black/60 text-white text-[10px]">360</span>}
                    </button>
                  ))}
                </div>
                <Toggle checked={value.backgroundRemoval.followSpin} disabled={disabled} onChange={followSpin => onChange({ backgroundRemoval: { ...value.backgroundRemoval, followSpin } })} label="Backdrop turns with the spin"/>
              </div>
            )}
            <Toggle checked={value.lightTrails.enabled} disabled={disabled} label="Light trails" hint="Neon streaks that follow the guests as the arm turns."
              onChange={enabled => onChange({ lightTrails: { ...value.lightTrails, enabled } })}/>
            {value.lightTrails.enabled && (
              <div className="ml-[52px] flex items-center gap-3 flex-wrap">
                {value.lightTrails.colors.map((c, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    <input type="color" value={c} disabled={disabled} className="h-9 w-12 rounded border border-gray-200"
                      onChange={e => onChange({ lightTrails: { ...value.lightTrails, colors: value.lightTrails.colors.map((x, j) => j === i ? e.target.value.toUpperCase() : x) } })}/>
                    {value.lightTrails.colors.length > 1 && !disabled && <button type="button" className="text-gray-400" aria-label="Remove colour" onClick={() => onChange({ lightTrails: { ...value.lightTrails, colors: value.lightTrails.colors.filter((_, j) => j !== i) } })}><X className="w-3.5 h-3.5"/></button>}
                  </span>
                ))}
                {value.lightTrails.colors.length < 3 && !disabled && <Button type="button" size="sm" variant="outline" onClick={() => onChange({ lightTrails: { ...value.lightTrails, colors: [...value.lightTrails.colors, '#FFE45C'] } })}>Add colour</Button>}
                <Select className="w-32" value={value.lightTrails.length} disabled={disabled} onChange={e => onChange({ lightTrails: { ...value.lightTrails, length: e.target.value as 'medium' } })}>
                  {TRAIL_LENGTHS.map(l => <option key={l} value={l}>{l[0].toUpperCase() + l.slice(1)} trails</option>)}
                </Select>
                <Select className="w-56" value={value.lightTrails.source} disabled={disabled} onChange={e => onChange({ lightTrails: { ...value.lightTrails, source: e.target.value as 'outline' } })}>
                  <option value="outline">Follow the guests&apos; outline</option>
                  <option value="highlights">Follow the brightest lights</option>
                </Select>
              </div>
            )}
            <Toggle checked={value.roomSound.enabled} disabled={disabled} label="Room sound under the music" onChange={enabled => onChange({ roomSound: { ...value.roomSound, enabled } })}/>
            {value.roomSound.enabled && (
              <label className="ml-[52px] flex items-center gap-2 text-sm text-gray-600">Volume
                <input type="range" min={0} max={1} step={0.05} value={value.roomSound.volume} disabled={disabled} onChange={e => onChange({ roomSound: { ...value.roomSound, volume: Number(e.target.value) } })}/>
                <span className="text-xs text-gray-500">{Math.round(value.roomSound.volume * 100)}%</span>
              </label>
            )}
            <Field label="Upload">
              <Select value={value.upload} disabled={disabled} onChange={e => onChange({ upload: e.target.value as 'everyClip' })}>
                <option value="everyClip">Every video, as soon as it&apos;s made (discard a bad spin any time)</option>
                <option value="sharedOnly">Only videos guests share</option>
              </Select>
            </Field>
            <Toggle checked={value.showInGallery} disabled={disabled} onChange={showInGallery => onChange({ showInGallery })} label="Show 360 videos in the event gallery"
              hint="On: they play in the public event gallery. Off: only the guest's own page and you (the gallery's Videos tab)."/>
            <Field label="Consent text" hint="Shown on the Sharing station. Leave it empty to use the wording shown in the box.">
              <textarea rows={2} maxLength={300} disabled={disabled} value={value.consentText ?? ''} placeholder={defaultSpinConsent(value.showInGallery)}
                onChange={e => onChange({ consentText: e.target.value || null })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:bg-gray-50"/>
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}

export const spin360NumbersFilled = (v: Spin360Value) => !v.enabled || [v.videoSeconds, v.recording.maxSeconds, v.recording.leadInMs].every(n => !Number.isNaN(n));
