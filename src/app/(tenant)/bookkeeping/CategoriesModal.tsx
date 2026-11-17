'use client';
// Bookkeeping → ⚙ → Categories: add, rename and hide income and expense categories
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff, Check } from 'lucide-react';
import type { Category } from './shared';

export default function CategoriesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cats, setCats] = useState<Category[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState({ INCOME: '', EXPENSE: '' });
  const [error, setError] = useState('');

  async function load() {
    const r = await fetch('/api/bookkeeping/categories');
    if (r.ok) { const c: Category[] = await r.json(); setCats(c); setNames(Object.fromEntries(c.map(x => [x.id, x.name]))); }
  }
  useEffect(() => { if (open) load(); }, [open]);

  async function patch(id: string, body: object) {
    setError('');
    const r = await fetch('/api/bookkeeping/categories/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? 'Could not save');
    await load();
  }
  async function add(type: 'INCOME' | 'EXPENSE') {
    const name = adding[type].trim();
    if (!name) return;
    setError('');
    const r = await fetch('/api/bookkeeping/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, type }) });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? 'Could not add');
    setAdding(a => ({ ...a, [type]: '' }));
    await load();
  }

  return (
    <Modal open={open} onClose={onClose} title="Categories">
      <div className="space-y-6">
        <p className="text-sm text-gray-500">Hidden categories stay on past transactions but aren&apos;t offered for new ones.</p>
        {(['INCOME', 'EXPENSE'] as const).map(type => (
          <div key={type}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{type === 'INCOME' ? 'Income' : 'Expenses'}</p>
            <ul className="space-y-1.5">
              {cats.filter(c => c.type === type).map(c => (
                <li key={c.id} className="flex items-center gap-2">
                  <Input className={'h-9 ' + (c.hidden ? 'text-gray-400' : '')} value={names[c.id] ?? ''} onChange={e => setNames(n => ({ ...n, [c.id]: e.target.value }))} />
                  {names[c.id] !== c.name && names[c.id]?.trim() && (
                    <button onClick={() => patch(c.id, { name: names[c.id].trim() })} className="text-green-600 hover:text-green-700" aria-label="Save name"><Check className="w-4 h-4" /></button>
                  )}
                  <span className="w-10 text-right text-xs text-gray-400 tabular-nums" title="Transactions">{c._count?.transactions ?? 0}</span>
                  <button onClick={() => patch(c.id, { hidden: !c.hidden })} className="text-gray-400 hover:text-gray-700" aria-label={c.hidden ? 'Show' : 'Hide'} title={c.hidden ? 'Show' : 'Hide'}>
                    {c.hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </li>
              ))}
            </ul>
            <form className="flex gap-2 mt-2" onSubmit={e => { e.preventDefault(); add(type); }}>
              <Input className="h-9" placeholder={type === 'INCOME' ? 'New income category' : 'New expense category'} value={adding[type]} onChange={e => setAdding(a => ({ ...a, [type]: e.target.value }))} />
              <Button type="submit" variant="outline" size="sm">Add</Button>
            </form>
          </div>
        ))}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
      </div>
    </Modal>
  );
}
