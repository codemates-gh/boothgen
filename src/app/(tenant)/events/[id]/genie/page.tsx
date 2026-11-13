'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Sparkles, Lock, AlertTriangle, Camera, Palette, Share2, Printer, Settings2, Code2, ChevronDown, ChevronRight, Repeat, MonitorPlay, Smile } from 'lucide-react';
import { Field, Toggle, fmtDate, fmtDateTime } from '@/components/genie/parts';
import { Attract, AttractFields, Capture, CaptureFields, DefaultState, Printing, PrintingFields, Section, Sharing, SharingFields, TimeZoneSelect, attractBody, numbersFilled } from '@/components/genie/SettingsForms';
import GenieTemplates, { ApprovedDesign, EventTemplate, templateMismatch } from './GenieTemplates';
import GenieEventDevices from './GenieEventDevices';
import GenieShares from './GenieShares';
import { Boomerang, BoomerangFields, LookAtCamera, LookAtCameraFields } from './CaptureExtras';
import { EventPropsFields, type EventPropsValue } from './EventProps';
import type { Prop } from '@/components/genie/Props';

type Settings = {
  enabled: boolean; timeZone: string; bundleVersion: number; maxDevices: number; capture: Capture;
  filters: { guestFiltersEnabled: boolean; defaultFilterId: string; filterIds: string[]; available: { id: string; name: string }[] };
  sharing: Sharing;
  printing: Printing;
  lookAtCamera: LookAtCamera;
  boomerang: Boomerang;
  attract: Attract;
  props: EventPropsValue;
  custom: { timeZone: boolean; capture: boolean; sharing: boolean; printing: boolean; attract: boolean };
};
type Dashboard = {
  event: { id: string; title: string; eventDate: string; startTime: string | null; endTime: string | null };
  settings: Settings | null; lockedAt: string | null; locksAt: string; templates: EventTemplate[];
  providerWarnings: { channel: 'sms' | 'email'; message: string }[]; photosHiddenAt: string; photosDeletedAt: string; designApprovalPending: boolean;
  approvedDesign: ApprovedDesign | null; briefTemplate: { id: string; name: string } | null;
  defaults: { saved: boolean; timeZone: string };
  chosenProps: Prop[];
};
type Form = Pick<Settings, 'enabled' | 'timeZone' | 'capture' | 'sharing' | 'printing' | 'lookAtCamera' | 'boomerang' | 'attract' | 'props'> & { filters: Omit<Settings['filters'], 'available'> };


function toForm(s: Settings): Form {
  const { available: _a, ...filters } = s.filters;
  return {
    enabled: s.enabled, timeZone: s.timeZone, capture: { ...s.capture }, filters, sharing: { ...s.sharing }, printing: { ...s.printing },
    lookAtCamera: { ...s.lookAtCamera }, boomerang: { ...s.boomerang }, attract: { ...s.attract },
    props: { enabled: s.props.enabled, propIds: [...s.props.propIds] },
  };
}

// The save body: "look at the camera" and Boomerang go only when changed, so saving other sections leaves them out
// of the bundle (Genie's own defaults apply until the operator sets them)
function patchBody(form: Form, saved: Settings) {
  const { lookAtCamera, boomerang, attract, props, ...rest } = form;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const { overlay, ...b } = boomerang;
  return {
    ...rest,
    attract: attractBody(attract),
    ...(same(lookAtCamera, saved.lookAtCamera) ? {} : { lookAtCamera: { ...lookAtCamera, text: lookAtCamera.text.trim() || 'LOOK AT CAMERA' } }),
    ...(same(boomerang, saved.boomerang) ? {} : { boomerang: { ...b, overlayUrl: overlay?.url ?? null } }),
    // Props only when changed (a prop switched off since stays allowed while it's kept)
    ...(same(props, saved.props) ? {} : { props }),
  };
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


  const load = useCallback(async (resetForm = true) => {
    const r = await fetch(`/api/events/${eventId}/genie`);
    if (r.status === 403) { setNotEnabled(true); return; }
    if (r.status === 404) { setNotFound(true); return; }
    if (!r.ok) return;
    const d: Dashboard = await r.json();
    setData(d);
    if (resetForm && d.settings) setForm(toForm(d.settings));
    // Your account's time zone (Genie → Event Defaults), not this browser's
    if (!d.settings) setSetupTz(d.defaults.timeZone);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

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
    if (!numbersFilled(form.capture, form.printing, { frames: form.boomerang.frameCount, attract: form.attract.returnAfterSeconds })) { setSaveError('Fill in every number before saving.'); return; }
    setSaving(true); setSaveError('');
    const r = await fetch(`/api/events/${eventId}/genie`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patchBody(form, data!.settings!)) });
    const d = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) { setSaveError(d.error || 'Could not save'); return; }
    setSavedAt(Date.now());
    setBundle(null);
    load();
  }

  // Puts a section back on the account's Genie defaults
  async function resetSection(section: 'timeZone' | 'capture' | 'sharing' | 'printing' | 'attract', label: string) {
    if (!confirm(`Use your Genie defaults for ${label} on this event? Changes you made here for ${label} are replaced, and it follows your defaults from now on.`)) return;
    setSaveError('');
    const r = await fetch(`/api/events/${eventId}/genie`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reset: [section] }) });
    if (!r.ok) { setSaveError((await r.json().catch(() => ({}))).error || 'Could not reset'); return; }
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

  const mismatched = form && data ? data.templates.filter(t => templateMismatch(t)) : [];

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
                    <p className="text-sm text-gray-500">Starts from your <Link href="/genie/defaults" className="text-brand hover:underline">Genie defaults</Link>. Choose the event&apos;s time zone; you can change everything else after.</p>
                  </div>
                  {setupTz && <TimeZoneSelect value={setupTz} onChange={setSetupTz}/>}
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
                    <Field label="Time zone" hint={<DefaultState custom={data.settings.custom.timeZone} disabled={locked} onReset={() => resetSection('timeZone', 'the time zone')}/>}>
                      <TimeZoneSelect value={form.timeZone} disabled={locked} onChange={tz => setForm({ ...form, timeZone: tz })}/>
                    </Field>
                    <Field label="Bundle version" hint="Goes up when anything iPads download changes.">
                      <p className="text-sm font-medium h-10 flex items-center">v{data.settings.bundleVersion}</p>
                    </Field>
                    <Field label={locked ? 'Locked' : 'Locks'} hint="Changes stop reaching iPads once the event starts.">
                      <p className="text-sm font-medium h-10 flex items-center gap-1.5">{locked && <Lock className="w-3.5 h-3.5"/>}{fmtDateTime(locked ? data.lockedAt : data.locksAt, tz)}</p>
                    </Field>
                  </div>
                </Section>

                <Section icon={Camera} title="Capture" description="What guests go through at the booth."
                  right={<DefaultState custom={data.settings.custom.capture} disabled={locked} onReset={() => resetSection('capture', 'Capture')}/>}>
                  <CaptureFields value={form.capture} disabled={locked} onChange={cap}>
                    {mismatched.length > 0 && (
                      <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0"/>
                        <span>{mismatched.map(t => t.name).join(', ')}: frames skip a photo number, so guests take a photo that never prints. Renumber the frames in the designer.</span>
                      </div>
                    )}
                  </CaptureFields>
                  <div className="border-t pt-4">
                    <LookAtCameraFields value={form.lookAtCamera} disabled={locked} onChange={p => set('lookAtCamera', p)}/>
                  </div>
                </Section>

                <Section icon={MonitorPlay} title="Attract screen" description="What the iPad shows between guests."
                  right={<DefaultState custom={data.settings.custom.attract} disabled={locked} onReset={() => resetSection('attract', 'the attract screen')}/>}>
                  <AttractFields value={form.attract} disabled={locked} onChange={p => set('attract', p)}/>
                </Section>

                <Section icon={Repeat} title="Boomerang" description="A short looping clip guests can choose instead of photos. This event only.">
                  <BoomerangFields value={form.boomerang} disabled={locked} onChange={p => set('boomerang', p)}/>
                </Section>

                <GenieTemplates eventId={eventId} templates={data.templates} shotCount={form.capture.shotCount} locked={locked} onChange={() => { setBundle(null); load(false); }} approvedDesign={data.approvedDesign} briefTemplate={data.briefTemplate}/>

                <Section icon={Smile} title="Props" description="Virtual glasses, hats and more that follow guests' faces. This event only.">
                  <EventPropsFields value={form.props} chosen={data.chosenProps} disabled={locked} onChange={p => set('props', p)}/>
                </Section>

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

                <Section icon={Share2} title="Sharing" description="How guests get their photos from the iPad."
                  right={<DefaultState custom={data.settings.custom.sharing} disabled={locked} onReset={() => resetSection('sharing', 'Sharing')}/>}>
                  {data.providerWarnings.map(w => (
                    <div key={w.channel} className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0"/><span>{w.message} <Link href="/genie/sharing" className="underline whitespace-nowrap">Open Genie → Sharing</Link></span>
                    </div>
                  ))}
                  <SharingFields value={form.sharing} disabled={locked} onChange={p => set('sharing', p)}/>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4">
                    <Field label="Photo links stop working" hint="Follows your gallery expiry setting.">
                      <p className="text-sm font-medium">{fmtDate(data.photosHiddenAt, tz)}</p>
                    </Field>
                    <Field label="Photos deleted" hint="Removed from storage and from the iPads.">
                      <p className="text-sm font-medium">{fmtDate(data.photosDeletedAt, tz)}</p>
                    </Field>
                  </div>
                </Section>

                <Section icon={Printer} title="Printing"
                  right={<DefaultState custom={data.settings.custom.printing} disabled={locked} onReset={() => resetSection('printing', 'Printing')}/>}>
                  <PrintingFields value={form.printing} disabled={locked} onChange={p => set('printing', p)}/>
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
