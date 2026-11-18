'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field, Toggle } from '@/components/genie/parts';
import { CLIP_CANVAS, type BoomerangFormat } from '@/lib/genie/schemas';
import { BoomerangFramePicker, findDesign, useClipDesigns, type DesignChoice } from './BoomerangFrame';

// Event → Genie: "Look at the camera" prompt and Boomerang (per event; no account defaults)

export type LookAtCamera = { enabled: boolean; text: string; frequency: 'everyPhoto' | 'firstPhoto' };

export type { BoomerangFormat };
export type Boomerang = {
  enabled: boolean; format: BoomerangFormat; frameCount: number; playbackSpeed: 'slow' | 'medium' | 'fast' | 'superFast';
  reverse: boolean; superSpeedCapture: boolean; showOverlayOnLiveView: boolean; mirrorLiveView: boolean;
  // A plain overlay saved before Boomerang designs (kept until another frame is chosen)
  overlay: { url: string; width: number | null; height: number | null } | null;
  design: DesignChoice | null;
  designProblem: 'deleted' | 'shape' | null;
};

// Shape choices in order, each with a small icon at its proportions
const SHAPES: { value: BoomerangFormat; icon: string }[] = [
  { value: 'square', icon: 'w-6 h-6' },
  { value: 'portrait3x4', icon: 'w-[18px] h-6' },
  { value: 'landscape4x3', icon: 'w-6 h-[18px]' },
  { value: 'portrait9x16', icon: 'w-[13.5px] h-6' },
  { value: 'landscape16x9', icon: 'w-6 h-[13.5px]' },
  { value: 'portrait4x6', icon: 'w-4 h-6' },
  { value: 'landscape6x4', icon: 'w-6 h-4' },
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

export function BoomerangFields({ eventId, value, onChange, disabled }: { eventId: string; value: Boomerang; onChange: (p: Partial<Boomerang>) => void; disabled?: boolean }) {
  const { lib, reload } = useClipDesigns();
  const [notice, setNotice] = useState('');

  // A design (or old overlay) that doesn't fit the new shape is taken off, with a notice
  function changeShape(format: BoomerangFormat) {
    if (format === value.format) return;
    const p: Partial<Boomerang> = { format };
    const chosen = findDesign(lib, value.design);
    const c = CLIP_CANVAS[format];
    setNotice('');
    if (value.design && (!chosen || chosen.format !== format)) {
      p.design = null; p.designProblem = null;
      setNotice(`${chosen ? `"${chosen.name}" is ${CLIP_CANVAS[chosen.format].label}, so it` : 'The chosen design'} was taken off. Choose a frame at ${c.label}.`);
    }
    if (value.overlay?.width && value.overlay.height && Math.abs((value.overlay.width / value.overlay.height) / (c.widthPx / c.heightPx) - 1) > 0.02) {
      p.overlay = null;
      setNotice(`The overlay uploaded earlier doesn't fit ${c.label}, so it was taken off. Choose a frame at the new shape.`);
    }
    onChange(p);
  }

  return (
    <>
      <Toggle checked={value.enabled} disabled={disabled} onChange={v => onChange({ enabled: v })} label="Offer Boomerang"
        hint="Adds a Boomerang tile next to the photo designs on the iPad's start screen: a short looping clip, shared by text, email and QR. Boomerangs are never printed."/>
      {value.enabled && (
        <div className="ml-[52px] space-y-4">
          <Field label="Shape" hint="The chosen shape is used whichever way the iPad is turned.">
            <div className="flex flex-wrap gap-2">
              {SHAPES.map(sh => (
                <button key={sh.value} type="button" disabled={disabled} onClick={() => changeShape(sh.value)}
                  className={'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm disabled:opacity-50 disabled:cursor-not-allowed ' + (value.format === sh.value ? 'border-brand bg-brand/5 font-medium' : 'border-gray-200 hover:bg-gray-50')}>
                  <span className="w-6 h-6 flex items-center justify-center"><span className={'block rounded-[3px] border-2 ' + (value.format === sh.value ? 'border-brand' : 'border-gray-400') + ' ' + sh.icon}/></span>
                  {CLIP_CANVAS[sh.value].label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Frame" hint="The Boomerang plays inside the design's photo area, with its background and text around it. Guests see the design while they pose (with 'Show the frame on the live view' on). Boomerangs are shared, never printed.">
            <BoomerangFramePicker eventId={eventId} format={value.format} design={value.design} designProblem={value.designProblem} overlay={value.overlay}
              lib={lib} reload={reload} disabled={disabled} onChange={p => { setNotice(''); onChange(p); }}/>
            {notice && <p className="text-sm text-amber-700 mt-2">{notice}</p>}
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <Toggle checked={value.showOverlayOnLiveView} disabled={disabled} onChange={v => onChange({ showOverlayOnLiveView: v })} label="Show the frame on the live view" hint="Guests see the design (or overlay) around them while they pose."/>
          </div>
        </div>
      )}
    </>
  );
}
