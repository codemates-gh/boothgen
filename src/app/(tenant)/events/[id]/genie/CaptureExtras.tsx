'use client';
import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Field, Toggle, artUrl } from '@/components/genie/parts';

// Event → Genie: "Look at the camera" prompt and Boomerang (per event; no account defaults)

export type LookAtCamera = { enabled: boolean; text: string; frequency: 'everyPhoto' | 'firstPhoto' };

export type BoomerangFormat = 'square' | 'portrait4x6' | 'landscape6x4';
export type Boomerang = {
  enabled: boolean; format: BoomerangFormat; frameCount: number; playbackSpeed: 'slow' | 'medium' | 'fast' | 'superFast';
  reverse: boolean; superSpeedCapture: boolean; showOverlayOnLiveView: boolean; mirrorLiveView: boolean;
  overlay: { url: string; width: number | null; height: number | null } | null;
};

const FORMATS: { value: BoomerangFormat; label: string; canvas: { widthPx: number; heightPx: number } }[] = [
  { value: 'square', label: 'Square (1:1)', canvas: { widthPx: 1080, heightPx: 1080 } },
  { value: 'portrait4x6', label: '4x6 portrait (2:3)', canvas: { widthPx: 1080, heightPx: 1620 } },
  { value: 'landscape6x4', label: '6x4 landscape (3:2)', canvas: { widthPx: 1620, heightPx: 1080 } },
];
const SPEEDS = [
  { value: 'slow', label: 'Slow' }, { value: 'medium', label: 'Medium' }, { value: 'fast', label: 'Fast' }, { value: 'superFast', label: 'Super fast' },
] as const;

export function LookAtCameraFields({ value, onChange, disabled }: { value: LookAtCamera; onChange: (p: Partial<LookAtCamera>) => void; disabled?: boolean }) {
  return (
    <>
      <Toggle checked={value.enabled} disabled={disabled} onChange={v => onChange({ enabled: v })} label='"Look at the camera" prompt'
        hint="An arrow at the camera's edge of the screen, pointing at the lens, from the last countdown second until the photo, so guests don't look at themselves on the screen."/>
      {value.enabled && (
        <div className="ml-[52px] grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Wording" hint={`${value.text.length}/40`}>
            <Input value={value.text} maxLength={40} disabled={disabled} onChange={e => onChange({ text: e.target.value })} placeholder="LOOK AT CAMERA"/>
          </Field>
          <Field label="Show it">
            <Select value={value.frequency} disabled={disabled} onChange={e => onChange({ frequency: e.target.value as LookAtCamera['frequency'] })}>
              <option value="everyPhoto">Before every photo</option>
              <option value="firstPhoto">Before the first photo only</option>
            </Select>
          </Field>
        </div>
      )}
    </>
  );
}

export function BoomerangFields({ value, onChange, disabled }: { value: Boomerang; onChange: (p: Partial<Boomerang>) => void; disabled?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const format = FORMATS.find(f => f.value === value.format) ?? FORMATS[0];

  async function upload(file: File) {
    setError('');
    if (file.type !== 'image/png') { setError('The overlay must be a PNG.'); return; }
    setUploading(true);
    try {
      const r = await fetch('/api/genie-templates/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'mine', contentType: 'image/png', bytes: file.size }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not start the upload');
      const put = await fetch(d.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: file }).catch(() => null);
      if (!put?.ok) throw new Error("The upload didn't go through. Check your connection and try again.");
      // Checks the stored file: real type, size, transparency, and the format's shape
      const v = await fetch('/api/genie-templates/assets/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: d.url, scope: 'mine', canvas: format.canvas }) });
      const vd = await v.json().catch(() => ({}));
      if (!v.ok) throw new Error((vd.error || 'That image could not be used').replace('this layout is', `the ${format.label} boomerang is`));
      if (!vd.hasAlpha) throw new Error('This PNG has no transparent area, so it would cover the whole clip. Use a PNG that is transparent where the clip shows through.');
      onChange({ overlay: { url: d.url, width: vd.width, height: vd.height } });
    } catch (e) {
      setError((e as Error).message);
    }
    setUploading(false);
  }

  const shapeOff = value.overlay?.width && value.overlay.height
    && Math.abs((value.overlay.width / value.overlay.height) / (format.canvas.widthPx / format.canvas.heightPx) - 1) > 0.02;

  return (
    <>
      <Toggle checked={value.enabled} disabled={disabled} onChange={v => onChange({ enabled: v })} label="Offer Boomerang"
        hint="Adds a Boomerang tile next to the photo designs on the iPad's start screen: a short looping clip, shared by text, email and QR. Boomerangs are never printed."/>
      {value.enabled && (
        <div className="ml-[52px] space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Format" hint="Shape of the clip and the overlay.">
              <Select value={value.format} disabled={disabled} onChange={e => onChange({ format: e.target.value as BoomerangFormat })}>
                {FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </Select>
            </Field>
            <Field label="Frames" hint="10–16">
              <Input type="number" min={10} max={16} className="w-24" disabled={disabled}
                value={Number.isNaN(value.frameCount) ? '' : value.frameCount} onChange={e => onChange({ frameCount: parseInt(e.target.value, 10) })}/>
            </Field>
            <Field label="Playback speed">
              <Select value={value.playbackSpeed} disabled={disabled} onChange={e => onChange({ playbackSpeed: e.target.value as Boomerang['playbackSpeed'] })}>
                {SPEEDS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </Field>
          </div>
          <div className="space-y-3">
            <Toggle checked={value.reverse} disabled={disabled} onChange={v => onChange({ reverse: v })} label="Play forwards, then backwards" hint="Off: plays forwards only, looping."/>
            <Toggle checked={value.superSpeedCapture} disabled={disabled} onChange={v => onChange({ superSpeedCapture: v })} label="Super-speed capture" hint="Takes the frames over about 0.75 seconds instead of 1.5."/>
            <Toggle checked={value.mirrorLiveView} disabled={disabled} onChange={v => onChange({ mirrorLiveView: v })} label="Mirror the live view" hint="Like a mirror while guests pose. The clip itself is never mirrored."/>
            <Toggle checked={value.showOverlayOnLiveView} disabled={disabled} onChange={v => onChange({ showOverlayOnLiveView: v })} label="Show the overlay on the live view"/>
          </div>
          <Field label="Overlay (optional)" hint={`One PNG drawn over every frame, transparent where the clip shows through, in the format's shape (e.g. ${format.canvas.widthPx}×${format.canvas.heightPx}). Animated overlays are coming later.`}>
            <div className="flex items-center gap-4">
              {value.overlay && (
                <div className="w-24 rounded border border-gray-200 bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:12px_12px] flex-shrink-0">
                  <img src={artUrl(value.overlay.url)} alt="Boomerang overlay" className="w-full h-auto block"/>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept="image/png" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }}/>
                <Button type="button" variant="outline" size="sm" disabled={disabled || uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? 'Uploading…' : value.overlay ? 'Replace overlay' : 'Upload overlay'}
                </Button>
                {value.overlay && <Button type="button" variant="outline" size="sm" disabled={disabled || uploading} onClick={() => onChange({ overlay: null })}>Remove</Button>}
              </div>
            </div>
            {shapeOff && <p className="text-sm text-amber-700 mt-2">The overlay is {value.overlay!.width}×{value.overlay!.height}, which doesn&apos;t match this format. Upload a new overlay or change the format.</p>}
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          </Field>
        </div>
      )}
    </>
  );
}
