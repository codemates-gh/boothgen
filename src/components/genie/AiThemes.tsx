'use client';
import { useRef, useState } from 'react';
import { Upload, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import { Field, artUrl } from './parts';
import { putWithProgress } from './SettingsForms';

// Geniefied themes: shared pieces for Super Admin → AI themes and Genie → Themes

type RemoteAsset = { url: string; sha256: string; contentType: string; bytes: number };
export type AiTheme = {
  id: string; name: string; source: 'standard' | 'account';
  prompt?: string; fastModel?: string | null; qualityModel?: string | null;
  sample: RemoteAsset | null; thumbnail: RemoteAsset | null; isActive: boolean;
};
type Scope = 'mine' | 'standard';

export const THEME_FIXED_NOTE = 'BoothGen always adds its fixed instructions first: keep each person\'s face, identity, skin tone, age and pose; no text; no nudity.';
export const THEME_NO_SAMPLE_NOTE = "A theme without a sample isn't offered to guests.";
export const THEME_TRIES_NOTE = '20 tries a day.';
const PROMPT_MAX = 2000;

// Presign, then PUT straight to storage; returns the uploaded file's URL
async function uploadThemePicture(file: File, scope: Scope, onPct: (n: number) => void) {
  if (file.type !== 'image/jpeg' && file.type !== 'image/png') throw new Error('Use a JPG or PNG image.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Pictures must be 15 MB or smaller.');
  const r = await fetch('/api/genie-ai-themes/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, contentType: file.type, bytes: file.size }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Could not start the upload');
  if (!(await putWithProgress(d.uploadUrl, file, onPct))) throw new Error("The upload didn't go through. Check your connection and try again.");
  return d.url as string;
}

// The sample (or its thumbnail), or a placeholder
export function ThemeThumb({ theme, className = 'w-full aspect-square' }: { theme: Pick<AiTheme, 'sample' | 'thumbnail' | 'name'>; className?: string }) {
  const pic = theme.thumbnail ?? theme.sample;
  if (!pic) {
    return (
      <div className={className + ' rounded-lg bg-gray-100 flex flex-col items-center justify-center text-gray-400 gap-1'}>
        <ImageOff className="w-5 h-5"/>
        <span className="text-[11px]">No sample yet</span>
      </div>
    );
  }
  return <img src={artUrl(pic.url)} alt={theme.name} className={className + ' rounded-lg object-cover bg-gray-100'}/>;
}

// Pick a JPG or PNG
function FilePick({ label, file, onPick, disabled }: { label: string; file: File | null; onPick: (f: File) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <input ref={ref} type="file" accept="image/jpeg,image/png" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }}/>
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => ref.current?.click()}><Upload className="w-3.5 h-3.5 mr-1.5"/>{label}</Button>
      {file && <span className="text-xs text-gray-500 truncate">{file.name}</span>}
    </div>
  );
}

// Add or edit a theme: name, prompt, sample (Standard also: models). theme undefined = closed, null = new.
export function ThemeFormModal({ scope, theme, onClose, onSaved }: { scope: Scope; theme: AiTheme | null | undefined; onClose: () => void; onSaved: (t: AiTheme) => void }) {
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [fastModel, setFastModel] = useState('');
  const [qualityModel, setQualityModel] = useState('');
  const [sample, setSample] = useState<File | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [for_, setFor] = useState<string | null>(null);
  const key = theme === undefined ? null : theme?.id ?? 'new';
  if (key && for_ !== key) {
    setFor(key); setError(''); setSample(null);
    setName(theme?.name ?? ''); setPrompt(theme?.prompt ?? '');
    setFastModel(theme?.fastModel ?? ''); setQualityModel(theme?.qualityModel ?? '');
  }
  function close() { if (busy) return; setFor(null); onClose(); }

  async function save() {
    setError(''); setBusy('Saving…');
    try {
      const sampleUrl = sample ? await uploadThemePicture(sample, scope, pct => setBusy(pct < 100 ? `Uploading ${pct}%` : 'Saving…')) : undefined;
      const body = {
        scope, name: name.trim(), prompt: prompt.trim(), ...(sampleUrl ? { sampleUrl } : {}),
        ...(scope === 'standard' && theme ? { fastModel: fastModel.trim() || null, qualityModel: qualityModel.trim() || null } : {}),
      };
      const r = await fetch('/api/genie-ai-themes' + (theme ? '/' + theme.id : ''), { method: theme ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not save');
      let saved: AiTheme = d.theme;
      // New Standard theme with models set: they're only taken on an edit
      if (scope === 'standard' && !theme && (fastModel.trim() || qualityModel.trim())) {
        const m = await fetch('/api/genie-ai-themes/' + saved.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, fastModel: fastModel.trim() || null, qualityModel: qualityModel.trim() || null }) });
        const md = await m.json().catch(() => ({}));
        if (m.ok) saved = md.theme;
      }
      setBusy(''); setFor(null);
      onSaved(saved);
    } catch (e) { setError((e as Error).message); setBusy(''); }
  }

  return (
    <Modal open={theme !== undefined} onClose={close} title={theme ? 'Edit Theme' : 'Add Theme'}>
      <div className="space-y-4">
        <Field label="Name"><Input value={name} maxLength={60} placeholder="Watercolor" onChange={e => setName(e.target.value)}/></Field>
        <Field label="Prompt" hint={`${prompt.length}/${PROMPT_MAX}`}>
          <Textarea rows={5} value={prompt} maxLength={PROMPT_MAX} placeholder="Describe the look, e.g. a soft watercolor painting with loose brush strokes and pastel colors." onChange={e => setPrompt(e.target.value)}/>
        </Field>
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">{THEME_FIXED_NOTE}</p>
        {scope === 'standard' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fast model" hint="1 or 2 people"><Input value={fastModel} placeholder="Default" onChange={e => setFastModel(e.target.value)}/></Field>
            <Field label="Quality model" hint="Groups of 3 or more"><Input value={qualityModel} placeholder="Default" onChange={e => setQualityModel(e.target.value)}/></Field>
          </div>
        )}
        <Field label="Sample" hint={`Guests see it when they pick a theme. JPG or PNG, up to 15 MB. ${THEME_NO_SAMPLE_NOTE} You can also make one with Try it.`}>
          <div className="flex items-center gap-3">
            {theme && (theme.sample || theme.thumbnail) && !sample && <ThemeThumb theme={theme} className="w-12 h-12 flex-shrink-0"/>}
            <FilePick label={theme?.sample ? 'Replace Sample' : 'Upload Sample'} file={sample} onPick={setSample} disabled={!!busy}/>
          </div>
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={!!busy} onClick={close}>Cancel</Button>
          <Button disabled={!!busy || !name.trim() || prompt.trim().length < 10} onClick={save}>{busy || (theme ? 'Save' : 'Add Theme')}</Button>
        </div>
      </div>
    </Modal>
  );
}

// "Try it": the operator's own photo in the theme; the result can be saved as the sample
export function ThemeTryModal({ scope, theme, onClose, onSaved }: { scope: Scope; theme: AiTheme | null; onClose: () => void; onSaved: (t: AiTheme) => void }) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [people, setPeople] = useState(1);
  const [asSample, setAsSample] = useState(!theme?.sample);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ image: string; model: string; saved: boolean } | null>(null);
  const [for_, setFor] = useState<string | null>(null);
  if (theme && for_ !== theme.id) {
    setFor(theme.id); setPhoto(null); setPeople(1); setAsSample(!theme.sample); setError(''); setResult(null);
  }
  function close() { if (busy) return; setFor(null); onClose(); }

  async function go() {
    if (!theme || !photo) return;
    setError(''); setResult(null); setBusy('Uploading…');
    try {
      const photoUrl = await uploadThemePicture(photo, scope, pct => setBusy(pct < 100 ? `Uploading ${pct}%` : 'Geniefying…'));
      setBusy('Geniefying…');
      const r = await fetch(`/api/genie-ai-themes/${theme.id}/try`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, photoUrl, people, ...(asSample ? { useAsSample: true } : {}) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "That didn't work. Try a different photo.");
      setResult({ image: d.image, model: d.model, saved: asSample });
      if (asSample && d.theme) onSaved(d.theme);
    } catch (e) { setError((e as Error).message); }
    setBusy('');
  }

  return (
    <Modal open={!!theme} onClose={close} title={theme ? `Try ${theme.name}` : 'Try it'}>
      <div className="space-y-4">
        <p className="text-sm text-gray-500">Upload a test photo and see it in this theme, the same way guests will.{scope === 'mine' && <> {THEME_TRIES_NOTE}</>}</p>
        <div className="grid grid-cols-2 gap-3 items-end">
          <Field label="Test photo"><FilePick label={photo ? 'Change Photo' : 'Choose Photo'} file={photo} onPick={f => { setPhoto(f); setResult(null); }} disabled={!!busy}/></Field>
          <Field label="People in the photo">
            <Input type="number" min={0} max={30} value={people} disabled={!!busy} onChange={e => setPeople(Math.max(0, Math.min(30, Number(e.target.value) || 0)))}/>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" className="rounded border-gray-300" checked={asSample} disabled={!!busy} onChange={e => setAsSample(e.target.checked)}/>
          Save the result as the sample
        </label>
        <p className="text-xs text-gray-400">Use photos only of people who agreed to it.</p>
        {busy === 'Geniefying…' && <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">Geniefying… this can take up to a minute.</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {result && (
          <div className="space-y-1">
            <img src={result.image} alt={`${theme?.name} result`} className="w-full rounded-lg"/>
            <p className="text-xs text-gray-400">{result.saved ? 'Saved as the sample. ' : ''}Model: {result.model}</p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={!!busy} onClick={close}>Close</Button>
          <Button disabled={!!busy || !photo} onClick={go}>{busy || (result ? 'Try Again' : 'Try It')}</Button>
        </div>
      </div>
    </Modal>
  );
}
