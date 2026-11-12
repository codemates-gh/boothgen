'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { AlertTriangle, GripVertical, ChevronUp, ChevronDown, Trash2, Plus, LayoutTemplate, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import { Layout, LayoutPreview } from '@/components/genie/parts';

export type EventTemplate = {
  id: string; name: string; sortOrder: number; libraryTemplateId: string | null; designId: string | null;
  layout: Layout; alternateLayout: Layout | null; frameCount: number; maxShotIndex: number; alternateAvailable: boolean;
};
type LibraryTemplate = { id: string; name: string; description: string | null; scope: 'standard' | 'mine'; layout: Layout; alternateLayout: Layout | null };

const FORMAT_LABEL: Record<string, string> = { '4x6': '4×6', '2x6': '2×6 strip' };
const photos = (l: Layout) => new Set(l.slots.map(s => s.shotIndex)).size;

// The iPad takes as many photos as the chosen template's highest photo number. Frames that skip a number mean
// guests take a photo that never prints.
export function templateMismatch(t: EventTemplate): string | null {
  const taken = t.maxShotIndex + 1;
  if (t.frameCount < taken) return `Frames skip a photo number: guests take ${taken} photos but only ${t.frameCount} print. Renumber the frames in the designer.`;
  return null;
}

export type ApprovedDesign = { id: string; version: number; filename: string; approvedAt: string | null };

export default function GenieTemplates({ eventId, templates, shotCount, locked, onChange, approvedDesign, briefTemplate }: {
  eventId: string; templates: EventTemplate[]; shotCount: number; locked: boolean; onChange: () => void;
  approvedDesign: ApprovedDesign | null; briefTemplate: { id: string; name: string } | null;
}) {
  const onEvent = (libraryId: string) => templates.some(e => e.libraryTemplateId === libraryId);
  const [picking, setPicking] = useState(false);
  const [library, setLibrary] = useState<{ standard: LibraryTemplate[]; mine: LibraryTemplate[] } | null>(null);
  const [tab, setTab] = useState<'standard' | 'mine'>('standard');
  const [withAlternate, setWithAlternate] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [order, setOrder] = useState<string[] | null>(null); // while dragging
  const [removing, setRemoving] = useState<EventTemplate | null>(null);
  const [notice, setNotice] = useState('');

  async function useDesign(t: EventTemplate) {
    setBusy('design-' + t.id); setError(''); setNotice('');
    const r = await fetch(`/api/events/${eventId}/genie/templates/${t.id}/design`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setError(d.error || 'Could not use the approved design'); return; }
    setNotice(`${t.name}: approved design v${approvedDesign?.version} placed ${d.appliedAs === 'overlay' ? 'over' : 'behind'} the photos.${d.warning ? ' ' + d.warning : ''}`);
    onChange();
  }

  const ordered = order ? order.map(id => templates.find(t => t.id === id)!).filter(Boolean) : templates;

  async function openPicker() {
    setPicking(true); setError('');
    if (!library) {
      const r = await fetch('/api/genie-templates');
      if (r.ok) { const d = await r.json(); d.standard = d.standard.filter((t: { hidden?: boolean }) => !t.hidden); setLibrary(d); if (d.standard.length === 0 && d.mine.length > 0) setTab('mine'); }
    }
  }

  async function call(key: string, url: string, init: RequestInit) {
    setBusy(key); setError('');
    const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setError(d.error || 'Something went wrong'); return false; }
    onChange();
    return true;
  }

  async function add(t: LibraryTemplate) {
    const ok = await call('add-' + t.id, `/api/events/${eventId}/genie/templates`, { method: 'POST', body: JSON.stringify({ libraryTemplateId: t.id, alternate: !!withAlternate[t.id] }) });
    if (ok) setPicking(false);
  }

  async function saveOrder(ids: string[]) {
    await call('order', `/api/events/${eventId}/genie/templates`, { method: 'PUT', body: JSON.stringify({ order: ids }) });
    setOrder(null);
  }

  function move(id: string, delta: number) {
    const ids = templates.map(t => t.id);
    const i = ids.indexOf(id), j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    saveOrder(ids);
  }

  function dragOver(overId: string) {
    if (!dragId || dragId === overId) return;
    const ids = [...(order ?? templates.map(t => t.id))];
    const to = ids.indexOf(overId);
    ids.splice(ids.indexOf(dragId), 1);
    ids.splice(to, 0, dragId);
    setOrder(ids);
  }

  function drop() {
    const ids = order;
    setDragId(null);
    if (ids && ids.join() !== templates.map(t => t.id).join()) saveOrder(ids); else setOrder(null);
  }

  const libraryList = library ? library[tab] : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2"><LayoutTemplate className="w-4 h-4"/>Templates</CardTitle>
          {!locked && <Button variant="outline" size="sm" onClick={openPicker}><Plus className="w-3.5 h-3.5 mr-1"/>Add Template</Button>}
        </div>
        <p className="text-sm text-gray-500">Guests choose from these on the iPad, in this order. Drag to reorder.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-green-700">{notice}</p>}
        {templates.length === 0 ? (
          <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0"/>Add at least one template. iPads can&apos;t load this event until it has one.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {ordered.map((t, i) => {
              const mismatch = templateMismatch(t);
              return (
                <li key={t.id}
                  draggable={!locked}
                  onDragStart={() => setDragId(t.id)}
                  onDragOver={e => { e.preventDefault(); dragOver(t.id); }}
                  onDragEnd={drop}
                  className={'flex items-center gap-3 p-3 bg-white ' + (dragId === t.id ? 'opacity-50' : '')}>
                  {!locked && <GripVertical className="w-4 h-4 text-gray-300 cursor-grab flex-shrink-0"/>}
                  <span className="text-xs font-semibold text-gray-400 w-4">{i + 1}</span>
                  <LayoutPreview layout={t.layout} width={t.layout.widthPx >= t.layout.heightPx ? 72 : 36}/>
                  {t.alternateLayout && <LayoutPreview layout={t.alternateLayout} width={t.alternateLayout.widthPx >= t.alternateLayout.heightPx ? 72 : 36}/>}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <p className="text-xs text-gray-500">{FORMAT_LABEL[t.layout.format]} {t.layout.orientation} · {t.frameCount} photo{t.frameCount === 1 ? '' : 's'}{t.alternateLayout ? ' · + ' + t.alternateLayout.orientation : ''}</p>
                    {mismatch && <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5"><AlertTriangle className="w-3 h-3"/>{mismatch}</p>}
                    {approvedDesign && t.designId === approvedDesign.id && <p className="text-xs text-green-700 flex items-center gap-1 mt-0.5"><CheckCircle2 className="w-3 h-3"/>Uses the approved design (v{approvedDesign.version})</p>}
                    {approvedDesign && !locked && t.designId !== approvedDesign.id && (
                      <button className="text-xs text-brand hover:underline mt-0.5 flex items-center gap-1 disabled:opacity-50" disabled={!!busy} onClick={() => useDesign(t)}>
                        <ImageIcon className="w-3 h-3"/>{busy === 'design-' + t.id ? 'Placing…' : t.designId ? `Update to the newer approved design (v${approvedDesign.version})` : `Use approved design (v${approvedDesign.version})`}
                      </button>
                    )}
                  </div>
                  {(t.alternateAvailable || t.alternateLayout) && (
                    <label className={'flex items-center gap-1.5 text-xs text-gray-600 ' + (locked ? 'opacity-50' : 'cursor-pointer')}>
                      <input type="checkbox" className="w-4 h-4 rounded" checked={!!t.alternateLayout} disabled={locked || busy === 'alt-' + t.id}
                        onChange={e => call('alt-' + t.id, `/api/events/${eventId}/genie/templates/${t.id}`, { method: 'PATCH', body: JSON.stringify({ alternate: e.target.checked }) })}/>
                      Alternate orientation
                    </label>
                  )}
                  {!locked && (
                    <div className="flex items-center">
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0 || !!busy} onClick={() => move(t.id, -1)} aria-label="Move up"><ChevronUp className="w-4 h-4"/></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === ordered.length - 1 || !!busy} onClick={() => move(t.id, 1)} aria-label="Move down"><ChevronDown className="w-4 h-4"/></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-[#E2445C] hover:bg-red-50" onClick={() => setRemoving(t)} aria-label="Remove"><Trash2 className="w-4 h-4"/></Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <Modal open={picking} onClose={() => setPicking(false)} title="Add a Template" className="max-w-2xl">
        <div className="flex border-b border-gray-200 mb-4">
          {(['standard', 'mine'] as const).map(k => (
            <button key={k} onClick={() => setTab(k)} className={'px-4 py-2 text-[13px] font-medium border-b-2 -mb-px ' + (tab === k ? 'border-[#0085FF] text-[#1F1F3D]' : 'border-transparent text-[#676879] hover:text-[#1F1F3D]')}>
              {k === 'standard' ? 'Standard' : 'My Templates'}{library ? ` (${library[k].length})` : ''}
            </button>
          ))}
        </div>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        {!library ? <p className="text-sm text-gray-400">Loading…</p> : libraryList.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">
            {tab === 'mine' ? <>You haven&apos;t made any templates yet. <Link href="/templates" className="text-brand hover:underline">Open the template designer</Link>.</> : 'No standard templates yet.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {libraryList.map(t => (
              <div key={t.id} className="border border-gray-200 rounded-lg p-3 flex gap-3">
                <LayoutPreview layout={t.layout} width={t.layout.widthPx >= t.layout.heightPx ? 96 : 40}/>
                <div className="min-w-0 flex-1 flex flex-col">
                  <p className="text-sm font-medium">{t.name}{briefTemplate?.id === t.id && <Badge variant="info" className="ml-2">Client&apos;s pick</Badge>}</p>
                  <p className="text-xs text-gray-500">{FORMAT_LABEL[t.layout.format]} {t.layout.orientation} · {photos(t.layout)} photo{photos(t.layout) === 1 ? '' : 's'}</p>
                  {onEvent(t.id) && <Badge variant="success" className="self-start mt-1">On this event</Badge>}
                  {t.alternateLayout && (
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 mt-2 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 rounded" checked={!!withAlternate[t.id]} onChange={e => setWithAlternate(w => ({ ...w, [t.id]: e.target.checked }))}/>
                      Include {t.alternateLayout.orientation} version
                    </label>
                  )}
                  <Button size="sm" variant={onEvent(t.id) ? 'outline' : 'default'} className="mt-auto self-start" disabled={!!busy} onClick={() => add(t)}>{busy === 'add-' + t.id ? 'Adding…' : onEvent(t.id) ? 'Add again' : 'Add'}</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Remove Template">
        <p className="text-sm text-gray-600 mb-5">Remove <span className="font-medium text-gray-800">{removing?.name}</span> from this event? Guests won&apos;t see it on the iPad after the next sync. The template stays in your library.</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
          <Button variant="destructive" disabled={!!busy} onClick={async () => { if (removing && await call('del', `/api/events/${eventId}/genie/templates/${removing.id}`, { method: 'DELETE' })) setRemoving(null); }}>Remove</Button>
        </div>
      </Modal>
    </Card>
  );
}
