'use client';
import { useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Info } from 'lucide-react';
import { Field, Toggle } from './parts';
import { attractVideoGate } from '@/lib/genie/attractGate';

// Form pieces shared by Event → Genie and Genie → Event defaults

export type Capture = {
  shotCount: number; initialCountdownSeconds: number; betweenShotsCountdownSeconds: number; showPerShotPreview: boolean; allowPerShotRetake: boolean;
  perShotPreviewSeconds: number; allowReviewRetake: boolean; retakesPerShot: number; idleTimeoutSeconds: number;
  boomerangEdgeLight: boolean;
  thankYouSeconds: number; thankYouTitle: string; thankYouSubtitle: string;
  startScreenGenieLogo: boolean;
  // 'ipad' = "Use the iPad's setting"; custom.url is an encoded sound from /api/genie-countdown/encode
  countdownSound?: CountdownSound;
};
export type CountdownSound = { style: 'ipad' | 'off' | 'beeps' | 'femaleVoice' | 'maleVoice' | 'custom'; custom: { url: string; name: string; durationMs: number; bytes: number } | null };
export type Sharing = { smsEnabled: boolean; emailEnabled: boolean; qrEnabled: boolean; guestLinkScope: 'own' | 'all'; smsBody: string; emailSubject: string; emailBody: string; smsConsentText: string };
export type Printing = { enabled: boolean; maxCopies: number; defaultCopies: number; copiesMatchPeople: boolean };
export type AttractMedia = { url: string; kind: 'image' | 'video'; width: number; height: number; bytes: number; durationMs: number | null };
export type Attract = { media: AttractMedia | null; returnAfterSeconds: number };

// Save body for the attract section
export const attractBody = (a: Attract) => ({ mediaUrl: a.media?.url ?? null, returnAfterSeconds: a.returnAfterSeconds });

export const MERGE_HELP: [string, string][] = [
  ['{{firstName}}', "Guest's first name (blank if they skip it)"],
  ['{{eventName}}', 'Event title'],
  ['{{link}}', 'Link to their photos (required in texts)'],
  ['{{expiresOn}}', 'Last day the photos are available, e.g. "Jan 10"'],
];

export function Num({ value, onChange, min, max, disabled }: { value: number; onChange: (n: number) => void; min: number; max: number; disabled?: boolean }) {
  return <Input type="number" min={min} max={max} value={Number.isNaN(value) ? '' : value} disabled={disabled} onChange={e => onChange(parseInt(e.target.value, 10))} className="w-24"/>;
}

export function Section({ icon: Icon, title, description, right, children }: { icon: any; title: string; description?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2"><Icon className="w-4 h-4"/>{title}</CardTitle>
          {right}
        </div>
        {description && <p className="text-sm text-gray-500">{description}</p>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

// "Default" / "Custom for this event · Use default" marker for a section on the event page
export function DefaultState({ custom, onReset, disabled }: { custom: boolean; onReset: () => void; disabled?: boolean }) {
  return custom ? (
    <div className="flex items-center gap-2 flex-shrink-0">
      <Badge variant="warning">Custom for this event</Badge>
      {!disabled && <button type="button" onClick={onReset} className="text-xs text-brand hover:underline">Use default</button>}
    </div>
  ) : <Badge variant="default" className="flex-shrink-0">Default</Badge>;
}

// US and Canada first with plain names, then every other zone as "City — Region (GMT±h)"
const COMMON_ZONES: [string, string][] = [
  ['America/New_York', 'Eastern Time'],
  ['America/Chicago', 'Central Time'],
  ['America/Denver', 'Mountain Time'],
  ['America/Phoenix', 'Mountain Time — Arizona (no daylight saving)'],
  ['America/Los_Angeles', 'Pacific Time'],
  ['America/Anchorage', 'Alaska Time'],
  ['Pacific/Honolulu', 'Hawaii Time'],
  ['America/Halifax', 'Atlantic Time (Canada)'],
  ['America/St_Johns', 'Newfoundland Time'],
  ['America/Regina', 'Central Time — Saskatchewan (no daylight saving)'],
  ['America/Puerto_Rico', 'Atlantic Time — Puerto Rico'],
];

function gmtOffset(zone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? '';
  } catch { return ''; }
}

export function timeZoneLabel(zone: string): string {
  const common = COMMON_ZONES.find(([z]) => z === zone);
  const off = gmtOffset(zone);
  if (common) return `${common[1]} (${off})`;
  const parts = zone.split('/');
  const city = parts[parts.length - 1].replace(/_/g, ' ');
  const region = parts.slice(0, -1).join(' / ').replace(/_/g, ' ');
  return `${city}${region ? ' — ' + region : ''}${off ? ` (${off})` : ''}`;
}

export function useTimeZones() {
  return useMemo(() => {
    let all: string[] = [];
    try { all = (Intl as any).supportedValuesOf('timeZone') as string[]; } catch { /* old browsers: common list only */ }
    const common = COMMON_ZONES.map(([z]) => z);
    const others = all.filter(z => !common.includes(z)).map(z => ({ zone: z, label: timeZoneLabel(z) })).sort((a, b) => a.label.localeCompare(b.label));
    return { common: common.map(z => ({ zone: z, label: timeZoneLabel(z) })), others };
  }, []);
}

export function TimeZoneSelect({ value, onChange, disabled }: { value: string; onChange: (tz: string) => void; disabled?: boolean }) {
  const { common, others } = useTimeZones();
  const known = common.some(z => z.zone === value) || others.some(z => z.zone === value);
  return (
    <Select value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
      {!known && <option value={value}>{timeZoneLabel(value)}</option>}
      <optgroup label="United States & Canada">
        {common.map(z => <option key={z.zone} value={z.zone}>{z.label}</option>)}
      </optgroup>
      <optgroup label="All time zones">
        {others.map(z => <option key={z.zone} value={z.zone}>{z.label}</option>)}
      </optgroup>
    </Select>
  );
}

export function CaptureFields({ value, onChange, disabled, children }: { value: Capture; onChange: (p: Partial<Capture>) => void; disabled?: boolean; children?: React.ReactNode }) {
  return (
    <>
      <p className="text-xs text-gray-500">Each template sets how many photos guests take: one per photo frame.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="First countdown (sec)" hint="0–10"><Num value={value.initialCountdownSeconds} min={0} max={10} disabled={disabled} onChange={n => onChange({ initialCountdownSeconds: n })}/></Field>
        <Field label="Between photos (sec)" hint="0–10"><Num value={value.betweenShotsCountdownSeconds} min={0} max={10} disabled={disabled} onChange={n => onChange({ betweenShotsCountdownSeconds: n })}/></Field>
      </div>
      <CountdownSoundField value={value.countdownSound ?? { style: 'ipad', custom: null }} disabled={disabled} onChange={c => onChange({ countdownSound: c })}/>
      {children}
      <div className="space-y-3 border-t pt-4">
        <Toggle checked={value.showPerShotPreview} disabled={disabled} onChange={v => onChange({ showPerShotPreview: v })} label="Show each photo after it's taken"/>
        {value.showPerShotPreview && (
          <div className="ml-[52px] space-y-3">
            <Toggle checked={value.allowPerShotRetake} disabled={disabled} onChange={v => onChange({ allowPerShotRetake: v })} label="Keep / Retake buttons on each photo" hint="Off: the photo shows for a few seconds, then the session continues."/>
            {!value.allowPerShotRetake && (
              <Field label="Preview seconds" hint="1–10"><Num value={value.perShotPreviewSeconds} min={1} max={10} disabled={disabled} onChange={n => onChange({ perShotPreviewSeconds: n })}/></Field>
            )}
          </div>
        )}
        <Toggle checked={value.allowReviewRetake} disabled={disabled} onChange={v => onChange({ allowReviewRetake: v })} label="Retake from the final review" hint="Guests can retake any photo before printing and sharing."/>
        <Toggle checked={value.boomerangEdgeLight} disabled={disabled} onChange={v => onChange({ boomerangEdgeLight: v })} label="Edge light while a boomerang records"
          hint="A bright white border around the live view for the second or so a boomerang records: guests see it's capturing, and it lights their faces on the iPad camera. Steady, not flashing, so the clip doesn't flicker."/>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t pt-4">
        <Field label="Retakes allowed" hint="Per photo with Keep / Retake; per session from the final review. 0–3">
          <Num value={value.retakesPerShot} min={0} max={3} disabled={disabled} onChange={n => onChange({ retakesPerShot: n })}/>
        </Field>
        <Field label="Review screen timeout (sec)" hint="How long the final photo with Print / Share stays up without a tap before going back to the start screen. Also applies to any screen waiting for the guest. 10–600">
          <Num value={value.idleTimeoutSeconds} min={10} max={600} disabled={disabled} onChange={n => onChange({ idleTimeoutSeconds: n })}/>
        </Field>
      </div>
      <div className="border-t pt-4">
        <Toggle checked={value.startScreenGenieLogo} disabled={disabled} onChange={v => onChange({ startScreenGenieLogo: v })} label="Show the Genie logo on the start screen"
          hint="The Genie logo and sparkle on the iPad's start screen. Off: guests see only “Tap anywhere to start” over the camera. Needs Genie 0.6.0 (40) or later."/>
      </div>
      <div className="border-t pt-4 space-y-3">
        <div>
          <p className="font-medium text-sm">Thank-you screen</p>
          <p className="text-xs text-gray-500 mt-0.5">Shown after a guest taps Done (or the review screen times out), then the booth goes back to the start. Needs Genie 0.5.0 (14) or later.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Shows for (sec)" hint="1–30"><Num value={value.thankYouSeconds} min={1} max={30} disabled={disabled} onChange={n => onChange({ thankYouSeconds: n })}/></Field>
          <Field label="Title" hint={`${value.thankYouTitle.length}/40`}><Input value={value.thankYouTitle} maxLength={40} disabled={disabled} onChange={e => onChange({ thankYouTitle: e.target.value })}/></Field>
          <Field label="Second line" hint={`${value.thankYouSubtitle.length}/100 · leave empty for none`}><Input value={value.thankYouSubtitle} maxLength={100} disabled={disabled} onChange={e => onChange({ thankYouSubtitle: e.target.value })}/></Field>
        </div>
      </div>
    </>
  );
}

export function SharingFields({ value, onChange, disabled }: { value: Sharing; onChange: (p: Partial<Sharing>) => void; disabled?: boolean }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Toggle checked={value.smsEnabled} disabled={disabled} onChange={v => onChange({ smsEnabled: v })} label="Text message"/>
        <Toggle checked={value.emailEnabled} disabled={disabled} onChange={v => onChange({ emailEnabled: v })} label="Email"/>
        <Toggle checked={value.qrEnabled} disabled={disabled} onChange={v => onChange({ qrEnabled: v })} label="QR code"/>
      </div>
      <Field label="Link opens">
        <Select value={value.guestLinkScope} disabled={disabled} onChange={e => onChange({ guestLinkScope: e.target.value as 'own' | 'all' })}>
          <option value="own">The guest&apos;s own photos</option>
          <option value="all">The whole event gallery (live during the event)</option>
        </Select>
      </Field>
      <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
        <p className="font-medium text-gray-700 mb-1.5 flex items-center gap-1"><Info className="w-3.5 h-3.5"/>Merge fields</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
          {MERGE_HELP.map(([f, d]) => <p key={f}><code className="font-mono text-gray-800">{f}</code> {d}</p>)}
        </div>
      </div>
      <Field label="Text message" hint={`${value.smsBody.length}/480`}>
        <Textarea rows={3} value={value.smsBody} disabled={disabled} maxLength={480} onChange={e => onChange({ smsBody: e.target.value })}/>
      </Field>
      <Field label="Email subject"><Input value={value.emailSubject} disabled={disabled} maxLength={200} onChange={e => onChange({ emailSubject: e.target.value })}/></Field>
      <Field label="Email message" hint="A button with the link is added below your message.">
        <Textarea rows={5} value={value.emailBody} disabled={disabled} maxLength={5000} onChange={e => onChange({ emailBody: e.target.value })}/>
      </Field>
      <Field label="Text message consent" hint="Guests tick this before they can get a text.">
        <Textarea rows={2} value={value.smsConsentText} disabled={disabled} maxLength={500} onChange={e => onChange({ smsConsentText: e.target.value })}/>
      </Field>
    </>
  );
}

export type GalleryDefaults = { uploadAll: boolean; autoPublish: boolean };

// Event gallery (Event defaults and each event): upload every Sharing station photo, publish when the event ends
export function GalleryFields({ value, onChange, disabled }: { value: GalleryDefaults; onChange: (p: Partial<GalleryDefaults>) => void; disabled?: boolean }) {
  return (
    <>
      <Toggle checked={value.autoPublish} disabled={disabled} onChange={v => onChange({ autoPublish: v })} label="Publish the gallery when the event ends"
        hint="Once the event is over, its gallery is published (if it has photos) and your client gets the usual gallery email or automation. You can still publish or unpublish it yourself."/>
      <Toggle checked={value.uploadAll} disabled={disabled} onChange={v => onChange({ uploadAll: v })} label="Upload every photo to the gallery"
        hint="For a Sharing station (PC booth): every photo from the PC goes to the event's gallery (uses more storage). Off: only photos guests share are uploaded. Genie iPad photos are always uploaded."/>
    </>
  );
}

export function PrintingFields({ value, onChange, disabled }: { value: Printing; onChange: (p: Partial<Printing>) => void; disabled?: boolean }) {
  return (
    <>
      <Toggle checked={value.enabled} disabled={disabled} onChange={v => onChange({ enabled: v })} label="Printing on"/>
      {value.enabled && (
        <>
        <Toggle checked={value.copiesMatchPeople} disabled={disabled} onChange={v => onChange({ copiesMatchPeople: v })} label="Copies match the number of people"
          hint="The iPad counts the people in the photos and sets the number of prints for you (one per person; for 2x6 strips, one sheet per two people). It never goes above Max copies, and uses Default copies when it can't see anyone. Guests can still change the number before printing."/>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Default copies" hint={value.copiesMatchPeople ? '1–10, when nobody is detected' : '1–10'}><Num value={value.defaultCopies} min={1} max={10} disabled={disabled} onChange={n => onChange({ defaultCopies: n })}/></Field>
          <Field label="Max copies per session" hint="1–10"><Num value={value.maxCopies} min={1} max={10} disabled={disabled} onChange={n => onChange({ maxCopies: n })}/></Field>
        </div>
        </>
      )}
    </>
  );
}

// Every number field filled in (number inputs hold NaN while empty)
const COUNTDOWN_OPTIONS: [CountdownSound['style'], string][] = [
  ['ipad', "Use the iPad's setting"], ['off', 'Off'], ['beeps', 'Beeps'], ['femaleVoice', 'Female voice'], ['maleVoice', 'Male voice'], ['custom', 'Custom sound'],
];
const COUNTDOWN_ACCEPT = '.mp3,.m4a,.aac,.wav,.aif,.aiff,audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/aiff,audio/x-aiff';

// Countdown sound: what the iPad plays with the countdown. A custom sound is converted once on upload (≤ 15 s).
function CountdownSoundField({ value, onChange, disabled }: { value: CountdownSound; onChange: (c: CountdownSound) => void; disabled?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<'' | 'uploading' | 'converting'>('');
  const [pct, setPct] = useState(0);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [removed, setRemoved] = useState(false);

  async function upload(file: File) {
    setError(''); setNote(''); setRemoved(false);
    // Some browsers report no type for .aiff/.m4a; go by the extension then
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const type = file.type || ({ mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', aif: 'audio/aiff', aiff: 'audio/aiff' } as Record<string, string>)[ext] || '';
    if (!type) { setError('Use an MP3, M4A, WAV or AIFF sound.'); return; }
    if (file.size > 20 * 1024 * 1024) { setError('Sounds must be 20 MB or smaller.'); return; }
    setPhase('uploading'); setPct(0);
    try {
      const r = await fetch('/api/genie-countdown/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contentType: type, bytes: file.size }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not start the upload');
      const put = new File([file], file.name, { type });
      if (!(await putWithProgress(d.uploadUrl, put, setPct))) throw new Error("The upload didn't go through. Check your connection and try again.");
      setPhase('converting');
      const e = await fetch('/api/genie-countdown/encode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: d.url, name: file.name }) });
      const ed = await e.json().catch(() => ({}));
      if (!e.ok) throw new Error(ed.error || "That sound couldn't be converted. Try an MP3 or M4A.");
      onChange({ style: 'custom', custom: ed.sound });
      setNote(ed.trimmed ? 'Only the first 15 seconds are used.' : '');
    } catch (err) {
      setError((err as Error).message);
    }
    setPhase('');
  }

  const busy = phase !== '';
  const c = value.custom;
  return (
    <div className="space-y-2 border-t pt-4">
      <Field label="Countdown sound" hint="Beeps or a voice count down with the numbers on screen, and a shutter clicks at the photo. Voices use the iPad's own voice in the iPad's language. A custom sound is timed to end as the photo is taken, so a &quot;3, 2, 1, smile!&quot; recording lines up. Guests only hear it if the iPad's volume is up.">
        <Select value={value.style} disabled={disabled} onChange={e => onChange({ style: e.target.value as CountdownSound['style'], custom: value.custom })} className="sm:max-w-xs">
          {COUNTDOWN_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      {removed && value.style !== 'custom' && <p className="text-xs text-gray-500">Sound removed. Save to apply; the file is deleted once nothing uses it.</p>}
      {value.style === 'custom' && (
        <div className="ml-0 sm:ml-1 space-y-2">
          {c && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
              <span className="font-medium">{c.name}</span>
              <span className="text-gray-500">{(c.durationMs / 1000).toFixed(1)} s</span>
              <audio src={c.url} controls controlsList="nodownload noplaybackrate" onContextMenu={e => e.preventDefault()} preload="none" className="h-8" />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept={COUNTDOWN_ACCEPT} className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }}/>
            <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={() => fileRef.current?.click()}>
              {phase === 'uploading' ? `Uploading… ${pct}%` : phase === 'converting' ? 'Converting for the iPad…' : c ? 'Replace sound' : 'Upload sound'}
            </Button>
            {c && (
              <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={() => { setNote(''); setError(''); onChange({ style: 'ipad', custom: null }); setRemoved(true); }}>
                Remove sound
              </Button>
            )}
          </div>
          <p className="text-xs text-gray-400">MP3, M4A, WAV or AIFF up to 20 MB. We convert it for the iPad and use at most the first 15 seconds (the iPad won&apos;t play anything longer).{!c && ' Upload a sound to save this choice.'}</p>
          {note && <p className="text-xs text-green-700">{note} Save to use it.</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

export function numbersFilled(...groups: object[]): boolean {
  return groups.every(g => Object.values(g).every(v => typeof v !== 'number' || Number.isFinite(v)));
}

const ATTRACT_TYPES: Record<string, { kind: 'image' | 'video'; max: number }> = {
  'image/jpeg': { kind: 'image', max: 20 }, 'image/png': { kind: 'image', max: 20 },
  'video/mp4': { kind: 'video', max: 200 }, 'video/quicktime': { kind: 'video', max: 200 },
};
// Length and size of a video from its metadata, read in the browser before uploading; null when the browser
// can't read it (e.g. HEVC on some PCs), and the server checks it after the upload instead
function videoInfo(file: File): Promise<{ durationMs: number | null; width: number; height: number } | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    const done = (r: { durationMs: number | null; width: number; height: number } | null) => { clearTimeout(timer); URL.revokeObjectURL(url); v.removeAttribute('src'); resolve(r); };
    const timer = setTimeout(() => done(null), 8000);
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => done({ durationMs: Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : null, width: v.videoWidth, height: v.videoHeight });
    v.onerror = () => done(null);
    v.src = url;
  });
}
// PUT with upload progress (fetch can't report it); resolves false when it fails
export function putWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<boolean> {
  return new Promise(resolve => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('Content-Type', file.type);
    x.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    x.onload = () => resolve(x.status >= 200 && x.status < 300);
    x.onerror = () => resolve(false);
    x.send(file);
  });
}
const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + ' MB';

// Attract screen: none, a still image or a looping video. Uploads are shrunk on the server once, before saving.
export function AttractFields({ value, onChange, disabled }: { value: Attract; onChange: (p: Partial<Attract>) => void; disabled?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<'' | 'uploading' | 'shrinking'>('');
  const [pct, setPct] = useState(0);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [removed, setRemoved] = useState(false);

  async function upload(file: File) {
    setError(''); setNote('');
    const type = ATTRACT_TYPES[file.type];
    if (!type) { setError('Use a JPG or PNG image, or an MP4 or MOV video.'); return; }
    if (file.size > type.max * 1024 * 1024) { setError(type.kind === 'image' ? 'Images must be 20 MB or smaller.' : 'Videos must be 200 MB or smaller.'); return; }
    if (type.kind === 'video') {
      const info = await videoInfo(file);
      const gate = info && attractVideoGate(info.durationMs, info.width, info.height);
      if (gate) { setError(gate); return; }
    }
    setPhase('uploading'); setPct(0);
    try {
      const r = await fetch('/api/genie-attract/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contentType: file.type, bytes: file.size }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not start the upload');
      if (!(await putWithProgress(d.uploadUrl, file, setPct))) throw new Error("The upload didn't go through. Check your connection and try again.");
      setPhase('shrinking');
      const e = await fetch('/api/genie-attract/encode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: d.url }) });
      const ed = await e.json().catch(() => ({}));
      if (!e.ok) throw new Error(ed.error || "That file couldn't be converted. Try a different one.");
      onChange({ media: ed.media });
      setNote(`Shrunk from ${mb(ed.sourceBytes)} to ${mb(ed.media.bytes)}.${ed.trimmed ? ' Only the first 30 seconds are used.' : ''}`);
    } catch (err) {
      setError((err as Error).message);
    }
    setPhase('');
  }

  const m = value.media;
  const busy = phase !== '';
  return (
    <>
      <p className="text-xs text-gray-500">
        Shown full screen while the booth waits for guests; a touch opens the start screen. The whole file is shown, centred, with black bars where its shape differs from the screen; match the booth screen's shape (e.g. portrait 3:4 for an iPad standing upright) to avoid the bars.
        Short loops look best: 10–20 seconds. We shrink it for the iPad automatically (about 10 MB for 20 seconds of video), and video plays without sound.
      </p>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {m && (
          <div className="w-48 aspect-video rounded border border-gray-200 bg-gray-900 overflow-hidden flex-shrink-0">
            {m.kind === 'video'
              ? <video src={m.url} className="w-full h-full object-contain" autoPlay loop muted playsInline/>
              : <img src={m.url} alt="Attract screen" className="w-full h-full object-contain"/>}
          </div>
        )}
        <div className="space-y-2">
          {m && (
            <p className="text-sm text-gray-700">
              {m.kind === 'video' ? 'Video' : 'Image'} · {m.width}×{m.height} · {mb(m.bytes)}{m.durationMs ? ` · ${(m.durationMs / 1000).toFixed(1)} s` : ''}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,video/mp4,video/quicktime" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }}/>
            <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={() => fileRef.current?.click()}>
              {phase === 'uploading' ? `Uploading… ${pct}%` : phase === 'shrinking' ? 'Shrinking it for the iPad…' : m ? 'Replace' : 'Upload image or video'}
            </Button>
            {m && <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={() => { onChange({ media: null }); setNote(''); }}>Remove</Button>}
          </div>
          {!m && !busy && <p className="text-xs text-gray-400">None: the booth opens on the start screen. Image: JPG or PNG up to 20 MB. Video: MP4 or MOV, up to a minute long, 4K and 200 MB; we use the first 30 seconds.</p>}
          {phase === 'shrinking' && <p className="text-xs text-gray-400">A video can take a minute or two. Keep this page open.</p>}
          {note && <p className="text-xs text-green-700">{note} Save to use it.</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
      <div className="border-t pt-4">
        <Field label="Return to the attract screen after (sec)" hint="How long the start screen stays up without a touch, including after a session, before the attract screen comes back. 5–600">
          <Num value={value.returnAfterSeconds} min={5} max={600} disabled={disabled} onChange={n => onChange({ returnAfterSeconds: n })}/>
        </Field>
      </div>
    </>
  );
}
