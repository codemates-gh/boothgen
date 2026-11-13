'use client';
import { useEffect, useState } from 'react';
import { Pencil, Trash2, Download, Eye, EyeOff, Image as ImageIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { BACKDROP_UPLOAD_HINT, BackdropThumb, BackdropUploadButton, type Backdrop } from '@/components/genie/Backdrops';

// Super Admin → Backdrops: the Standard virtual backdrops every operator picks from
export default function BackdropsManager() {
  const [rows, setRows] = useState<Backdrop[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [removing, setRemoving] = useState<Backdrop | null>(null);
  const [importing, setImporting] = useState(false);

  async function load() {
    const r = await fetch('/api/super-admin/backdrops');
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Could not load backdrops'); return; }
    setRows(d.backdrops);
  }
  useEffect(() => { load(); }, []);

  async function patch(b: Backdrop, body: { isActive: boolean } | { name: string }) {
    setError('');
    const r = await fetch('/api/super-admin/backdrops/' + b.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error || 'Could not change it'); return; }
    const saved: Backdrop = await r.json();
    setRows(rs => rs && rs.map(x => x.id === b.id ? saved : x));
  }
  const rename = (b: Backdrop) => { const name = prompt('Rename backdrop', b.name)?.trim(); if (name && name !== b.name) patch(b, { name }); };

  async function remove() {
    if (!removing) return;
    const r = await fetch('/api/super-admin/backdrops/' + removing.id, { method: 'DELETE' });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error || 'Could not delete');
    setRemoving(null);
    load();
  }

  async function importStarter() {
    setImporting(true); setError(''); setNotice('');
    const r = await fetch('/api/super-admin/backdrops/import', { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    setImporting(false);
    if (!r.ok) setError(d.error || 'The import failed');
    else setNotice(d.backdrops ? `Added ${d.backdrops} backdrops.` : 'Every starter backdrop is already in the library.');
    load();
  }

  const saved = (_b: Backdrop, warning?: string) => { setNotice(warning ?? ''); load(); };
  const on = rows?.filter(b => b.isActive).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex-1 space-y-1">
          <p className="text-sm text-gray-500">
            Standard backdrops operators can use for background removal. Switching one off hides it from every operator; events that already chose it keep it.
            {rows && <> <span className="font-medium text-gray-700">{on} on</span> · {rows.length - on} off.</>}
          </p>
          <p className="text-xs text-gray-400">{BACKDROP_UPLOAD_HINT}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-start">
          <Button variant="outline" onClick={importStarter} disabled={importing}><Download className="w-4 h-4 mr-1.5"/>{importing ? 'Importing…' : 'Import starter backdrops'}</Button>
          <BackdropUploadButton scope="standard" onDone={saved}/>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      {!rows ? <p className="text-sm text-gray-400">Loading…</p> : rows.length === 0 ? (
        <Card><CardContent className="text-center py-12 text-gray-500">
          <ImageIcon className="w-10 h-10 mx-auto mb-3 text-gray-300"/>
          <p className="text-sm">No Standard backdrops yet. Import the starter set (8 backdrops) or upload your own.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {rows.map(b => (
            <Card key={b.id} className={'flex flex-col ' + (b.isActive ? '' : 'opacity-60')}>
              <div className="p-2"><BackdropThumb backdrop={b}/></div>
              <CardContent className="pt-1 pb-3 px-3 flex-1 flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-1">
                  <p className="font-medium text-sm leading-tight">{b.name}</p>
                  {!b.isActive && <Badge variant="default">Off</Badge>}
                </div>
                <p className="text-xs text-gray-400">{b.width}×{b.height}</p>
                <div className="flex flex-wrap gap-1 mt-auto">
                  <Button variant="outline" size="sm" onClick={() => patch(b, { isActive: !b.isActive })}>{b.isActive ? <><EyeOff className="w-3.5 h-3.5 mr-1"/>Off</> : <><Eye className="w-3.5 h-3.5 mr-1"/>On</>}</Button>
                  <Button variant="outline" size="sm" className="px-2" onClick={() => rename(b)} aria-label="Rename"><Pencil className="w-3.5 h-3.5"/></Button>
                  <BackdropUploadButton scope="standard" replace={{ id: b.id, name: b.name }} label="Replace" variant="outline" size="sm" onDone={saved}/>
                  <Button variant="ghost" size="sm" className="px-2 text-[#E2445C] hover:bg-red-50" onClick={() => setRemoving(b)} aria-label="Delete"><Trash2 className="w-3.5 h-3.5"/></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Delete Standard Backdrop">
        <p className="text-sm text-gray-600 mb-5"><span className="font-medium text-gray-800">{removing?.name}</span> is deleted for good. If an event uses it, it can&apos;t be deleted; switch it off instead.</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
          <Button variant="destructive" onClick={remove}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
