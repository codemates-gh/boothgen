'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, CheckCircle2, Pencil, Trash2, ArrowLeft, Sparkles, Lock, AlertTriangle, Camera, Palette, Share2, Printer, Settings2, Code2, ChevronDown, ChevronRight, Repeat, MonitorPlay, Smile, Image as ImageIcon, PersonStanding, Copy, Wand2 } from 'lucide-react';
import { Field, Toggle, fmtDate, fmtDateTime } from '@/components/genie/parts';
import { GalleryFields, type GalleryDefaults } from '@/components/genie/SettingsForms';
import { Attract, AttractFields, Capture, CaptureFields, DefaultState, Printing, PrintingFields, Section, Sharing, SharingFields, TimeZoneSelect, attractBody, numbersFilled } from '@/components/genie/SettingsForms';
import { Modal } from '@/components/ui/modal';
import { fmtCents } from '@/lib/utils';
import { BoothEventModal, localEndDate, localTime } from '@/components/genie/BoothEventModal';
import GenieTemplates, { ApprovedDesign, EventTemplate, templateMismatch } from './GenieTemplates';
import GenieTemplateText from './GenieTemplateText';
import GenieEventDevices from './GenieEventDevices';
import GenieShares from './GenieShares';
import { Boomerang, BoomerangFields, LookAtCamera, LookAtCameraFields } from './CaptureExtras';
import { EventPropsFields, type EventPropsValue } from './EventProps';
import type { Prop } from '@/components/genie/Props';
import { EventBackdropsFields, type EventBackdropsValue } from './EventBackdrops';
import type { Backdrop } from '@/components/genie/Backdrops';
import { PoseIdeasFields, type PoseIdeasValue } from '@/components/genie/PoseIdeas';
import type { Pose } from '@/components/genie/Poses';
import { GLAMOUR_STYLE_URL } from '@/lib/genie/addOns';
import { GeniefiedFields, type AiBoothValue, type GeniefiedInfo } from './Geniefied';
import { SharingStationFields, type SharingStationValue } from './SharingStation';

type Settings = {
  enabled: boolean; timeZone: string; bundleVersion: number; maxDevices: number; capture: Capture;
  filters: { guestFiltersEnabled: boolean; defaultFilterId: string; filterIds: string[]; available: { id: string; name: string }[]; glamourIntensity: number; glamourStyleIntensity: number };
  sharing: Sharing;
  printing: Printing;
  lookAtCamera: LookAtCamera;
  liveView: { mirrorLiveView: boolean; showDesignWhilePosing: boolean };
  boomerang: Boomerang;
  attract: Attract;
  props: EventPropsValue;
  backgroundRemoval: EventBackdropsValue;
  poses: PoseIdeasValue;
  sharingStation: SharingStationValue;
  gallery: GalleryDefaults & { autoPublishedAt: string | null };
  aiBooth: AiBoothValue;
  custom: { timeZone: boolean; capture: boolean; sharing: boolean; printing: boolean; attract: boolean; poses: boolean; gallery: boolean };
};
type Dashboard = {
  geniefied: GeniefiedInfo;
  event: { id: string; title: string; eventDate: string; startTime: string | null; endTime: string | null; venueName: string | null; boothEvent: boolean };
  billing: (
    { paysPerEvent: false } | { paysPerEvent: true; paid: boolean; payments: number; ipadsCovered: number; ipadsPerPayment: number; priceCents: number }
  ) & {
    // sharingPcs > 0 only on 2.112.0 payments, when the Sharing station was a paid add-on; addOns: add-on names
    history: { amountCents: number; status: string; paidAt: string | null; comp: boolean; sharingPcs: number; ipads: number; addOns: string[] }[];
    // Paid add-ons (Glamour Style) in use and not paid, what a checkout charges now, and add-on prices by id
    addOnsDue: { id: string; name: string; cents: number }[]; amountDueCents: number; watermark: boolean; addOnPrices: Record<string, number>;
    // Glamour Style is offered only once Super Admin makes it available (Genie 0.6.0+)
    glamourStyleReady: boolean;
  };
  settings: Settings | null; lockedAt: string | null; hasGuestSessions?: boolean; locksAt: string; expired: boolean; templates: EventTemplate[];
  providerWarnings: { channel: 'sms' | 'email'; message: string }[]; photosHiddenAt: string; photosDeletedAt: string; designApprovalPending: boolean;
  approvedDesign: ApprovedDesign | null; briefTemplate: { id: string; name: string } | null;
  defaults: { saved: boolean; timeZone: string };
  chosenProps: Prop[];
  chosenBackdrops: Backdrop[];
  chosenPoses: Pose[];
};
type Form = Pick<Settings, 'enabled' | 'timeZone' | 'capture' | 'sharing' | 'printing' | 'lookAtCamera' | 'liveView' | 'boomerang' | 'attract' | 'props' | 'backgroundRemoval' | 'poses' | 'sharingStation' | 'gallery' | 'aiBooth'> & { filters: Omit<Settings['filters'], 'available'> };


function toForm(s: Settings): Form {
  const { available: _a, ...filters } = s.filters;
  return {
    enabled: s.enabled, timeZone: s.timeZone, capture: { ...s.capture }, filters, sharing: { ...s.sharing }, printing: { ...s.printing },
    lookAtCamera: { ...s.lookAtCamera }, liveView: { ...s.liveView }, boomerang: { ...s.boomerang }, attract: { ...s.attract },
    props: { enabled: s.props.enabled, propIds: [...s.props.propIds] },
    backgroundRemoval: { ...s.backgroundRemoval, backdropIds: [...s.backgroundRemoval.backdropIds] },
    poses: { enabled: s.poses.enabled, poseIds: [...s.poses.poseIds] },
    sharingStation: { ...s.sharingStation },
    gallery: { ...s.gallery },
    aiBooth: { ...s.aiBooth, themeIds: [...s.aiBooth.themeIds] },
  };
}

// The save body: "look at the camera" and Boomerang go only when changed, so saving other sections leaves them out
// of the bundle (Genie's own defaults apply until the operator sets them)
function patchBody(form: Form, saved: Settings) {
  const { lookAtCamera, boomerang, attract, props, backgroundRemoval, poses, sharingStation, gallery, aiBooth, ...rest } = form;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const { overlay, designProblem: _p, ...b } = boomerang;
  return {
    ...rest,
    attract: attractBody(attract),
    ...(same(lookAtCamera, saved.lookAtCamera) ? {} : { lookAtCamera: { ...lookAtCamera, text: lookAtCamera.text.trim() || 'LOOK AT CAMERA' } }),
    ...(same(boomerang, saved.boomerang) ? {} : { boomerang: { ...b, overlayUrl: overlay?.url ?? null } }),
    // Props only when changed (a prop switched off since stays allowed while it's kept)
    ...(same(props, saved.props) ? {} : { props }),
    ...(same(backgroundRemoval, saved.backgroundRemoval) ? {} : { backgroundRemoval }),
    // Pose ideas only when changed, so saving other sections keeps the event following the Event defaults
    ...(same(poses, saved.poses) ? {} : { poses }),
    ...(same(sharingStation, saved.sharingStation) ? {} : { sharingStation }),
    // Gallery only when changed, so saving other sections keeps the event following the Event defaults
    // Geniefied only when changed
    ...(same(aiBooth, saved.aiBooth) ? {} : { aiBooth }),
    ...(same(gallery, saved.gallery) ? {} : { gallery: { uploadAll: gallery.uploadAll, autoPublish: gallery.autoPublish } }),
  };
}



export default function EventGeniePage() {
  const { id: eventId } = useParams<{ id: string }>();
  const { data: session } = useSession();
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

  // Back from Stripe Checkout (?paid=<session id>): record the payment now rather than waiting for the webhook
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState('');
  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get('paid');
    if (!sessionId) return;
    window.history.replaceState(null, '', window.location.pathname);
    fetch(`/api/genie-events/${eventId}/pay`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) })
      .finally(() => load(false));
  }, [eventId, load]);

  async function pay(moreIpads = false, aiTopUp = false) {
    setPayBusy(true); setPayError('');
    const r = await fetch(`/api/genie-events/${eventId}/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(aiTopUp ? { aiTopUp: true } : moreIpads ? { moreIpads: true } : {}) });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.url) { window.location.href = d.url; return; }
    setPayBusy(false);
    setPayError(d.error || 'Could not start the payment');
  }

  useEffect(() => { if (!savedAt) return; const t = setTimeout(() => setSavedAt(null), 4000); return () => clearTimeout(t); }, [savedAt]);

  const dirty = !!(form && data?.settings && JSON.stringify(form) !== JSON.stringify(toForm(data.settings)));
  // Started: everything can still change and reaches iPads between guests, except the date and times (G, 2026-11-19)
  const started = !!data?.lockedAt;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');

  // A copy with the same Genie setup, starting today with the same times (works on expired events too)
  async function duplicateEvent() {
    setDuplicateError('');
    const r = await fetch(`/api/events/${eventId}/duplicate`, { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setDuplicateError(d.error || 'Could not duplicate the event'); return; }
    setDuplicating(false);
    router.push(`/events/${d.id}/genie`);
  }

  async function deleteEvent() {
    setDeleteBusy(true); setDeleteError('');
    const r = await fetch(`/api/genie-events/${eventId}`, { method: 'DELETE' });
    setDeleteBusy(false);
    if (r.ok) { router.push('/genie/events'); return; }
    setDeleteError((await r.json().catch(() => ({}))).error || 'Could not delete the event');
  }
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
  async function resetSection(section: 'timeZone' | 'capture' | 'sharing' | 'printing' | 'attract' | 'poses' | 'gallery', label: string) {
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
  // Genie-only accounts have no CRM event page or client design approval
  const genieOnly = session?.tenant?.product === 'genie';
  const backToBooth = genieOnly || !!data?.event.boothEvent;

  const mismatched = form && data ? data.templates.filter(t => templateMismatch(t)) : [];

  return (
    <>
      <TopBar title="Genie"/>
      <div className="p-4 sm:p-8 space-y-6 max-w-5xl pb-28">
        {backToBooth
          ? <Link href="/genie/events" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>Back to Events</Link>
          : <Link href={`/events/${eventId}`} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>Back to Event</Link>}

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
                  {data.expired ? <Badge variant="default">Expired</Badge> : started && <Badge variant="info">Started</Badge>}
                </div>
                <p className="text-sm text-gray-500">{fmtDate(data.event.eventDate, 'UTC')}{data.event.boothEvent && data.event.venueName ? ` · ${data.event.venueName}` : ''}{data.settings ? ` · Bundle version ${data.settings.bundleVersion}` : ''}</p>
              </div>
              {data.event.boothEvent && (
                <div className="flex gap-2">
                  {!data.expired && <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil className="w-3.5 h-3.5 mr-1"/>Edit Details</Button>}
                  <Button variant="outline" size="sm" onClick={() => { setDuplicateError(''); setDuplicating(true); }}><Copy className="w-3.5 h-3.5 mr-1"/>Duplicate</Button>
                  <Button variant="ghost" size="sm" onClick={() => { setDeleteError(''); setDeleting(true); }}><Trash2 className="w-3.5 h-3.5 mr-1"/>Delete</Button>
                </div>
              )}
            </div>

            {data.expired && (
              <div className="flex items-start gap-2 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <Lock className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400"/>
                <span>This event is over: iPads stopped running it 48 hours after it ended. You can still see its settings{data.event.boothEvent ? ', and Duplicate makes a copy starting today with the same setup.' : '. Duplicate it from the event page (•••) to run it again, starting today with the same setup.'}</span>
              </div>
            )}

            {data.settings && !data.expired && (data.billing.amountDueCents > 0 ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <span className="flex items-start gap-2 flex-1"><AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0"/>
                  <span>
                    Not paid yet: the booth screen and the photos show a watermark.{' '}
                    {data.billing.paysPerEvent && !data.billing.paid && <>{fmtCents(data.billing.priceCents)} covers this event on up to {data.billing.ipadsPerPayment} iPads, with texts and email. </>}
                    {data.billing.addOnsDue.map(a => <span key={a.id}>{a.name}: {fmtCents(a.cents)} for this event. </span>)}
                    Pay before the event; photos taken before paying keep the watermark. Refundable until the event starts and before any photos are taken.
                  </span>
                </span>
                <Button size="sm" onClick={() => pay()} disabled={payBusy}><CreditCard className="w-3.5 h-3.5 mr-1"/>{payBusy ? 'Opening…' : `Pay ${fmtCents(data.billing.amountDueCents)}`}</Button>
              </div>
            ) : data.billing.paysPerEvent ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <span className="flex items-start gap-2 flex-1"><CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0"/>Paid. Covers up to {data.billing.ipadsCovered} iPads, with texts and email.</span>
                <Button variant="outline" size="sm" onClick={() => pay(true)} disabled={payBusy}>{payBusy ? 'Opening…' : `Add ${data.billing.ipadsPerPayment} iPads (${fmtCents(data.billing.priceCents)})`}</Button>
              </div>
            ) : null)}
            {payError && <p className="text-sm text-red-600">{payError}</p>}
            {data.billing.history.length > 0 && (
              <ul className="text-xs text-gray-500 space-y-0.5 -mt-3">
                {data.billing.history.map((h, i) => (
                  <li key={i} className={h.status !== 'paid' ? 'line-through text-gray-400' : ''}>
                    {h.comp ? 'Covered by BoothGen' : `Paid ${fmtCents(h.amountCents)}`}{h.addOns.length ? (h.ipads ? ` (event + ${h.addOns.join(', ')})` : ` (${h.addOns.join(', ')})`) : ''}{h.sharingPcs ? (h.ipads ? ` (event + Sharing station, ${h.sharingPcs} PC${h.sharingPcs > 1 ? 's' : ''})` : ` (Sharing station, ${h.sharingPcs} PC${h.sharingPcs > 1 ? 's' : ''})`) : ''}{h.paidAt ? ' on ' + fmtDate(h.paidAt) : ''}{h.status === 'refunded' ? (h.comp ? ' (removed)' : ' (refunded)') : h.status === 'disputed' ? ' (disputed)' : ''}
                  </li>
                ))}
              </ul>
            )}

            {data.designApprovalPending && !genieOnly && (
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
                {started && (
                  <div className="flex items-start gap-2 text-sm text-[#0073E6] bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    <Lock className="w-4 h-4 mt-0.5 flex-shrink-0"/>
                    <span>Started {fmtDateTime(data.lockedAt, tz)}. You can still change anything here, and iPads pick it up between guests. Only the date and times can no longer change.</span>
                  </div>
                )}

                <Section icon={Settings2} title="Details">
                  <Toggle checked={form.enabled} onChange={v => setForm({ ...form, enabled: v })} label="Genie on for this event" hint="Off hides the event from your iPads."/>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Field label="Time zone" hint={<DefaultState custom={data.settings.custom.timeZone} onReset={() => resetSection('timeZone', 'the time zone')}/>}>
                      <TimeZoneSelect value={form.timeZone} onChange={tz => setForm({ ...form, timeZone: tz })}/>
                    </Field>
                    <Field label="Bundle version" hint="Goes up when anything iPads download changes.">
                      <p className="text-sm font-medium h-10 flex items-center">v{data.settings.bundleVersion}</p>
                    </Field>
                    <Field label={started ? 'Started' : 'Starts'} hint="Once it starts, the date and times can no longer change.">
                      <p className="text-sm font-medium h-10 flex items-center gap-1.5">{started && <Lock className="w-3.5 h-3.5"/>}{fmtDateTime(started ? data.lockedAt : data.locksAt, tz)}</p>
                    </Field>
                  </div>
                </Section>

                <Section icon={Camera} title="Capture" description="What guests go through at the booth."
                  right={<DefaultState custom={data.settings.custom.capture} onReset={() => resetSection('capture', 'Capture')}/>}>
                  <CaptureFields value={form.capture} onChange={cap}>
                    {mismatched.length > 0 && (
                      <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0"/>
                        <span>{mismatched.map(t => t.name).join(', ')}: frames skip a photo number, so guests take a photo that never prints. Renumber the frames in the designer.</span>
                      </div>
                    )}
                  </CaptureFields>
                  <div className="border-t pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Toggle checked={form.liveView.mirrorLiveView} onChange={v => set('liveView', { mirrorLiveView: v })} label="Mirror the live view"
                      hint="Like a mirror while guests pose. The photos themselves are never mirrored."/>
                    <Toggle checked={form.liveView.showDesignWhilePosing} onChange={v => set('liveView', { showDesignWhilePosing: v })} label="Show the design while guests pose"
                      hint="Where the live view leaves room (a 2x6 strip on an iPad in portrait), the design fills in as each photo is kept."/>
                  </div>
                  <div className="border-t pt-4">
                    <LookAtCameraFields value={form.lookAtCamera} onChange={p => set('lookAtCamera', p)}/>
                  </div>
                </Section>

                <Section icon={MonitorPlay} title="Attract screen" description="What the iPad shows between guests."
                  right={<DefaultState custom={data.settings.custom.attract} onReset={() => resetSection('attract', 'the attract screen')}/>}>
                  <AttractFields value={form.attract} onChange={p => set('attract', p)}/>
                </Section>

                <Section icon={Repeat} title="Boomerang" description="A short looping clip guests can choose instead of photos. This event only.">
                  <BoomerangFields eventId={eventId} value={form.boomerang} onChange={p => set('boomerang', p)}/>
                </Section>

                <GenieTemplates eventId={eventId} templates={data.templates} shotCount={form.capture.shotCount} locked={false} onChange={() => { setBundle(null); load(false); }} approvedDesign={data.approvedDesign} briefTemplate={data.briefTemplate}/>
                <GenieTemplateText eventId={eventId} locked={false} version={data.templates.map(t => t.id + ':' + (t.designId ?? '') + ':' + (t.alternateLayout ? 1 : 0)).join()} onChange={() => setBundle(null)}/>

                <Section icon={ImageIcon} title="Virtual backdrop" description="Background removal: guests on a backdrop instead of the room. This event only.">
                  <EventBackdropsFields value={form.backgroundRemoval} chosen={data.chosenBackdrops} onChange={p => set('backgroundRemoval', p)}/>
                </Section>

                <Section icon={PersonStanding} title="Pose ideas" description="Sample poses for guests who don't know how to pose."
                  right={<DefaultState custom={data.settings.custom.poses} onReset={() => resetSection('poses', 'pose ideas')}/>}>
                  <PoseIdeasFields value={form.poses} chosen={data.chosenPoses} onChange={p => set('poses', p)}/>
                </Section>

                <Section icon={Smile} title="Props" description="Virtual glasses, hats and more that follow guests' faces. This event only.">
                  <EventPropsFields value={form.props} chosen={data.chosenProps} onChange={p => set('props', p)}/>
                </Section>

                <Section icon={Palette} title="Filters" description="Looks guests can pick on the review screen.">
                  <Toggle checked={form.filters.guestFiltersEnabled} onChange={v => set('filters', { guestFiltersEnabled: v })} label="Let guests choose a filter" hint="Off: every photo uses the default filter."/>
                  <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
                    {data.settings.filters.available.filter(f => f.id !== 'glamourStyle' || data.billing.glamourStyleReady || form.filters.filterIds.includes('glamourStyle')).map(f => {
                      const on = form.filters.filterIds.includes(f.id);
                      return (
                        <div key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                          <input type="checkbox" className="w-4 h-4 rounded" checked={on} disabled={(on && form.filters.filterIds.length === 1)}
                            onChange={e => {
                              const ids = e.target.checked ? data.settings!.filters.available.map(a => a.id).filter(id => id === f.id || form.filters.filterIds.includes(id)) : form.filters.filterIds.filter(id => id !== f.id);
                              set('filters', { filterIds: ids, defaultFilterId: ids.includes(form.filters.defaultFilterId) ? form.filters.defaultFilterId : ids[0] });
                            }}/>
                          <span className="text-sm flex-1">
                            {f.name}
                            {f.id === 'glamourStyle' && data.billing.addOnPrices.glamourStyle !== undefined && (
                              <span className="block text-xs text-gray-500">
                                The exclusive filter from our partner <a href={GLAMOUR_STYLE_URL} target="_blank" rel="noopener noreferrer" className="underline">Glamour Style Photo Booth</a>.
                                {' '}Add-on: {fmtCents(data.billing.addOnPrices.glamourStyle)} for this event, paid with the event.
                              </span>
                            )}
                          </span>
                          {(f.id === 'glamour' || f.id === 'glamourStyle') && on && (() => {
                            const key = f.id === 'glamour' ? 'glamourIntensity' : 'glamourStyleIntensity';
                            return (
                              <label className="flex items-center gap-2 text-xs text-gray-600" title="How strong the skin retouching is">
                                Strength
                                <input type="range" min={0.3} max={1} step={0.05} value={form.filters[key]} className="w-28 accent-brand"
                                  onChange={e => set('filters', { [key]: Number(e.target.value) })}/>
                                <span className="w-8 tabular-nums">{Math.round(form.filters[key] * 100)}%</span>
                              </label>
                            );
                          })()}
                          <label className={'flex items-center gap-1.5 text-xs ' + (on ? 'text-gray-600 cursor-pointer' : 'text-gray-300')}>
                            <input type="radio" name="defaultFilter" checked={form.filters.defaultFilterId === f.id} disabled={!on} onChange={() => set('filters', { defaultFilterId: f.id })}/>
                            Default
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </Section>

                <Section icon={Share2} title="Sharing" description="How guests get their photos from the iPad."
                  right={<DefaultState custom={data.settings.custom.sharing} onReset={() => resetSection('sharing', 'Sharing')}/>}>
                  {data.providerWarnings.map(w => (
                    <div key={w.channel} className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0"/><span>{w.message} <Link href="/genie/sharing" className="underline whitespace-nowrap">Open Genie → Sharing</Link></span>
                    </div>
                  ))}
                  <SharingFields value={form.sharing} onChange={p => set('sharing', p)}/>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4">
                    <Field label="Photo links stop working" hint="Follows your gallery expiry setting.">
                      <p className="text-sm font-medium">{fmtDate(data.photosHiddenAt, tz)}</p>
                    </Field>
                    <Field label="Photos deleted" hint="Removed from storage and from the iPads.">
                      <p className="text-sm font-medium">{fmtDate(data.photosDeletedAt, tz)}</p>
                    </Field>
                  </div>
                  <div className="border-t pt-4">
                    <SharingStationFields value={form.sharingStation} onChange={p => set('sharingStation', p)}/>
                  </div>
                </Section>

                {(data.geniefied.available || form.aiBooth.enabled) && (
                  <Section icon={Wand2} title="Geniefied" description="The AI photo booth: guests restyle their photos in themes you choose. This event only.">
                    <GeniefiedFields value={form.aiBooth} info={data.geniefied} priceCents={data.billing.addOnPrices.geniefied ?? 0}
                      onChange={p => set('aiBooth', p)} onTopUp={() => pay(false, true)} topUpBusy={payBusy}/>
                  </Section>
                )}

                <Section icon={ImageIcon} title="Gallery" description="The event's gallery of photos for your client."
                  right={<DefaultState custom={data.settings.custom.gallery} onReset={() => resetSection('gallery', 'Gallery')}/>}>
                  <GalleryFields value={form.gallery} onChange={p => set('gallery', p)}/>
                  {data.settings.gallery.autoPublishedAt && <p className="text-xs text-gray-500">Published automatically on {fmtDateTime(data.settings.gallery.autoPublishedAt, tz)}.</p>}
                </Section>

                <Section icon={Printer} title="Printing"
                  right={<DefaultState custom={data.settings.custom.printing} onReset={() => resetSection('printing', 'Printing')}/>}>
                  <PrintingFields value={form.printing} onChange={p => set('printing', p)}/>
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

      {(dirty || saveError || savedAt) && data?.settings && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-white border-t border-gray-200 pl-4 sm:pl-8 pr-20 sm:pr-24 py-3 flex items-center justify-end gap-3 z-30">
          {saveError ? <p className="text-sm text-red-600 mr-auto">{saveError}</p> : dirty ? <p className="text-sm text-gray-500 mr-auto">Unsaved changes</p> : <p className="text-sm text-green-700 mr-auto">Saved. iPads pick it up on their next sync.</p>}
          {dirty && <Button variant="outline" onClick={() => { setForm(toForm(data.settings!)); setSaveError(''); }}>Discard</Button>}
          {dirty && <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>}
        </div>
      )}

      {data?.event.boothEvent && (
        <BoothEventModal open={editing} onClose={() => setEditing(false)} eventId={eventId} lockedTimes={started && data?.hasGuestSessions !== false}
          initial={{
            title: data.event.title, date: data.event.eventDate.slice(0, 10),
            startTime: localTime(data.event.startTime, tz ?? 'UTC'), endTime: localTime(data.event.endTime, tz ?? 'UTC'),
            endDate: localEndDate(data.event.endTime, data.event.eventDate.slice(0, 10), tz ?? 'UTC'),
            venueName: data.event.venueName ?? '', timeZone: tz ?? 'UTC',
          }}
          onSaved={() => { setEditing(false); load(); }}/>
      )}

      <Modal open={duplicating} onClose={() => setDuplicating(false)} title="Duplicate Event">
        <p className="text-sm text-gray-600 mb-2">Makes a new booth event starting today, with the same times, venue and Genie setup (settings and templates). iPads, payments and photos aren&apos;t copied. Change its date with Edit Details.</p>
        {duplicateError && <p className="text-sm text-red-600 mb-2">{duplicateError}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setDuplicating(false)}>Cancel</Button>
          <Button onClick={duplicateEvent}>Duplicate</Button>
        </div>
      </Modal>

      <Modal open={deleting} onClose={() => setDeleting(false)} title="Delete Event">
        <p className="text-sm text-gray-600 mb-5">Delete <span className="font-medium text-gray-800">{data?.event.title}</span> and its booth setup? This can&apos;t be undone. Events with guest photos can&apos;t be deleted.</p>
        {deleteError && <p className="text-sm text-red-600 mb-3">{deleteError}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleting(false)}>Cancel</Button>
          <Button variant="destructive" disabled={deleteBusy} onClick={deleteEvent}>{deleteBusy ? 'Deleting…' : 'Delete Event'}</Button>
        </div>
      </Modal>
    </>
  );
}
