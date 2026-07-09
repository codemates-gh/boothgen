'use client';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import Link from 'next/link';
import { Plus, Edit2, Trash2, Package, Layers } from 'lucide-react';

const TABS = [['branding','Branding'],['packages','Packages'],['billing','Billing'],['team','Team'],['coupons','Coupons'],['embed','Lead Capture'],['checklists','Checklists'],['profile','Profile'],['import','Import']];
const CATS = [['package','Full Package'],['addon','Add-On / Extra'],['product','A La Carte Item'],['discount','Discount']];
const CAT_COLOR: Record<string,string> = { package:'bg-brand-surface text-brand', addon:'bg-blue-50 text-blue-700', product:'bg-purple-50 text-purple-700', discount:'bg-green-50 text-green-700' };
const CAT_DESC: Record<string,string> = {
  package: 'A complete, bundled offering — includes everything needed for the event (hours, setup, features). Clients typically choose one package as their main service.',
  addon: 'Optional enhancements layered on top of a package, such as extra hours, a second booth, a roaming camera, or premium props.',
  product: 'Individual items priced separately so clients can mix and match. Useful for things like digital albums, rush delivery, or photo prints.',
  discount: 'A discount amount or coupon to apply on quotes and invoices.',
};
import { fmtCents } from '@/lib/utils';

type Pkg = { id: string; name: string; description: string | null; priceCents: number; category: string; isActive: boolean };

export default function PackagesPage() {
  const [currency, setCurrency] = useState('usd');
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Pkg | null>(null);
  const [form, setForm] = useState({ name:'', description:'', price:'', category:'package' });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    load();
    fetch('/api/settings/branding').then(r => r.json()).then(d => { if (d?.currency) setCurrency(d.currency); });
  }, []);
  async function load() {
    const r = await fetch('/api/settings/packages');
    setPkgs(await r.json());
  }

  function openCreate() {
    setEditing(null);
    setForm({ name:'', description:'', price:'', category:'package' });
    setShowModal(true);
  }

  function openEdit(p: Pkg) {
    setEditing(p);
    setForm({ name: p.name, description: p.description ?? '', price: (p.priceCents/100).toFixed(2), category: p.category });
    setShowModal(true);
  }

  async function save() {
    setSaving(true);
    const body = { name: form.name, description: form.description || null, priceCents: Math.round(parseFloat(form.price||'0')*100), category: form.category };
    if (editing) {
      await fetch('/api/settings/packages/' + editing.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } else {
      await fetch('/api/settings/packages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }
    await load(); setShowModal(false); setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm('Delete this item?')) return;
    await fetch('/api/settings/packages/' + id, { method: 'DELETE' });
    await load();
  }

  const grouped = CATS.map(([key, label]) => ({ key, label, items: pkgs.filter(p => p.category === key) })).filter(g => g.items.length > 0);

  return (
    <>
      <TopBar title="Settings" />
      <div className="p-4 sm:p-8 max-w-3xl space-y-6">
        <div className="flex flex-wrap border-b border-gray-200 mb-6">
          {TABS.map(([href, label]) => <Link key={href} href={'/settings/' + href} className={'px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ' + (href === 'packages' ? 'border-[#0085FF] text-[#1F1F3D]' : 'border-transparent text-[#676879] hover:text-[#1F1F3D]')}>{label}</Link>)}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">Define packages, add-ons, and a la carte items. These appear as quick-add options when building invoices.</p>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2"/>Add Item</Button>
        </div>

        {pkgs.length === 0 && (
          <Card><CardContent className="text-center py-12 text-gray-400">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-30"/>
            <p className="font-medium mb-1">No packages or products yet</p>
            <p className="text-sm mb-4">Add full packages, add-ons, and a la carte items</p>
            <Button onClick={openCreate}>Add First Item</Button>
          </CardContent></Card>
        )}

        {grouped.map(({ key, label, items }) => (
          <Card key={key}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Layers className="w-4 h-4"/>{label}s</CardTitle>
              {CAT_DESC[key] && <p className="text-xs text-[#676879] mt-0.5 font-normal">{CAT_DESC[key]}</p>}
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px]">
                  <thead><tr className="border-b bg-gray-50 text-xs font-medium text-gray-500 uppercase"><th className="text-left px-6 py-3">Name</th><th className="text-left px-6 py-3">Description</th><th className="text-right px-6 py-3">Price</th><th className="px-6 py-3"></th></tr></thead>
                  <tbody>
                    {items.map(p => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-6 py-3"><p className="font-medium text-sm">{p.name}</p><span className={'text-xs px-2 py-0.5 rounded-full font-medium ' + (CAT_COLOR[p.category] ?? 'bg-gray-100 text-gray-600')}>{CATS.find(c=>c[0]===p.category)?.[1] ?? p.category}</span></td>
                        <td className="px-6 py-3 text-sm text-gray-500">{p.description ?? '—'}</td>
                        <td className="px-6 py-3 text-right font-semibold text-sm">{fmtCents(p.priceCents, currency)}</td>
                        <td className="px-6 py-3">
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(p)}><Edit2 className="w-3 h-3"/></Button>
                            <Button size="sm" variant="ghost" onClick={() => remove(p.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3"/></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader><CardTitle className="text-sm">Contract Templates</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-gray-600 mb-3">Create reusable contract templates with merge tags.</p>
          <Link href="/contracts/templates"><Button variant="outline">Manage Contract Templates →</Button></Link></CardContent>
        </Card>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Item' : 'Add Item'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <Select value={form.category} onChange={e => set('category', e.target.value)}>
              {CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. 4-Hour Deluxe Package"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <Textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="What's included..."/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price ($) *</label>
            <Input type="number" step="0.01" min="0" value={form.price} onChange={e => set('price', e.target.value)} placeholder="1200.00"/>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name.trim() || !form.price}>{saving ? 'Saving...' : editing ? 'Update' : 'Add Item'}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
