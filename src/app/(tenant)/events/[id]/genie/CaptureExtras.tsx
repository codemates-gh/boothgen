'use client';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field, Toggle } from '@/components/genie/parts';
import type { BoomerangFormat } from '@/lib/genie/schemas';
import { BoomerangTemplateField, type DesignChoice } from './BoomerangTemplate';

// Event → Genie: "Look at the camera" prompt and Boomerang (per event; no account defaults)

export type LookAtCamera = { enabled: boolean; text: string; frequency: 'everyPhoto' | 'firstPhoto' };

export type { BoomerangFormat };
export type Boomerang = {
  enabled: boolean; format: BoomerangFormat; frameCount: number; playbackSpeed: 'slow' | 'medium' | 'fast' | 'superFast';
  reverse: boolean; superSpeedCapture: boolean; showOverlayOnLiveView: boolean; mirrorLiveView: boolean;
  // A plain overlay saved before Boomerang templates (kept until a template is chosen)
  overlay: { url: string; width: number | null; height: number | null } | null;
  design: DesignChoice | null;
  designProblem: 'deleted' | 'shape' | null;
};

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

// The Boomerang's shape comes from its template's layout (Square, 9:16, 16:9, 4x6, 6x4); none = a plain square clip
export function BoomerangFields({ value, onChange, disabled, bare }: { eventId?: string; value: Boomerang; onChange: (p: Partial<Boomerang>) => void; disabled?: boolean; bare?: boolean }) {
  return (
    <>
      {!bare && <Toggle checked={value.enabled} disabled={disabled} onChange={v => onChange({ enabled: v })} label="Offer Boomerang"
        hint="Adds a Boomerang tile next to the photo designs on the iPad's start screen: a short looping clip, shared by text, email and QR. Boomerangs are never printed."/>}
      {value.enabled && (
        <div className="ml-[52px] space-y-4">
          <Field label="Template" hint="Any single-photo layout from Templates. The Boomerang is filmed at the photo frame's shape and plays in it, with the layout's background and artwork around it. Guests see it while they pose (with 'Show the frame on the live view' on).">
            <BoomerangTemplateField format={value.format} design={value.design} designProblem={value.designProblem} overlay={value.overlay}
              disabled={disabled} onChange={onChange}/>
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
