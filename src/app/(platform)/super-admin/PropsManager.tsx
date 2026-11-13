'use client';
import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Download, FolderTree, Eye, EyeOff, Smile } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PropBrowser, PropFormModal, PropOnFace, type Category, type Prop, type PropSaveBody } from '@/components/genie/Props';

// Super Admin → Props: the Standard props library every operator picks from
export default function PropsManager() {
  const [props, setProps] = useState<Prop[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Prop | 'new' | null>(null);
  const [removing, setRemoving] = useState<Prop | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [catsOpen, setCatsOpen] = useState(false);

  async function load() {
    const r = await fetch('/api/super-admin/props');
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Could not load props'); return; }
    setProps(d.props); setCategories(d.categories);
  }
  useEffect(() => { load(); }, []);

  async function setActive(p: Prop, isActive: boolean) {
    setError('');
    const r = await fetch('/api/super-admin/props/' + p.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive }) });
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error || 'Could not change it'); return; }
    setProps(ps => ps && ps.map(x => x.id === p.id ? { ...x, isActive } : x));
  }

  async function save(body: PropSaveBody): Promise<string | null> {
    const isNew = editing === 'new';
    const r = await fetch(isNew ? '/api/super-admin/props' : '/api/super-admin/props/' + (editing as Prop).id, { method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) return (await r.json().catch(() => ({}))).error || 'Could not save';
    load();
    return null;
  }

  async function remove() {
    if (!removing) return;
    const r = await fetch('/api/super-admin/props/' + removing.id, { method: 'DELETE' });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error || 'Could not delete');
    setRemoving(null);
    load();
  }

  async function importStarter() {
    setImporting(true); setError(''); setNotice('');
    const r = await fetch('/api/super-admin/props/import', { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    setImporting(false);
    if (!r.ok) { setError(d.error || 'The import failed'); load(); return; }
    setNotice(d.props || d.categories ? `Added ${d.props} props and ${d.categories} categories.` : 'Every starter prop is already in the library.');
    load();
  }

  const on = props?.filter(p => p.isActive).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-sm text-gray-500 flex-1">
          Standard props operators can add to their events. Switching one off hides it from every operator; events that already chose it keep it.
          {props && <> <span className="font-medium text-gray-700">{on} on</span> · {props.length - on} off.</>}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setCatsOpen(true)}><FolderTree className="w-4 h-4 mr-1.5"/>Categories</Button>
          <Button variant="outline" onClick={importStarter} disabled={importing}><Download className="w-4 h-4 mr-1.5"/>{importing ? 'Importing… (about a minute)' : 'Import starter props'}</Button>
          <Button onClick={() => setEditing('new')} disabled={!categories.length} title={categories.length ? undefined : 'Add a category first'}><Plus className="w-4 h-4 mr-1.5"/>Add Prop</Button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      {!props ? <p className="text-sm text-gray-400">Loading…</p> : props.length === 0 ? (
        <Card><CardContent className="text-center py-12 text-gray-500">
          <Smile className="w-10 h-10 mx-auto mb-3 text-gray-300"/>
          <p className="text-sm">No Standard props yet. Import the starter library (189 props in 6 categories) or add your own.</p>
        </CardContent></Card>
      ) : (
        <PropBrowser props={props} categories={categories} renderCard={p => (
          <Card key={p.id} className={'flex flex-col ' + (p.isActive ? '' : 'opacity-60')}>
            <div className="bg-gray-50 rounded-t-xl p-2"><PropOnFace prop={p} className="w-full h-28"/></div>
            <CardContent className="pt-2 pb-3 px-3 flex-1 flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-1">
                <p className="font-medium text-xs leading-tight">{p.name}</p>
                {!p.isActive && <Badge variant="default">Off</Badge>}
              </div>
              <div className="flex gap-1 mt-auto">
                <Button variant="outline" size="sm" className="flex-1 px-1" onClick={() => setActive(p, !p.isActive)} title={p.isActive ? 'Hide from operators' : 'Offer to operators'}>
                  {p.isActive ? <><EyeOff className="w-3.5 h-3.5 mr-1"/>Off</> : <><Eye className="w-3.5 h-3.5 mr-1"/>On</>}
                </Button>
                <Button variant="outline" size="sm" className="px-2" onClick={() => setEditing(p)} aria-label="Edit"><Pencil className="w-3.5 h-3.5"/></Button>
                <Button variant="ghost" size="sm" className="px-2 text-[#E2445C] hover:bg-red-50" onClick={() => setRemoving(p)} aria-label="Delete"><Trash2 className="w-3.5 h-3.5"/></Button>
              </div>
            </CardContent>
          </Card>
        )}/>
      )}

      <PropFormModal open={!!editing} onClose={() => setEditing(null)} prop={editing === 'new' ? null : editing} categories={categories} scope="standard" onSave={save} allowAlsoIn/>

      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Delete Standard Prop">
        <p className="text-sm text-gray-600 mb-5">
          <span className="font-medium text-gray-800">{removing?.name}</span> is deleted for good. If an event uses it, it can&apos;t be deleted; switch it off instead.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
          <Button variant="destructive" onClick={remove}>Delete</Button>
        </div>
      </Modal>

      <CategoriesModal open={catsOpen} onClose={() => setCatsOpen(false)} categories={categories} onChange={load}/>
    </div>
  );
}

function CategoriesModal({ open, onClose, categories, onChange }: { open: boolean; onClose: () => void; categories: Category[]; onChange: () => void }) {
  const [error, setError] = useState('');
  const [newName, setNewName] = useState<Record<string, string>>({});

  async function call(url: string, method: string, body?: unknown) {
    setError('');
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error || 'Could not save'); return false; }
    onChange();
    return true;
  }
  const add = async (parentId: string | null) => {
    const key = parentId ?? '';
    const name = (newName[key] ?? '').trim();
    if (!name) return;
    if (await call('/api/super-admin/prop-categories', 'POST', { name, parentId })) setNewName(n => ({ ...n, [key]: '' }));
  };
  const rename = (c: { id: string; name: string }) => {
    const name = prompt('Rename', c.name)?.trim();
    if (name && name !== c.name) call('/api/super-admin/prop-categories/' + c.id, 'PATCH', { name });
  };
  const remove = (c: { id: string; name: string }) => { if (confirm(`Delete ${c.name}? Only empty ones can be deleted.`)) call('/api/super-admin/prop-categories/' + c.id, 'DELETE'); };

  const addRow = (parentId: string | null, placeholder: string) => (
    <div className="flex gap-2">
      <Input value={newName[parentId ?? ''] ?? ''} placeholder={placeholder} maxLength={60}
        onChange={e => setNewName(n => ({ ...n, [parentId ?? '']: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') add(parentId); }}/>
      <Button variant="outline" onClick={() => add(parentId)}><Plus className="w-4 h-4"/></Button>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title="Prop Categories" className="max-w-xl">
      <div className="space-y-4">
        <p className="text-xs text-gray-500">For organising and browsing only; guests never see categories. Renaming keeps each prop where it is.</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {categories.map(c => (
          <div key={c.id} className="border border-gray-100 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm flex-1">{c.name}</p>
              <Button variant="ghost" size="sm" onClick={() => rename(c)} aria-label="Rename"><Pencil className="w-3.5 h-3.5"/></Button>
              <Button variant="ghost" size="sm" className="text-[#E2445C] hover:bg-red-50" onClick={() => remove(c)} aria-label="Delete"><Trash2 className="w-3.5 h-3.5"/></Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {c.subcategories.map(s => (
                <span key={s.id} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-xs border border-gray-200 text-gray-600">
                  <button onClick={() => rename(s)} className="hover:underline">{s.name}</button>
                  <button onClick={() => remove(s)} className="text-gray-400 hover:text-red-600" aria-label={'Delete ' + s.name}><Trash2 className="w-3 h-3"/></button>
                </span>
              ))}
            </div>
            {addRow(c.id, 'New sub-category')}
          </div>
        ))}
        {addRow(null, 'New category')}
      </div>
    </Modal>
  );
}
