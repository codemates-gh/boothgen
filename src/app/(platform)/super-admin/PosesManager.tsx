'use client';
import { useEffect, useState } from 'react';
import { Pencil, Trash2, Download, Eye, EyeOff, PersonStanding } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { POSE_CATEGORIES, POSE_UPLOAD_HINT, PoseEditModal, PoseReplaceButton, PoseThumb, PoseUploadButton, type Pose, type PoseCategory } from '@/components/genie/Poses';

// Super Admin → Poses: the Standard pose ideas every operator picks from
export default function PosesManager() {
  const [rows, setRows] = useState<Pose[] | null>(null);
  const [cat, setCat] = useState<PoseCategory | ''>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<Pose | null>(null);
  const [removing, setRemoving] = useState<Pose | null>(null);
  const [importing, setImporting] = useState(false);

  async function load() {
    const r = await fetch('/api/super-admin/poses');
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Could not load poses'); return; }
    setRows(d.poses);
  }
  useEffect(() => { load(); }, []);

  async function toggle(p: Pose) {
    setError('');
    const r = await fetch('/api/super-admin/poses/' + p.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !p.isActive }) });
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error || 'Could not change it'); return; }
    const saved: Pose = await r.json();
    setRows(rs => rs && rs.map(x => x.id === p.id ? saved : x));
  }

  async function remove() {
    if (!removing) return;
    const r = await fetch('/api/super-admin/poses/' + removing.id, { method: 'DELETE' });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error || 'Could not delete');
    setRemoving(null);
    load();
  }

  async function importStarter() {
    setImporting(true); setError(''); setNotice('');
    const r = await fetch('/api/super-admin/poses/import', { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    setImporting(false);
    if (!r.ok) setError(d.error || 'The import failed');
    else setNotice(d.poses ? `Added ${d.poses} poses.` : 'Every starter pose is already in the library.');
    load();
  }

  const on = rows?.filter(p => p.isActive).length ?? 0;
  const shown = (rows ?? []).filter(p => !cat || p.category === cat);
  const count = (c: PoseCategory) => (rows ?? []).filter(p => p.category === c).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex-1 space-y-1">
          <p className="text-sm text-gray-500">
            Standard pose ideas operators can show guests. Switching one off hides it from every operator; events that already chose it keep it.
            {rows && <> <span className="font-medium text-gray-700">{on} on</span> · {rows.length - on} off.</>}
          </p>
          <p className="text-xs text-gray-400">{POSE_UPLOAD_HINT}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-start">
          <Button variant="outline" onClick={importStarter} disabled={importing}><Download className="w-4 h-4 mr-1.5"/>{importing ? 'Importing…' : 'Import starter poses'}</Button>
          <PoseUploadButton scope="standard" defaultCategory={cat || 'her'} onDone={() => load()}/>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      <div className="flex flex-wrap gap-2">
        {[{ value: '' as const, label: 'All categories' }, ...POSE_CATEGORIES].map(c => (
          <button key={c.value} onClick={() => setCat(c.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${cat === c.value ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
            {c.label} <span className="opacity-70">{c.value ? count(c.value) : rows?.length ?? 0}</span>
          </button>
        ))}
      </div>

      {!rows ? <p className="text-sm text-gray-400">Loading…</p> : rows.length === 0 ? (
        <Card><CardContent className="text-center py-12 text-gray-500">
          <PersonStanding className="w-10 h-10 mx-auto mb-3 text-gray-300"/>
          <p className="text-sm">No Standard poses yet. Import the starter set (48 poses) or add your own.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {shown.map(p => (
            <Card key={p.id} className={'flex flex-col ' + (p.isActive ? '' : 'opacity-60')}>
              <div className="p-2"><PoseThumb pose={p}/></div>
              <CardContent className="pt-1 pb-3 px-2 flex-1 flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-1">
                  <p className="font-medium text-xs leading-tight">{p.name}</p>
                  {!p.isActive && <Badge variant="default">Off</Badge>}
                </div>
                <p className="text-[10px] text-gray-400">{POSE_CATEGORIES.find(c => c.value === p.category)?.label}{p.category === 'groups' && p.people ? ` · ${p.people}+` : ''} · {p.id}</p>
                <div className="flex flex-wrap gap-1 mt-auto">
                  <Button variant="outline" size="sm" className="px-2" onClick={() => toggle(p)} aria-label={p.isActive ? 'Switch off' : 'Switch on'}>{p.isActive ? <EyeOff className="w-3.5 h-3.5"/> : <Eye className="w-3.5 h-3.5"/>}</Button>
                  <Button variant="outline" size="sm" className="px-2" onClick={() => setEditing(p)} aria-label="Edit"><Pencil className="w-3.5 h-3.5"/></Button>
                  <PoseReplaceButton scope="standard" pose={p} onDone={() => load()}/>
                  <Button variant="ghost" size="sm" className="px-2 text-[#E2445C] hover:bg-red-50" onClick={() => setRemoving(p)} aria-label="Delete"><Trash2 className="w-3.5 h-3.5"/></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PoseEditModal pose={editing} endpoint={id => '/api/super-admin/poses/' + id} onClose={() => setEditing(null)} onSaved={saved => { setEditing(null); setRows(rs => rs && rs.map(x => x.id === saved.id ? saved : x)); }}/>
      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Delete Standard Pose">
        <p className="text-sm text-gray-600 mb-5"><span className="font-medium text-gray-800">{removing?.name}</span> is deleted for good. If an event or an account&apos;s Event defaults use it, it can&apos;t be deleted; switch it off instead.</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
          <Button variant="destructive" onClick={remove}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
