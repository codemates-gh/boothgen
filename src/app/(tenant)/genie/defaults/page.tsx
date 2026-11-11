'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Sparkles, Camera, Share2, Printer, Settings2, LayoutTemplate, ChevronUp, ChevronDown, X } from 'lucide-react';
import { Field, Layout, LayoutPreview } from '@/components/genie/parts';
import { Capture, CaptureFields, Printing, PrintingFields, Section, Sharing, SharingFields, TimeZoneSelect, numbersFilled } from '@/components/genie/SettingsForms';

type LibraryTemplate = { id: string; name: string; scope: 'standard' | 'mine'; layout: Layout | null };
type Defaults = { saved: boolean; timeZone: string; capture: Capture; sharing: Sharing; printing: Printing; templateIds: string[] };
type Form = Omit<Defaults, 'saved'>;

const toForm = ({ saved: _s, ...rest }: Defaults): Form => JSON.parse(JSON.stringify(rest));

export default function GenieDefaultsPage() {
  const [data, setData] = useState<Defaults & { eventsFollowing: number } | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [library, setLibrary] = useState<LibraryTemplate[]>([]);
  const [notEnabled, setNotEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adding, setAdding] = useState('');

  const load = useCallback(async () => {
    const [r, l] = await Promise.all([fetch('/api/genie-defaults'), fetch('/api/genie-templates')]);
    if (r.status === 403) { setNotEnabled(true); return; }
    if (r.ok) { const d = await r.json(); setData(d); setForm(toForm(d)); }
    if (l.ok) { const d = await l.json(); setLibrary([...d.mine, ...d.standard].filter((t: LibraryTemplate) => t.layout)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const dirty = !!(form && data && JSON.stringify(form) !== JSON.stringify(toForm(data)));
  const set = <K extends keyof Form>(key: K, patch: Partial<Form[K]>) => setForm(f => f && ({ ...f, [key]: { ...(f[key] as object), ...patch } }));

  async function save() {
    if (!form) return;
    if (!numbersFilled(form.capture, form.printing)) { setError('Fill in every number before saving.'); return; }
    setSaving(true); setError(''); setNotice('');
    const r = await fetch('/api/genie-defaults', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const d = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) { setError(d.error || 'Could not save'); return; }
    setNotice(d.eventsUpdated ? `Saved. ${d.eventsUpdated} upcoming event${d.eventsUpdated === 1 ? '' : 's'} using these defaults ${d.eventsUpdated === 1 ? 'was' : 'were'} updated.` : 'Saved. New events start from these.');
    load();
  }

  const byId = new Map(library.map(t => [t.id, t]));
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

            <Section icon={LayoutTemplate} title="Templates" description="Added to an event, in this order, when you set up Genie for it. The client's design-brief pick goes first. Later changes here don't change existing events.">
              {form.templateIds.length === 0 ? <p className="text-sm text-gray-500">No default templates.</p> : (
                <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                  {form.templateIds.map((id, i) => {
                    const t = byId.get(id);
                    return (
                      <li key={id} className="flex items-center gap-3 p-3">
                        <span className="text-xs font-semibold text-gray-400 w-4">{i + 1}</span>
                        {t?.layout && <LayoutPreview layout={t.layout} width={t.layout.widthPx >= t.layout.heightPx ? 72 : 36}/>}
                        <span className="text-sm flex-1">{t?.name ?? 'Template no longer in your library'}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ChevronUp className="w-4 h-4"/></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === form.templateIds.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ChevronDown className="w-4 h-4"/></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-[#E2445C] hover:bg-red-50" onClick={() => setForm({ ...form, templateIds: form.templateIds.filter(x => x !== id) })} aria-label="Remove"><X className="w-4 h-4"/></Button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="flex gap-2 max-w-md">
                <Select value={adding} onChange={e => setAdding(e.target.value)}>
                  <option value="">Add a template…</option>
                  {library.filter(t => !form.templateIds.includes(t.id)).map(t => <option key={t.id} value={t.id}>{t.name}{t.scope === 'standard' ? ' (Standard)' : ''}</option>)}
                </Select>
                <Button variant="outline" disabled={!adding} onClick={() => { setForm({ ...form, templateIds: [...form.templateIds, adding] }); setAdding(''); }}>Add</Button>
              </div>
              <p className="text-xs text-gray-400">Make or edit templates in <Link href="/genie/templates" className="text-brand hover:underline">Genie → Templates</Link>.</p>
            </Section>

            <Section icon={Share2} title="Sharing" description="How guests get their photos from the iPad. Texts and emails go through your accounts in Genie → Messaging.">
              <SharingFields value={form.sharing} onChange={p => set('sharing', p)}/>
            </Section>

            <Section icon={Printer} title="Printing">
              <PrintingFields value={form.printing} onChange={p => set('printing', p)}/>
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
