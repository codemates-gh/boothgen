'use client';
import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { Field } from './parts';
import { putWithProgress } from './SettingsForms';
import { artUrl } from './parts';

// Pose library: shared pieces for Super Admin → Poses, Genie → Poses and the "Pose ideas" sections

export type PoseCategory = 'her' | 'him' | 'all' | 'two' | 'groups';
export type Pose = {
  id: string; name: string; source: 'standard' | 'account'; category: PoseCategory; people: number | null;
  image: { url: string; sha256: string; bytes: number; contentType: string }; thumbnail: { url: string } | null;
  width: number; height: number; isActive: boolean;
};
export type PoseKind = { category: PoseCategory; people?: number };

export const POSE_CATEGORIES: { value: PoseCategory; label: string; hint: string }[] = [
  { value: 'her', label: 'Her', hint: 'Solo' },
  { value: 'him', label: 'Him', hint: 'Solo' },
  { value: 'all', label: 'All', hint: 'Solo, anyone' },
  { value: 'two', label: 'For two', hint: 'Group of 2' },
  { value: 'groups', label: 'For groups', hint: '3 or more' },
];
export const categoryLabel = (c: PoseCategory) => POSE_CATEGORIES.find(x => x.value === c)?.label ?? c;
export const POSES_PER_CATEGORY_HINT = 8;
export const POSE_UPLOAD_HINT = 'PNG with a transparent background (drawings) or a photo, up to 15 MB. We shrink it to 1200 px at most. Guests see it on a dark card.';
export const POSE_CONSENT = 'Use photos only of people who agreed to it.';

// As the iPad shows it: the picture on a dark card
export function PoseThumb({ pose, className = 'w-full aspect-square' }: { pose: Pick<Pose, 'image' | 'thumbnail' | 'name'>; className?: string }) {
  return (
    <div className={className + ' rounded-lg bg-gray-900 p-2 flex items-center justify-center overflow-hidden'}>
      <img src={artUrl((pose.thumbnail ?? pose.image).url)} alt={pose.name} className="max-w-full max-h-full object-contain"/>
    </div>
  );
}

// Category (+ people for For groups)
export function PoseKindFields({ value, onChange }: { value: PoseKind; onChange: (v: PoseKind) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Who it's for">
        <Select value={value.category} onChange={e => { const c = e.target.value as PoseCategory; onChange(c === 'groups' ? { category: c, people: value.people && value.people >= 3 ? value.people : 3 } : { category: c }); }}>
          <optgroup label="Solo">
            <option value="her">Her</option>
            <option value="him">Him</option>
            <option value="all">All (anyone)</option>
          </optgroup>
          <optgroup label="Group">
            <option value="two">For two</option>
            <option value="groups">For groups (3 or more)</option>
          </optgroup>
        </Select>
      </Field>
      {value.category === 'groups' && (
        <Field label="Smallest group" hint="People in the pose (3–10)">
          <Input type="number" min={3} max={10} value={value.people ?? 3} onChange={e => onChange({ ...value, people: Math.max(3, Math.min(10, Number(e.target.value) || 3)) })}/>
        </Field>
      )}
    </div>
  );
}

// Presign, PUT, then process (≤ 1200 px, thumbnail) and saved as a pose, or a pose's picture replaced
async function uploadPose(file: File, scope: 'mine' | 'standard', name: string, kind: PoseKind | undefined, onPct: (n: number) => void, replaceId?: string) {
  if (file.type !== 'image/jpeg' && file.type !== 'image/png') throw new Error('Use a JPG or PNG image.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Pose pictures must be 15 MB or smaller.');
  const r = await fetch('/api/genie-poses/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, contentType: file.type, bytes: file.size }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Could not start the upload');
  if (!(await putWithProgress(d.uploadUrl, file, onPct))) throw new Error("The upload didn't go through. Check your connection and try again.");
  const p = await fetch('/api/genie-poses/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, url: d.url, name, ...(kind ? { kind } : {}), ...(replaceId ? { replaceId } : {}) }) });
  const pd = await p.json().catch(() => ({}));
  if (!p.ok) throw new Error(pd.error || "That image couldn't be converted. Try a different one.");
  return pd.pose as Pose;
}

const nameFrom = (f: File) => f.name.replace(/\.(jpe?g|png)$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 80) || 'Pose';

// "Add Pose": pick a file, then name it and say who it's for (with the consent note), then upload
export function PoseUploadButton({ scope, onDone, defaultCategory = 'her', label = 'Add Pose', variant = 'default', size = 'default', disabled }: {
  scope: 'mine' | 'standard'; onDone: (p: Pose) => void; defaultCategory?: PoseCategory;
  label?: string; variant?: 'default' | 'outline'; size?: 'default' | 'sm'; disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PoseKind>({ category: defaultCategory });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  function pick(f: File) { setFile(f); setName(nameFrom(f)); setKind(defaultCategory === 'groups' ? { category: 'groups', people: 3 } : { category: defaultCategory }); setError(''); }
  async function go() {
    if (!file) return;
    setError(''); setBusy('Uploading…');
    try {
      const pose = await uploadPose(file, scope, name.trim() || nameFrom(file), kind, pct => setBusy(pct < 100 ? `Uploading ${pct}%` : 'Shrinking…'));
      setFile(null);
      onDone(pose);
    } catch (e) { setError((e as Error).message); }
    setBusy('');
  }
  return (
    <>
      <input ref={ref} type="file" accept="image/jpeg,image/png" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pick(f); }}/>
      <Button variant={variant} size={size} disabled={disabled} onClick={() => ref.current?.click()}><Upload className="w-3.5 h-3.5 mr-1.5"/>{label}</Button>
      <Modal open={!!file} onClose={() => { if (!busy) setFile(null); }} title="Add Pose">
        <div className="space-y-4">
          <p className="text-xs text-gray-500 truncate">{file?.name}</p>
          <Field label="Name"><Input value={name} maxLength={80} onChange={e => setName(e.target.value)}/></Field>
          <PoseKindFields value={kind} onChange={setKind}/>
          <p className="text-xs text-gray-400">{POSE_UPLOAD_HINT}</p>
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{POSE_CONSENT}</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={!!busy} onClick={() => setFile(null)}>Cancel</Button>
            <Button disabled={!!busy || !name.trim()} onClick={go}>{busy || 'Add Pose'}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// Replace a pose's picture (keeps its name and who it's for)
export function PoseReplaceButton({ scope, pose, onDone }: { scope: 'mine' | 'standard'; pose: Pose; onDone: (p: Pose) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  async function go(f: File) {
    setError(''); setBusy('…');
    try { onDone(await uploadPose(f, scope, pose.name, undefined, pct => setBusy(pct < 100 ? `${pct}%` : '…'), pose.id)); }
    catch (e) { setError((e as Error).message); }
    setBusy('');
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <input ref={ref} type="file" accept="image/jpeg,image/png" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) go(f); }}/>
      <Button variant="outline" size="sm" disabled={!!busy} onClick={() => ref.current?.click()}>{busy ? `Replace ${busy}` : 'Replace'}</Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

// Edit name + who it's for
export function PoseEditModal({ pose, endpoint, onClose, onSaved }: { pose: Pose | null; endpoint: (id: string) => string; onClose: () => void; onSaved: (p: Pose) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PoseKind>({ category: 'her' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [for_, setFor] = useState<string | null>(null);
  if (pose && for_ !== pose.id) {
    setFor(pose.id); setName(pose.name); setError('');
    setKind(pose.category === 'groups' ? { category: 'groups', people: pose.people ?? 3 } : { category: pose.category });
  }
  async function save() {
    if (!pose) return;
    setBusy(true); setError('');
    const r = await fetch(endpoint(pose.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), kind }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(d.error || 'Could not save'); return; }
    setFor(null);
    onSaved(d);
  }
  return (
    <Modal open={!!pose} onClose={() => { setFor(null); onClose(); }} title="Edit Pose">
      <div className="space-y-4">
        <Field label="Name"><Input value={name} maxLength={80} onChange={e => setName(e.target.value)}/></Field>
        <PoseKindFields value={kind} onChange={setKind}/>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => { setFor(null); onClose(); }}>Cancel</Button>
          <Button disabled={busy || !name.trim()} onClick={save}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}
