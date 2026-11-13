'use client';
import { useEffect, useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Plus, Pencil, Trash2, Smile, Sparkles } from 'lucide-react';
import { PropBrowser, PropFormModal, PropOnFace, type Category, type Prop, type PropSaveBody } from '@/components/genie/Props';

// Genie → Props: the account's own props (My props) next to the Standard library. Props are chosen per event.
export default function GeniePropsPage() {
  const [data, setData] = useState<{ categories: Category[]; standard: Prop[]; mine: Prop[] } | null>(null);
  const [notEnabled, setNotEnabled] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Prop | 'new' | null>(null);
  const [removing, setRemoving] = useState<Prop | null>(null);
  const [tab, setTab] = useState<'mine' | 'standard'>('mine');

  async function load() {
    const r = await fetch('/api/genie-props');
    if (r.status === 403) { setNotEnabled(true); return; }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Could not load props'); return; }
    setData(d);
  }
  useEffect(() => { load(); }, []);

  async function save(body: PropSaveBody): Promise<string | null> {
    const isNew = editing === 'new';
    const r = await fetch(isNew ? '/api/genie-props' : '/api/genie-props/' + (editing as Prop).id, { method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) return (await r.json().catch(() => ({}))).error || 'Could not save';
    setTab('mine');
    load();
    return null;
  }

  async function remove() {
    if (!removing) return;
    setError('');
    const r = await fetch('/api/genie-props/' + removing.id, { method: 'DELETE' });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error || 'Could not delete');
    setRemoving(null);
    load();
  }

  const card = (p: Prop, editable: boolean) => (
    <Card key={p.id} className="flex flex-col">
      <div className="bg-gray-50 rounded-t-xl p-2"><PropOnFace prop={p} className="w-full h-28"/></div>
      <CardContent className="pt-2 pb-3 px-3 flex-1 flex flex-col gap-1.5">
        <p className="font-medium text-xs leading-tight">{p.name}</p>
        {editable && (
          <div className="flex gap-1 mt-auto">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditing(p)}><Pencil className="w-3.5 h-3.5 mr-1"/>Edit</Button>
            <Button variant="ghost" size="sm" className="px-2 text-[#E2445C] hover:bg-red-50" onClick={() => setRemoving(p)} aria-label="Delete"><Trash2 className="w-3.5 h-3.5"/></Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <>
      <TopBar title="Props"/>
      <div className="p-4 sm:p-8 space-y-6 max-w-6xl">
        {notEnabled ? (
          <Card><CardContent className="text-center py-12 text-gray-500">
            <Sparkles className="w-10 h-10 mx-auto mb-3 text-gray-300"/>
            <p className="font-medium text-gray-700 mb-1">Genie is an add-on</p>
            <p className="text-sm">Contact support to enable it for your account.</p>
          </CardContent></Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2"><Smile className="w-4 h-4"/>Props</CardTitle>
                  <p className="text-sm text-gray-500 mt-1">Virtual glasses, hats and more that follow every face at the booth and print in the photos. Choose an event&apos;s props on its Genie page.</p>
                </div>
                <Button onClick={() => setEditing('new')} disabled={!data?.categories.length}><Plus className="w-4 h-4 mr-1.5"/>Add My Prop</Button>
              </div>
              <div className="flex gap-1 border-b border-gray-200 -mb-px pt-3">
                {(['mine', 'standard'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)} className={'px-3 py-2 text-sm font-medium border-b-2 ' + (tab === t ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}>
                    {t === 'mine' ? `My props${data ? ` (${data.mine.length})` : ''}` : `Standard${data ? ` (${data.standard.length})` : ''}`}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
              {!data ? <p className="text-sm text-gray-400">Loading…</p> : tab === 'mine' ? (
                <PropBrowser props={data.mine} categories={data.categories} renderCard={p => card(p, true)}
                  empty="You haven't added any props. Upload a transparent PNG and place it on the face."/>
              ) : (
                <PropBrowser props={data.standard} categories={data.categories} renderCard={p => card(p, false)} empty="No Standard props yet."/>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {data && <PropFormModal open={!!editing} onClose={() => setEditing(null)} prop={editing === 'new' ? null : editing} categories={data.categories} scope="mine" onSave={save}/>}

      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Delete Prop">
        <p className="text-sm text-gray-600 mb-5">Delete <span className="font-medium text-gray-800">{removing?.name}</span>? If an event offers it, remove it from that event first.</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
          <Button variant="destructive" onClick={remove}>Delete</Button>
        </div>
      </Modal>
    </>
  );
}
