'use client';
import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { putWithProgress } from './SettingsForms';
import { artUrl } from './parts';

// Virtual backdrop: shared pieces for Super Admin → Backdrops, Genie → Backdrops and the event's Virtual backdrop section

export type Backdrop = {
  id: string; name: string; source: 'standard' | 'account';
  image: { url: string; sha256: string; bytes: number }; thumbnail: { url: string } | null;
  width: number; height: number; isActive: boolean;
};

export function BackdropThumb({ backdrop, className = 'w-full aspect-[3/2]' }: { backdrop: Pick<Backdrop, 'image' | 'thumbnail' | 'name'>; className?: string }) {
  return <img src={artUrl((backdrop.thumbnail ?? backdrop.image).url)} alt={backdrop.name} className={className + ' object-cover rounded bg-gray-100'}/>;
}

const MAX_MB = 25;

// Presign, PUT, then process (shrunk to ≤ 1800 px, JPEG, thumbnail) and saved as a backdrop
async function uploadBackdrop(file: File, scope: 'mine' | 'standard', onPct: (n: number) => void, replace?: { id: string; name: string }) {
  if (file.type !== 'image/jpeg' && file.type !== 'image/png') throw new Error('Use a JPG or PNG image.');
  if (file.size > MAX_MB * 1024 * 1024) throw new Error(`Backdrops must be ${MAX_MB} MB or smaller.`);
  const r = await fetch('/api/genie-backdrops/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, contentType: file.type, bytes: file.size }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Could not start the upload');
  if (!(await putWithProgress(d.uploadUrl, file, onPct))) throw new Error("The upload didn't go through. Check your connection and try again.");
  const name = replace?.name ?? (file.name.replace(/\.(jpe?g|png)$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 80) || 'Backdrop');
  const p = await fetch('/api/genie-backdrops/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, url: d.url, name, ...(replace ? { replaceId: replace.id } : {}) }) });
  const pd = await p.json().catch(() => ({}));
  if (!p.ok) throw new Error(pd.error || "That image couldn't be converted. Try a different one.");
  return pd as { backdrop: Backdrop; warning?: string };
}

// Upload (or Replace) button; reports the saved backdrop, and any "may look soft" warning
export function BackdropUploadButton({ scope, onDone, replace, label = 'Upload Backdrop', variant = 'default', size = 'default', disabled }: {
  scope: 'mine' | 'standard'; onDone: (b: Backdrop, warning?: string) => void; replace?: { id: string; name: string };
  label?: string; variant?: 'default' | 'outline'; size?: 'default' | 'sm'; disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string>('');
  const [error, setError] = useState('');
  async function go(f: File) {
    setError(''); setBusy('Uploading…');
    try {
      const r = await uploadBackdrop(f, scope, pct => setBusy(pct < 100 ? `Uploading ${pct}%` : 'Shrinking…'), replace);
      onDone(r.backdrop, r.warning);
    } catch (e) { setError((e as Error).message); }
    setBusy('');
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <input ref={ref} type="file" accept="image/jpeg,image/png" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) go(f); }}/>
      <Button variant={variant} size={size} disabled={disabled || !!busy} onClick={() => ref.current?.click()}><Upload className="w-3.5 h-3.5 mr-1.5"/>{busy || label}</Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

export const BACKDROP_UPLOAD_HINT = 'JPG or PNG up to 25 MB. We shrink it to 1800 px at most (the 4x6 print size); 1800×1200 or larger looks best. The iPad crops it to fill each photo, centred.';
