'use client';
import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Sparkles, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Field, Toggle } from '@/components/genie/parts';
import { BOOMERANG_FORMATS, CLIP_CANVAS, type BoomerangFormat } from '@/lib/genie/schemas';
import {
  MAX_PROMPTS, STARTER_PROMPTS, VIDEO_SIZE_OPTIONS, WHY_NOT_1080P, defaultVideoConsent, newPromptId,
  type VideoBoothOffer, type VideoSize,
} from '@/lib/genie/videoBoothOptions';
import { BoomerangTemplateField, type DesignChoice } from './BoomerangTemplate';

// Event → Genie → Video Booth (Genie P14), also on Genie → Defaults: guests record a short video message to a prompt.
// Included in every Genie event. Only a video the guest keeps is uploaded; videos are never printed.

export type VideoBoothValue = {
  enabled: boolean; offer: VideoBoothOffer; prompts: { id: string; text: string }[]; maxSeconds: number; retakes: number;
  videoSize: VideoSize; format: BoomerangFormat; design: DesignChoice | null; consentText: string | null; showInGallery: boolean;
  designProblem: 'deleted' | 'shape' | null;
};

// The save body: designProblem is shown only; empty consent text = BoothGen's default
export function videoBoothBody(v: VideoBoothValue) {
  const { designProblem: _p, ...rest } = v;
  return { ...rest, prompts: rest.prompts.map(p => ({ id: p.id, text: p.text.trim() })), consentText: rest.consentText?.trim() || null };
}

// Recorded size per minute of video (Genie P14: H.264 30 fps, AAC mono)
const MB_PER_MINUTE: Record<VideoSize, number> = { '720p': 15.7, '540p': 9.7, '480p': 6.5 };

export const videoBoothNumbersFilled = (v: VideoBoothValue) => !Number.isNaN(v.maxSeconds) && !Number.isNaN(v.retakes);

function PromptsEditor({ prompts, onChange, disabled }: { prompts: VideoBoothValue['prompts']; onChange: (p: VideoBoothValue['prompts']) => void; disabled?: boolean }) {
  const [starters, setStarters] = useState(false);
  const full = prompts.length >= MAX_PROMPTS;
  const move = (i: number, d: -1 | 1) => { const next = [...prompts]; [next[i], next[i + d]] = [next[i + d], next[i]]; onChange(next); };
  const add = (text = '') => { if (!full) onChange([...prompts, { id: newPromptId(), text }]); };
  const have = new Set(prompts.map(p => p.text.trim().toLowerCase()));
  return (
    <div className="space-y-2">
      {prompts.map((p, i) => (
        <div key={p.id} className="flex items-center gap-2">
          <span className="w-5 text-xs text-gray-400 text-right">{i + 1}</span>
          <Input value={p.text} maxLength={120} disabled={disabled} placeholder="e.g. Leave a message for the couple"
            onChange={e => onChange(prompts.map(q => q.id === p.id ? { ...q, text: e.target.value } : q))}/>
          {!disabled && <>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="w-4 h-4"/></Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={i === prompts.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="w-4 h-4"/></Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-[#E2445C] hover:bg-red-50" disabled={prompts.length === 1} onClick={() => onChange(prompts.filter(q => q.id !== p.id))} aria-label="Delete the prompt"><X className="w-4 h-4"/></Button>
          </>}
        </div>
      ))}
      {!disabled && (
        <div className="flex items-center gap-2 pl-7">
          <Button type="button" variant="outline" size="sm" disabled={full} onClick={() => add()}><Plus className="w-3.5 h-3.5 mr-1"/>Add prompt</Button>
          <Button type="button" variant="ghost" size="sm" disabled={full} onClick={() => setStarters(s => !s)}><Sparkles className="w-3.5 h-3.5 mr-1"/>Starter prompts</Button>
          <span className="text-xs text-gray-400">{prompts.length}/{MAX_PROMPTS}</span>
        </div>
      )}
      {starters && !disabled && (
        <div className="ml-7 p-3 border border-gray-100 rounded-lg space-y-2">
          {STARTER_PROMPTS.map(g => (
            <div key={g.group}>
              <p className="text-xs font-medium text-gray-500 mb-1">{g.group}</p>
              <div className="flex flex-wrap gap-1.5">
                {g.prompts.map(t => {
                  const added = have.has(t.toLowerCase());
                  return (
                    <button key={t} type="button" disabled={added || full} onClick={() => add(t)}
                      className={'px-2.5 py-1 rounded-full text-xs border transition-colors ' + (added ? 'border-gray-100 text-gray-300' : 'border-gray-200 text-gray-700 hover:border-brand hover:text-brand')}>
                      {added ? '✓ ' : '+ '}{t}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function VideoBoothFields({ value, onChange, disabled }: { value: VideoBoothValue; onChange: (p: Partial<VideoBoothValue>) => void; disabled?: boolean }) {
  const size = VIDEO_SIZE_OPTIONS.find(o => o.value === value.videoSize);
  return (
    <>
      <Toggle checked={value.enabled} disabled={disabled} onChange={v => onChange({ enabled: v })} label="Offer Video Booth"
        hint="Guests record a short video message to a prompt (a toast, a greeting, a confession), watch it back, and keep it or record again. Shared by text, email and QR like photos; never printed. Only videos guests keep are uploaded. Included with Genie."/>
      {value.enabled && (
        <div className="ml-[52px] space-y-5">
          <Field label="On the start screen">
            <Select value={value.offer} disabled={disabled} onChange={e => onChange({ offer: e.target.value as VideoBoothOffer })}>
              <option value="alongsidePhotos">Photos and video: a Video tile next to the photo designs</option>
              <option value="videoOnly">Video only: the booth records only video messages</option>
            </Select>
          </Field>
          <Field label="Prompts" hint="What guests answer, in this order. With one prompt guests go straight to recording; with more they pick one. 1 to 8.">
            <PromptsEditor prompts={value.prompts} disabled={disabled} onChange={prompts => onChange({ prompts })}/>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Longest video (seconds)" hint={`10–120. Recording stops by itself at this length. Longer videos are bigger and take longer to upload${Number.isNaN(value.maxSeconds) ? '' : `: up to about ${Math.max(1, Math.round(MB_PER_MINUTE[value.videoSize] * value.maxSeconds / 60))} MB each at ${value.videoSize}`}.`}>
              <Input type="number" min={10} max={120} className="w-24" disabled={disabled}
                value={Number.isNaN(value.maxSeconds) ? '' : value.maxSeconds} onChange={e => onChange({ maxSeconds: parseInt(e.target.value, 10) })}/>
            </Field>
            <Field label="Re-records" hint="0–5. How many times a guest can record again after watching their video.">
              <Input type="number" min={0} max={5} className="w-24" disabled={disabled}
                value={Number.isNaN(value.retakes) ? '' : value.retakes} onChange={e => onChange({ retakes: parseInt(e.target.value, 10) })}/>
            </Field>
          </div>
          <Field label="Video size" hint={WHY_NOT_1080P}>
            <Select value={value.videoSize} disabled={disabled} onChange={e => onChange({ videoSize: e.target.value as VideoSize })}>
              {VIDEO_SIZE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            {size && <p className="text-sm text-gray-600 mt-1.5">{size.help}</p>}
          </Field>
          <Field label="Template" hint="Any single-photo layout from Templates, the same as Boomerang. The video is filmed at the photo frame's shape and plays in it, with the layout's background and artwork around it.">
            <BoomerangTemplateField noun="video" format={value.format} design={value.design} designProblem={value.designProblem} overlay={null}
              disabled={disabled} onChange={p => onChange({
                ...(p.design !== undefined ? { design: p.design } : {}), ...(p.designProblem !== undefined ? { designProblem: p.designProblem } : {}),
                // Choosing a template sets the shape; removing it keeps the shape the video had
                ...(p.format && p.design ? { format: p.format } : {}),
              })}/>
          </Field>
          {!value.design && (
            <Field label="Shape" hint="The plain video's shape when no template is chosen.">
              <Select value={value.format} disabled={disabled} onChange={e => onChange({ format: e.target.value as BoomerangFormat })}>
                {BOOMERANG_FORMATS.map(f => <option key={f} value={f}>{CLIP_CANVAS[f].label}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Consent text" hint={`Shown before recording. Leave empty to use: "${defaultVideoConsent(value.showInGallery)}"`}>
            <textarea rows={2} maxLength={300} disabled={disabled} value={value.consentText ?? ''} placeholder={defaultVideoConsent(value.showInGallery)}
              onChange={e => onChange({ consentText: e.target.value || null })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:bg-gray-50"/>
          </Field>
          <Toggle checked={value.showInGallery} disabled={disabled} onChange={v => onChange({ showInGallery: v })} label="Show videos in the event gallery"
            hint="Off: only the guest's own page and you (the event gallery's Videos tab) see them. On: they also play in the public event gallery."/>
        </div>
      )}
    </>
  );
}
