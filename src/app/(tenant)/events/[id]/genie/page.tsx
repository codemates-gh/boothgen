'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Sparkles, Lock, AlertTriangle, Camera, Palette, Share2, Printer, Settings2, Code2, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { Field, Toggle, fmtDate, fmtDateTime } from './parts';
import GenieTemplates, { EventTemplate, templateMismatch } from './GenieTemplates';
import GenieEventDevices from './GenieEventDevices';
import GenieShares from './GenieShares';

type Capture = {
  shotCount: number; initialCountdownSeconds: number; betweenShotsCountdownSeconds: number; showPerShotPreview: boolean; allowPerShotRetake: boolean;
  perShotPreviewSeconds: number; allowReviewRetake: boolean; retakesPerShot: number; idleTimeoutSeconds: number;
};
type Settings = {
  enabled: boolean; timeZone: string; bundleVersion: number; maxDevices: number; capture: Capture;
  filters: { guestFiltersEnabled: boolean; defaultFilterId: string; filterIds: string[]; available: { id: string; name: string }[] };
  sharing: { smsEnabled: boolean; emailEnabled: boolean; qrEnabled: boolean; guestLinkScope: 'own' | 'all'; smsBody: string; emailSubject: string; emailBody: string; smsConsentText: string };
  printing: { enabled: boolean; maxCopies: number; defaultCopies: number };
};
type Dashboard = {
  event: { id: string; title: string; eventDate: string; startTime: string | null; endTime: string | null };
  settings: Settings | null; lockedAt: string | null; locksAt: string; templates: EventTemplate[];
  providerWarnings: { channel: 'sms' | 'email'; message: string }[]; photosHiddenAt: string; photosDeletedAt: string; designApprovalPending: boolean;
};
type Form = Pick<Settings, 'enabled' | 'timeZone' | 'capture' | 'sharing' | 'printing'> & { filters: Omit<Settings['filters'], 'available'> };

const MERGE_HELP: [string, string][] = [
  ['{{firstName}}', "Guest's first name (blank if they skip it)"],
  ['{{eventName}}', 'Event title'],
  ['{{link}}', 'Link to their photos (required in texts)'],
  ['{{expiresOn}}', 'Last day the photos are available, e.g. "Jan 10"'],
];

function toForm(s: Settings): Form {
  const { available: _a, ...filters } = s.filters;
  return { enabled: s.enabled, timeZone: s.timeZone, capture: { ...s.capture }, filters, sharing: { ...s.sharing }, printing: { ...s.printing } };
}

function Num({ value, onChange, min, max, disabled }: { value: number; onChange: (n: number) => void; min: number; max: number; disabled?: boolean }) {
  return <Input type="number" min={min} max={max} value={Number.isNaN(value) ? '' : value} disabled={disabled} onChange={e => onChange(parseInt(e.target.value, 10))} className="w-24"/>;
}

function Section({ icon: Icon, title, description, children }: { icon: any; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Icon className="w-4 h-4"/>{title}</CardTitle>
        {description && <p className="text-sm text-gray-500">{description}</p>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export default function EventGeniePage() {
  const { id: eventId } = useParams<{ id: string }>();
  const [data, setData] = useState<Dashboard | null>(null);
  const [notEnabled, setNotEnabled] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [setupTz, setSetupTz] = useState('');
  const [settingUp, setSettingUp] = useState(false);
  const [bundleOpen, setBundleOpen] = useState(false);
  const [bundle, setBundle] = useState<{ json?: unknown; error?: string } | null>(null);

  const timeZones = useMemo(() => { try { return (Intl as any).supportedValuesOf('timeZone') as string[]; } catch { return []; } }, []);

  const load = useCallback(async (resetForm = true) => {
    const r = await fetch(`/api/events/${eventId}/genie`);
    if (r.status === 403) { setNotEnabled(true); return; }
    if (r.status === 404) { setNotFound(true); return; }
    if (!r.ok) return;
    const d: Dashboard = await r.json();
    setData(d);
    if (resetForm && d.settings) setForm(toForm(d.settings));
  }, [eventId]);

  useEffect(() => { load(); setSetupTz(Intl.DateTimeFormat().resolvedOptions().timeZone); }, [load]);

  useEffect(() => { if (!savedAt) return; const t = setTimeout(() => setSavedAt(null), 4000); return () => clearTimeout(t); }, [savedAt]);

  const dirty = !!(form && data?.settings && JSON.stringify(form) !== JSON.stringify(toForm(data.settings)));
  const locked = !!data?.lockedAt;
  const tz = data?.settings?.timeZone;

  async function setUp() {
    setSettingUp(true); setSaveError('');
    const r = await fetch(`/api/events/${eventId}/genie`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timeZone: setupTz }) });
    if (!r.ok) setSaveError((await r.json().catch(() => ({}))).error || 'Could not set up Genie');
    setSettingUp(false);
    load();
  }

  async function save() {
    if (!form) return;
    const nums = [...Object.values(form.capture), form.printing.maxCopies, form.printing.defaultCopies].filter(v => typeof v === 'number') as number[];
    if (nums.some(n => !Number.isFinite(n))) { setSaveError('Fill in every number before saving.'); return; }
    setSaving(true); setSaveError('');
    const r = await fetch(`/api/events/${eventId}/genie`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const d = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) { setSaveError(d.error || 'Could not save'); return; }
    setSavedAt(Date.now());
    setBundle(null);
    load();
  }

  async function loadBundle() {
    setBundle(null);
    const r = await fetch(`/api/events/${eventId}/genie/bundle`);
    const d = await r.json().catch(() => ({}));
    setBundle(r.ok ? { json: d } : { error: d.error || 'Could not build the bundle' });
    if (r.ok) load(false); // building can bump the bundle version
  }

  const set = <K extends keyof Form>(key: K, patch: Partial<Form[K]>) => setForm(f => f && ({ ...f, [key]: typeof f[key] === 'object' ? { ...(f[key] as object), ...patch } : patch }));
  const cap = (patch: Partial<Capture>) => set('capture', patch);

  const mismatched = form && data ? data.templates.filter(t => templateMismatch(t, form.capture.shotCount)) : [];

  return (
    <>
      <TopBar title="Genie"/>
      <div className="p-4 sm:p-8 space-y-6 max-w-5xl pb-28">
        <Link href={`/events/${eventId}`} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>Back to Event</Link>

        {notEnabled ? (
          <Card>
            <CardContent className="text-center py-12 text-gray-500">
              <Sparkles className="w-10 h-10 mx-auto mb-3 text-gray-300"/>
              <p className="font-medium text-gray-700 mb-1">Genie is an add-on</p>
              <p className="text-sm">Genie runs your iPad photo booth and texts or emails guests their photos. Contact support to enable it for your account.</p>
            </CardContent>
          </Card>
        ) : notFound ? (
          <p className="text-sm text-gray-500">Event not found.</p>
        ) : !data ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h2 className="text-xl sm:text-2xl font-bold">{data.event.title}</h2>
                  {data.settings && <Badge variant={data.settings.enabled ? 'success' : 'default'}>{data.settings.enabled ? 'Genie on' : 'Genie off'}</Badge>}
                  {locked && <Badge variant="info"><Lock className="w-3 h-3 mr-1 inline"/>Locked</Badge>}
                </div>
                <p className="text-sm text-gray-500">{fmtDate(data.event.eventDate, 'UTC')}{data.settings ? ` · Bundle version ${data.settings.bundleVersion}` : ''}</p>
              </div>
            </div>

            {data.designApprovalPending && (
              <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0"/>
                <span>The client hasn&apos;t approved the design yet. Genie still runs; make sure the templates match what they approve. <Link href={`/events/${eventId}/designs`} className="underline">View designs</Link></span>
              </div>
            )}

            {!data.settings ? (
              <Card>
                <CardContent className="py-10 max-w-md mx-auto text-center space-y-4">
                  <Sparkles className="w-10 h-10 mx-auto text-gray-300"/>
                  <div>
                    <p className="font-medium text-gray-700 mb-1">Set up Genie for this event</p>
                    <p className="text-sm text-gray-500">Choose the event&apos;s time zone. You can change everything else after.</p>
                  </div>
                  <Select value={setupTz} onChange={e => setSetupTz(e.target.value)}>
                    {(timeZones.includes(setupTz) ? timeZones : [setupTz, ...timeZones]).map(z => <option key={z} value={z}>{z}</option>)}
                  </Select>
                  {saveError && <p className="text-sm text-red-600">{saveError}</p>}
                  <Button onClick={setUp} disabled={settingUp || !setupTz}>{settingUp ? 'Setting up…' : 'Set Up Genie'}</Button>
                </CardContent>
              </Card>
            ) : form && (
              <>
                {locked && (
                  <div className="flex items-start gap-2 text-sm text-[#0073E6] bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    <Lock className="w-4 h-4 mt-0.5 flex-shrink-0"/>
                    <span>Locked since {fmtDateTime(data.lockedAt, tz)}. The event has started, so iPads keep the version they have and changes here are off. You can still release iPads and resend messages.</span>
                  </div>
                )}

                <Section icon={Settings2} title="Details">
                  <Toggle checked={form.enabled} disabled={locked} onChange={v => setForm({ ...form, enabled: v })} label="Genie on for this event" hint="Off hides the event from your iPads."/>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Field label="Time zone">
                      <Select value={form.timeZone} disabled={locked} onChange={e => setForm({ ...form, timeZone: e.target.value })}>
                        {(timeZones.includes(form.timeZone) ? timeZones : [form.timeZone, ...timeZones]).map(z => <option key={z} value={z}>{z}</option>)}
                      </Select>
                    </Field>
                    <Field label="Bundle version" hint="Goes up when anything iPads download changes.">
                      <p className="text-sm font-medium h-10 flex items-center">v{data.settings.bundleVersion}</p>
                    </Field>
                    <Field label={locked ? 'Locked' : 'Locks'} hint="Changes stop reaching iPads once the event starts.">
                      <p className="text-sm font-medium h-10 flex items-center gap-1.5">{locked && <Lock className="w-3.5 h-3.5"/>}{fmtDateTime(locked ? data.lockedAt : data.locksAt, tz)}</p>
                    </Field>
                  </div>
                </Section>

                <Section icon={Camera} title="Capture" description="What guests go through at the booth.">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Field label="Photos per session" hint="1–10"><Num value={form.capture.shotCount} min={1} max={10} disabled={locked} onChange={n => cap({ shotCount: n })}/></Field>
                    <Field label="First countdown (sec)" hint="0–10"><Num value={form.capture.initialCountdownSeconds} min={0} max={10} disabled={locked} onChange={n => cap({ initialCountdownSeconds: n })}/></Field>
                    <Field label="Between photos (sec)" hint="0–10"><Num value={form.capture.betweenShotsCountdownSeconds} min={0} max={10} disabled={locked} onChange={n => cap({ betweenShotsCountdownSeconds: n })}/></Field>
                  </div>
                  {mismatched.length > 0 && (
                    <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0"/>
                      <span>Guests take {form.capture.shotCount} photo{form.capture.shotCount === 1 ? '' : 's'}, but {mismatched.map(t => t.name).join(', ')} {mismatched.length === 1 ? 'has' : 'have'} a different number of frames.</span>
                    </div>
                  )}
                  <div className="space-y-3 border-t pt-4">
                    <Toggle checked={form.capture.showPerShotPreview} disabled={locked} onChange={v => cap({ showPerShotPreview: v })} label="Show each photo after it's taken"/>
                    {form.capture.showPerShotPreview && (
                      <div className="ml-[52px] space-y-3">
                        <Toggle checked={form.capture.allowPerShotRetake} disabled={locked} onChange={v => cap({ allowPerShotRetake: v })} label="Keep / Retake buttons on each photo" hint="Off: the photo shows for a few seconds, then the session continues."/>
                        {!form.capture.allowPerShotRetake && (
                          <Field label="Preview seconds" hint="1–10"><Num value={form.capture.perShotPreviewSeconds} min={1} max={10} disabled={locked} onChange={n => cap({ perShotPreviewSeconds: n })}/></Field>
                        )}
                      </div>
                    )}
                    <Toggle checked={form.capture.allowReviewRetake} disabled={locked} onChange={v => cap({ allowReviewRetake: v })} label="Retake from the final review" hint="Guests can retake any photo before printing and sharing."/>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t pt-4">
                    <Field label="Retakes allowed" hint="Per photo with Keep / Retake; per session from the final review. 0–3">
                      <Num value={form.capture.retakesPerShot} min={0} max={3} disabled={locked} onChange={n => cap({ retakesPerShot: n })}/>
                    </Field>
                    <Field label="Idle timeout (sec)" hint="Back to the start screen after no taps. 10–600">
                      <Num value={form.capture.idleTimeoutSeconds} min={10} max={600} disabled={locked} onChange={n => cap({ idleTimeoutSeconds: n })}/>
                    </Field>
                  </div>
                </Section>

                <GenieTemplates eventId={eventId} templates={data.templates} shotCount={form.capture.shotCount} locked={locked} onChange={() => { setBundle(null); load(false); }}/>

                <Section icon={Palette} title="Filters" description="Looks guests can pick on the review screen.">
                  <Toggle checked={form.filters.guestFiltersEnabled} disabled={locked} onChange={v => set('filters', { guestFiltersEnabled: v })} label="Let guests choose a filter" hint="Off: every photo uses the default filter."/>
                  <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
                    {data.settings.filters.available.map(f => {
                      const on = form.filters.filterIds.includes(f.id);
                      return (
                        <div key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                          <input type="checkbox" className="w-4 h-4 rounded" checked={on} disabled={locked || (on && form.filters.filterIds.length === 1)}
                            onChange={e => {
                              const ids = e.target.checked ? data.settings!.filters.available.map(a => a.id).filter(id => id === f.id || form.filters.filterIds.includes(id)) : form.filters.filterIds.filter(id => id !== f.id);
                              set('filters', { filterIds: ids, defaultFilterId: ids.includes(form.filters.defaultFilterId) ? form.filters.defaultFilterId : ids[0] });
                            }}/>
                          <span className="text-sm flex-1">{f.name}</span>
                          <label className={'flex items-center gap-1.5 text-xs ' + (on ? 'text-gray-600 cursor-pointer' : 'text-gray-300')}>
                            <input type="radio" name="defaultFilter" checked={form.filters.defaultFilterId === f.id} disabled={locked || !on} onChange={() => set('filters', { defaultFilterId: f.id })}/>
                            Default
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </Section>

                <Section icon={Share2} title="Sharing" description="How guests get their photos from the iPad.">
                  {data.providerWarnings.map(w => (
                    <div key={w.channel} className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0"/><span>{w.message} <Link href="/settings/genie" className="underline whitespace-nowrap">Open settings</Link></span>
                    </div>
                  ))}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Toggle checked={form.sharing.smsEnabled} disabled={locked} onChange={v => set('sharing', { smsEnabled: v })} label="Text message"/>
                    <Toggle checked={form.sharing.emailEnabled} disabled={locked} onChange={v => set('sharing', { emailEnabled: v })} label="Email"/>
                    <Toggle checked={form.sharing.qrEnabled} disabled={locked} onChange={v => set('sharing', { qrEnabled: v })} label="QR code"/>
                  </div>
                  <Field label="Link opens">
                    <Select value={form.sharing.guestLinkScope} disabled={locked} onChange={e => set('sharing', { guestLinkScope: e.target.value as 'own' | 'all' })}>
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
                  <Field label="Text message" hint={`${form.sharing.smsBody.length}/480`}>
                    <Textarea rows={3} value={form.sharing.smsBody} disabled={locked} maxLength={480} onChange={e => set('sharing', { smsBody: e.target.value })}/>
                  </Field>
                  <Field label="Email subject"><Input value={form.sharing.emailSubject} disabled={locked} maxLength={200} onChange={e => set('sharing', { emailSubject: e.target.value })}/></Field>
                  <Field label="Email message" hint="A button with the link is added below your message.">
                    <Textarea rows={5} value={form.sharing.emailBody} disabled={locked} maxLength={5000} onChange={e => set('sharing', { emailBody: e.target.value })}/>
                  </Field>
                  <Field label="Text message consent" hint="Guests tick this before they can get a text.">
                    <Textarea rows={2} value={form.sharing.smsConsentText} disabled={locked} maxLength={500} onChange={e => set('sharing', { smsConsentText: e.target.value })}/>
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4">
                    <Field label="Photo links stop working" hint="Follows your gallery expiry setting.">
                      <p className="text-sm font-medium">{fmtDate(data.photosHiddenAt, tz)}</p>
                    </Field>
                    <Field label="Photos deleted" hint="Removed from storage and from the iPads.">
                      <p className="text-sm font-medium">{fmtDate(data.photosDeletedAt, tz)}</p>
                    </Field>
                  </div>
                </Section>

                <Section icon={Printer} title="Printing">
                  <Toggle checked={form.printing.enabled} disabled={locked} onChange={v => set('printing', { enabled: v })} label="Printing on"/>
                  {form.printing.enabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <Field label="Default copies" hint="1–10"><Num value={form.printing.defaultCopies} min={1} max={10} disabled={locked} onChange={n => set('printing', { defaultCopies: n })}/></Field>
                      <Field label="Max copies per session" hint="1–10"><Num value={form.printing.maxCopies} min={1} max={10} disabled={locked} onChange={n => set('printing', { maxCopies: n })}/></Field>
                    </div>
                  )}
                </Section>

                <GenieEventDevices eventId={eventId}/>
                <GenieShares eventId={eventId} timeZone={form.timeZone}/>

                <Card>
                  <button className="w-full flex items-center gap-2 p-6 text-left" onClick={() => { const open = !bundleOpen; setBundleOpen(open); if (open && !bundle) loadBundle(); }}>
                    {bundleOpen ? <ChevronDown className="w-4 h-4"/> : <ChevronRight className="w-4 h-4"/>}
                    <Code2 className="w-4 h-4"/><span className="text-[15px] font-semibold text-[#1F1F3D]">Bundle JSON</span>
                    <span className="text-xs text-gray-400 ml-2">What iPads download</span>
                  </button>
                  {bundleOpen && (
                    <CardContent>
                      {!bundle ? <p className="text-sm text-gray-400">Building…</p> : bundle.error ? (
                        <p className="text-sm text-amber-700">{bundle.error}</p>
                      ) : (
                        <pre className="text-xs bg-gray-900 text-gray-100 rounded-lg p-4 overflow-auto max-h-[480px]">{JSON.stringify(bundle.json, null, 2)}</pre>
                      )}
                    </CardContent>
                  )}
                </Card>
              </>
            )}
          </>
        )}
      </div>

      {(dirty || saveError || savedAt) && data?.settings && !locked && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-white border-t border-gray-200 pl-4 sm:pl-8 pr-20 sm:pr-24 py-3 flex items-center justify-end gap-3 z-30">
          {saveError ? <p className="text-sm text-red-600 mr-auto">{saveError}</p> : dirty ? <p className="text-sm text-gray-500 mr-auto">Unsaved changes</p> : <p className="text-sm text-green-700 mr-auto">Saved. iPads pick it up on their next sync.</p>}
          {dirty && <Button variant="outline" onClick={() => { setForm(toForm(data.settings!)); setSaveError(''); }}>Discard</Button>}
          {dirty && <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>}
        </div>
      )}
    </>
  );
}
