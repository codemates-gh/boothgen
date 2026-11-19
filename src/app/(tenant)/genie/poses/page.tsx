'use client';
import { useEffect, useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Pencil, Trash2, PersonStanding, Sparkles } from 'lucide-react';
import { POSE_CATEGORIES, POSE_CONSENT, POSE_UPLOAD_HINT, PoseEditModal, PoseThumb, PoseUploadButton, type Pose } from '@/components/genie/Poses';

// Genie → Poses: the account's own pose ideas next to the Standard ones. Chosen in Event defaults or per event.
export default function GeniePosesPage() {
  const [data, setData] = useState<{ standard: Pose[]; mine: Pose[] } | null>(null);
  const [notEnabled, setNotEnabled] = useState(false);
  const [tab, setTab] = useState<'mine' | 'standard'>('mine');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Pose | null>(null);
  const [removing, setRemoving] = useState<{ p: Pose; inUse?: string } | null>(null);

  async function load() {
    const r = await fetch('/api/genie-poses');
    if (r.status === 403) { setNotEnabled(true); return; }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Could not load poses'); return; }
    setData(d);
  }
  useEffect(() => { load(); }, []);

  // First try; one in use answers with a warning, and the second click confirms
  async function remove() {
    if (!removing) return;
    setError('');
    const r = await fetch('/api/genie-poses/' + removing.p.id + (removing.inUse ? '?confirm=1' : ''), { method: 'DELETE' });
    const d = await r.json().catch(() => ({}));
    if (r.status === 409 && d.code === 'in_use') { setRemoving({ ...removing, inUse: d.error }); return; }
    if (!r.ok) setError(d.error || 'Could not delete');
    setRemoving(null);
    load();
  }

  const list = data ? (tab === 'mine' ? data.mine : data.standard) : [];

  return (
    <>
      <TopBar title="Poses"/>
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
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2"><PersonStanding className="w-4 h-4"/>Poses</CardTitle>
                  <p className="text-sm text-gray-500 mt-1">Pose ideas for guests who don&apos;t know how to pose. Turn them on and choose which ones in Genie → Event Defaults, or on an event&apos;s Genie page.</p>
                  <p className="text-xs text-gray-400 mt-1">{POSE_UPLOAD_HINT} {POSE_CONSENT}</p>
                </div>
                <PoseUploadButton scope="mine" onDone={() => { setTab('mine'); load(); }}/>
              </div>
              <div className="flex gap-1 border-b border-gray-200 -mb-px pt-3">
                {(['mine', 'standard'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)} className={'px-3 py-2 text-sm font-medium border-b-2 ' + (tab === t ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}>
                    {t === 'mine' ? `My poses${data ? ` (${data.mine.length})` : ''}` : `Standard${data ? ` (${data.standard.length})` : ''}`}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {error && <p className="text-sm text-red-600">{error}</p>}
              {!data ? <p className="text-sm text-gray-400">Loading…</p> : list.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">{tab === 'mine' ? "You haven't added any poses yet." : 'No Standard poses yet.'}</p>
              ) : POSE_CATEGORIES.map(c => {
                const inCat = list.filter(p => p.category === c.value);
                if (!inCat.length) return null;
                return (
                  <div key={c.value} className="space-y-2">
                    <p className="text-sm font-semibold text-gray-800">{c.label} <span className="text-xs font-normal text-gray-400">{c.hint} · {inCat.length}</span></p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                      {inCat.map(p => (
                        <div key={p.id} className="border border-gray-100 rounded-xl p-2 flex flex-col gap-1.5">
                          <PoseThumb pose={p}/>
                          <p className="text-xs font-medium leading-tight">{p.name}</p>
                          {c.value === 'groups' && p.people && <p className="text-[10px] text-gray-400">{p.people}+ people</p>}
                          {tab === 'mine' && (
                            <div className="flex gap-1 mt-auto">
                              <Button variant="outline" size="sm" className="flex-1 px-1" onClick={() => setEditing(p)}><Pencil className="w-3.5 h-3.5 mr-1"/>Edit</Button>
                              <Button variant="ghost" size="sm" className="px-2 text-[#E2445C] hover:bg-red-50" onClick={() => setRemoving({ p })} aria-label="Delete"><Trash2 className="w-3.5 h-3.5"/></Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>

      <PoseEditModal pose={editing} endpoint={id => '/api/genie-poses/' + id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }}/>
      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Delete Pose">
        <p className="text-sm text-gray-600 mb-2">Delete <span className="font-medium text-gray-800">{removing?.p.name}</span>?</p>
        {removing?.inUse && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">{removing.inUse} Delete it anyway?</p>}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
          <Button variant="destructive" onClick={remove}>{removing?.inUse ? 'Delete Anyway' : 'Delete'}</Button>
        </div>
      </Modal>
    </>
  );
}
