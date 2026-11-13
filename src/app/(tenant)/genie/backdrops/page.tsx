'use client';
import { useEffect, useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Pencil, Trash2, Image as ImageIcon, Sparkles } from 'lucide-react';
import { BACKDROP_UPLOAD_HINT, BackdropThumb, BackdropUploadButton, type Backdrop } from '@/components/genie/Backdrops';

// Genie → Backdrops: the account's own virtual backdrops next to the Standard ones. Chosen per event.
export default function GenieBackdropsPage() {
  const [data, setData] = useState<{ standard: Backdrop[]; mine: Backdrop[] } | null>(null);
  const [notEnabled, setNotEnabled] = useState(false);
  const [tab, setTab] = useState<'mine' | 'standard'>('mine');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [removing, setRemoving] = useState<{ b: Backdrop; inUse?: string } | null>(null);

  async function load() {
    const r = await fetch('/api/genie-backdrops');
    if (r.status === 403) { setNotEnabled(true); return; }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Could not load backdrops'); return; }
    setData(d);
  }
  useEffect(() => { load(); }, []);

  async function rename(b: Backdrop) {
    const name = prompt('Rename backdrop', b.name)?.trim();
    if (!name || name === b.name) return;
    const r = await fetch('/api/genie-backdrops/' + b.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error || 'Could not rename');
    load();
  }

  // First try; an event using it answers with a warning, and the second click confirms
  async function remove() {
    if (!removing) return;
    setError('');
    const r = await fetch('/api/genie-backdrops/' + removing.b.id + (removing.inUse ? '?confirm=1' : ''), { method: 'DELETE' });
    const d = await r.json().catch(() => ({}));
    if (r.status === 409 && d.code === 'in_use') { setRemoving({ ...removing, inUse: d.error }); return; }
    if (!r.ok) setError(d.error || 'Could not delete');
    setRemoving(null);
    load();
  }

  const list = data ? (tab === 'mine' ? data.mine : data.standard) : [];

  return (
    <>
      <TopBar title="Backdrops"/>
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
                  <CardTitle className="flex items-center gap-2"><ImageIcon className="w-4 h-4"/>Backdrops</CardTitle>
                  <p className="text-sm text-gray-500 mt-1">Background removal: the iPad cuts guests out of the real background and puts them on a backdrop, in every photo. Choose an event&apos;s backdrops on its Genie page.</p>
                  <p className="text-xs text-gray-400 mt-1">{BACKDROP_UPLOAD_HINT}</p>
                </div>
                <BackdropUploadButton scope="mine" onDone={(_b, w) => { setNotice(w ?? ''); setTab('mine'); load(); }}/>
              </div>
              <div className="flex gap-1 border-b border-gray-200 -mb-px pt-3">
                {(['mine', 'standard'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)} className={'px-3 py-2 text-sm font-medium border-b-2 ' + (tab === t ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}>
                    {t === 'mine' ? `My backdrops${data ? ` (${data.mine.length})` : ''}` : `Standard${data ? ` (${data.standard.length})` : ''}`}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
              {notice && <p className="text-sm text-amber-700 mb-3">{notice}</p>}
              {!data ? <p className="text-sm text-gray-400">Loading…</p> : list.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">{tab === 'mine' ? "You haven't uploaded any backdrops yet." : 'No Standard backdrops yet.'}</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {list.map(b => (
                    <div key={b.id} className="border border-gray-100 rounded-xl p-2 flex flex-col gap-1.5">
                      <BackdropThumb backdrop={b}/>
                      <p className="text-sm font-medium leading-tight">{b.name}</p>
                      <p className="text-xs text-gray-400">{b.width}×{b.height}</p>
                      {tab === 'mine' && (
                        <div className="flex gap-1 mt-auto">
                          <Button variant="outline" size="sm" className="flex-1" onClick={() => rename(b)}><Pencil className="w-3.5 h-3.5 mr-1"/>Rename</Button>
                          <Button variant="ghost" size="sm" className="px-2 text-[#E2445C] hover:bg-red-50" onClick={() => setRemoving({ b })} aria-label="Delete"><Trash2 className="w-3.5 h-3.5"/></Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Delete Backdrop">
        <p className="text-sm text-gray-600 mb-2">Delete <span className="font-medium text-gray-800">{removing?.b.name}</span>?</p>
        {removing?.inUse && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">{removing.inUse} Delete it anyway?</p>}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
          <Button variant="destructive" onClick={remove}>{removing?.inUse ? 'Delete Anyway' : 'Delete'}</Button>
        </div>
      </Modal>
    </>
  );
}
