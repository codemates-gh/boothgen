'use client';
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Info } from 'lucide-react';
import { Field, Toggle } from './parts';

// Form pieces shared by Event → Genie and Genie → Event defaults

export type Capture = {
  shotCount: number; initialCountdownSeconds: number; betweenShotsCountdownSeconds: number; showPerShotPreview: boolean; allowPerShotRetake: boolean;
  perShotPreviewSeconds: number; allowReviewRetake: boolean; retakesPerShot: number; idleTimeoutSeconds: number;
};
export type Sharing = { smsEnabled: boolean; emailEnabled: boolean; qrEnabled: boolean; guestLinkScope: 'own' | 'all'; smsBody: string; emailSubject: string; emailBody: string; smsConsentText: string };
export type Printing = { enabled: boolean; maxCopies: number; defaultCopies: number };

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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Photos per session" hint="1–10"><Num value={value.shotCount} min={1} max={10} disabled={disabled} onChange={n => onChange({ shotCount: n })}/></Field>
        <Field label="First countdown (sec)" hint="0–10"><Num value={value.initialCountdownSeconds} min={0} max={10} disabled={disabled} onChange={n => onChange({ initialCountdownSeconds: n })}/></Field>
        <Field label="Between photos (sec)" hint="0–10"><Num value={value.betweenShotsCountdownSeconds} min={0} max={10} disabled={disabled} onChange={n => onChange({ betweenShotsCountdownSeconds: n })}/></Field>
      </div>
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
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t pt-4">
        <Field label="Retakes allowed" hint="Per photo with Keep / Retake; per session from the final review. 0–3">
          <Num value={value.retakesPerShot} min={0} max={3} disabled={disabled} onChange={n => onChange({ retakesPerShot: n })}/>
        </Field>
        <Field label="Idle timeout (sec)" hint="Back to the start screen after no taps. 10–600">
          <Num value={value.idleTimeoutSeconds} min={10} max={600} disabled={disabled} onChange={n => onChange({ idleTimeoutSeconds: n })}/>
        </Field>
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

export function PrintingFields({ value, onChange, disabled }: { value: Printing; onChange: (p: Partial<Printing>) => void; disabled?: boolean }) {
  return (
    <>
      <Toggle checked={value.enabled} disabled={disabled} onChange={v => onChange({ enabled: v })} label="Printing on"/>
      {value.enabled && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Default copies" hint="1–10"><Num value={value.defaultCopies} min={1} max={10} disabled={disabled} onChange={n => onChange({ defaultCopies: n })}/></Field>
          <Field label="Max copies per session" hint="1–10"><Num value={value.maxCopies} min={1} max={10} disabled={disabled} onChange={n => onChange({ maxCopies: n })}/></Field>
        </div>
      )}
    </>
  );
}

// Every number field filled in (number inputs hold NaN while empty)
export function numbersFilled(...groups: object[]): boolean {
  return groups.every(g => Object.values(g).every(v => typeof v !== 'number' || Number.isFinite(v)));
}
