'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Camera, Share2, Printer, Settings2, LayoutTemplate, ChevronUp, ChevronDown, X, MonitorPlay, Plus, PersonStanding, Image as ImageIcon } from 'lucide-react';
import { TemplatePicker, thumbWidth, type PickerLibrary } from '@/components/genie/TemplatePicker';
import { Field, LayoutPreview } from '@/components/genie/parts';
import { Attract, AttractFields, Capture, CaptureFields, GalleryDefaults, GalleryFields, Printing, PrintingFields, Section, Sharing, SharingFields, TimeZoneSelect, attractBody, numbersFilled } from '@/components/genie/SettingsForms';
import { PoseIdeasFields, type PoseIdeasValue } from '@/components/genie/PoseIdeas';
import type { Pose } from '@/components/genie/Poses';

type Defaults = { saved: boolean; timeZone: string; capture: Capture; sharing: Sharing; printing: Printing; attract: Attract; poses: PoseIdeasValue; gallery: GalleryDefaults; templateIds: string[] };
type Form = Omit<Defaults, 'saved'>;

// Only the editable settings: the GET also returns read-only extras (templates, eventsFollowing) the PUT rejects
const toForm = (d: Defaults): Form => JSON.parse(JSON.stringify({ timeZone: d.timeZone, capture: d.capture, sharing: d.sharing, printing: d.printing, attract: d.attract, poses: d.poses, gallery: d.gallery, templateIds: d.templateIds }));

export default function GenieDefaultsPage() {
  const [data, setData] = useState<Defaults & { eventsFollowing: number; chosenPoses: Pose[] } | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [library, setLibrary] = useState<PickerLibrary | null>(null);
  const [picking, setPicking] = useState(false);
  const [notEnabled, setNotEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const [r, l] = await Promise.all([fetch('/api/genie-defaults'), fetch('/api/genie-templates')]);
    if (r.status === 403) { setNotEnabled(true); return; }
    if (r.ok) { const d = await r.json(); setData(d); setForm(toForm(d)); }
    if (l.ok) {
      const d = await l.json();
      // Layouts that can go on an event: drawn ones, without the Standard ones this account hid
      const usable = (t: { layout: unknown; hidden?: boolean }) => !!t.layout && !t.hidden;
      setLibrary({ standard: d.standard.filter(usable), mine: d.mine.filter(usable) });
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const dirty = !!(form && data && JSON.stringify(form) !== JSON.stringify(toForm(data)));
  const set = <K extends keyof Form>(key: K, patch: Partial<Form[K]>) => setForm(f => f && ({ ...f, [key]: { ...(f[key] as object), ...patch } }));

  async function save() {
    if (!form) return;
    if (!numbersFilled(form.capture, form.printing, { n: form.attract.returnAfterSeconds })) { setError('Fill in every number before saving.'); return; }
    setSaving(true); setError(''); setNotice('');
    const r = await fetch('/api/genie-defaults', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, attract: attractBody(form.attract) }) });
    const d = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) { setError(d.error || 'Could not save'); return; }
    setNotice(d.eventsUpdated ? `Saved. ${d.eventsUpdated} upcoming event${d.eventsUpdated === 1 ? '' : 's'} using these defaults ${d.eventsUpdated === 1 ? 'was' : 'were'} updated.` : 'Saved. New events start from these.');
    load();
  }

  const byId = new Map([...(library?.mine ?? []), ...(library?.standard ?? [])].map(t => [t.id, t]));
  const move = (i: number, d: number) => setForm(f => {
    if (!f) return f;
    const ids = [...f.templateIds]; const j = i + d;
    if (j < 0 || j >= ids.length) return f;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    return { ...f, templateIds: ids };
  });

  return (
    <>
      <TopBar title="Genie Event Defaults"/>
      <div className="p-4 sm:p-8 space-y-6 max-w-5xl pb-28">
        {notEnabled ? (
          <Card><CardContent className="text-center py-12 text-gray-500">
            <Sparkles className="w-10 h-10 mx-auto mb-3 text-gray-300"/>
            <p className="font-medium text-gray-700 mb-1">Genie is an add-on</p>
            <p className="text-sm">Genie runs your iPad photo booth and texts or emails guests their photos. Contact support to enable it for your account.</p>
          </CardContent></Card>
        ) : !data || !form ? <p className="text-sm text-gray-400">Loading…</p> : (
          <>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold">Event Defaults</h2>
              <p className="text-sm text-gray-500 mt-1">
                New events start with these. An event follows each section until you change it on the event&apos;s Genie page; then that section is custom for that event.
                {data.eventsFollowing > 0 && <> {data.eventsFollowing} event{data.eventsFollowing === 1 ? '' : 's'} currently follow{data.eventsFollowing === 1 ? 's' : ''} at least one section. Events that have started don&apos;t change.</>}
              </p>
            </div>

            <Section icon={Settings2} title="Time zone" description="Your business time zone. New events start in it; change it on an event held somewhere else.">
              <div className="max-w-sm"><TimeZoneSelect value={form.timeZone} onChange={tz => setForm({ ...form, timeZone: tz })}/></div>
            </Section>

            <Section icon={Camera} title="Capture" description="What guests go through at the booth.">
              <CaptureFields value={form.capture} onChange={p => set('capture', p)}/>
            </Section>

            <Section icon={MonitorPlay} title="Attract screen" description="What the iPad shows between guests.">
              <AttractFields value={form.attract} onChange={p => set('attract', p)}/>
            </Section>

            <Section icon={PersonStanding} title="Pose ideas" description="Sample poses for guests who don't know how to pose. Off for new accounts. Events follow this until you change Pose ideas on the event.">
              <PoseIdeasFields value={form.poses} chosen={data?.chosenPoses ?? []} onChange={p => set('poses', p)}/>
            </Section>

            <Section icon={LayoutTemplate} title="Templates" description="Added to an event, in this order, when you set up Genie for it. The client's design-brief pick goes first. Later changes here don't change existing events.">
              {form.templateIds.length === 0 ? <p className="text-sm text-gray-500">No default templates.</p> : (
                <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                  {form.templateIds.map((id, i) => {
                    const t = byId.get(id);
                    return (
                      <li key={id} className="flex items-center gap-3 p-3">
                        <span className="text-xs font-semibold text-gray-400 w-4">{i + 1}</span>
                        {t?.layout && <div className="w-[72px] h-12 flex items-center justify-center"><LayoutPreview layout={t.layout} width={thumbWidth(t.layout, 48, 72)}/></div>}
                        <span className="text-sm flex-1">{t?.name ?? 'Template no longer in your library'}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ChevronUp className="w-4 h-4"/></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === form.templateIds.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ChevronDown className="w-4 h-4"/></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-[#E2445C] hover:bg-red-50" onClick={() => setForm({ ...form, templateIds: form.templateIds.filter(x => x !== id) })} aria-label="Remove"><X className="w-4 h-4"/></Button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div>
                <Button variant="outline" size="sm" onClick={() => setPicking(true)}><Plus className="w-3.5 h-3.5 mr-1"/>Add Template</Button>
              </div>
              <TemplatePicker open={picking} onClose={() => setPicking(false)} library={library}
                isAdded={id => form.templateIds.includes(id)}
                onAdd={t => setForm({ ...form, templateIds: [...form.templateIds, t.id] })}/>
              <p className="text-xs text-gray-400">Make or edit templates in <Link href="/templates" className="text-brand hover:underline">Templates</Link>.</p>
            </Section>

            <Section icon={Share2} title="Sharing" description="How guests get their photos from the iPad. Texts and emails go through your accounts in Genie → Sharing.">
              <SharingFields value={form.sharing} onChange={p => set('sharing', p)}/>
            </Section>

            <Section icon={Printer} title="Printing">
              <PrintingFields value={form.printing} onChange={p => set('printing', p)}/>
            </Section>

            <Section icon={ImageIcon} title="Gallery" description="The event's gallery of photos for your client. Events follow this until you change Gallery on the event.">
              <GalleryFields value={form.gallery} onChange={p => set('gallery', p)}/>
            </Section>
          </>
        )}
      </div>

      {data && form && (dirty || error || notice) && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-white border-t border-gray-200 pl-4 sm:pl-8 pr-20 sm:pr-24 py-3 flex items-center justify-end gap-3 z-30">
          {error ? <p className="text-sm text-red-600 mr-auto">{error}</p> : dirty ? <p className="text-sm text-gray-500 mr-auto">Unsaved changes. Saving also updates upcoming events that follow these defaults.</p> : <p className="text-sm text-green-700 mr-auto">{notice}</p>}
          {dirty && <Button variant="outline" onClick={() => { setForm(toForm(data)); setError(''); }}>Discard</Button>}
          {dirty && <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Defaults'}</Button>}
        </div>
      )}
    </>
  );
}
