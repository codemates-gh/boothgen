
'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2 } from 'lucide-react';

type LineItem = { description: string; quantity: number; unitCents: number; totalCents: number; taxable: boolean };

export default function NewInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = searchParams.get('eventId');
  const [loading, setLoading] = useState(false);
  const [clientEmail, setClientEmail] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [retainerPct, setRetainerPct] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([{ description: '', quantity: 1, unitCents: 0, totalCents: 0, taxable: true }]);
  const [eventData, setEventData] = useState<any>(null);

  useEffect(() => { if (eventId) fetch('/api/events/' + eventId).then(r => r.json()).then(d => { setEventData(d); setClientEmail(d.client?.email ?? ''); }); }, [eventId]);

  const updateItem = (i: number, k: string, v: any) => setItems(items.map((it, idx) => { if (idx !== i) return it; const upd = { ...it, [k]: v }; if (k === 'quantity' || k === 'unitCents') upd.totalCents = upd.quantity * upd.unitCents; return upd; }));
  const addItem = () => setItems([...items, { description: '', quantity: 1, unitCents: 0, totalCents: 0, taxable: true }]);
  const removeItem = (i: number) => setItems(items.filter((_,idx) => idx !== i));

  const subtotal = items.reduce((s,it) => s + it.totalCents, 0);
  const taxable = items.filter(i => i.taxable).reduce((s,it) => s + it.totalCents, 0);
  const taxRateBps = Math.round(parseFloat(taxRate || '0') * 100);
  const taxAmt = Math.round(taxable * taxRateBps / 10000);
  const total = subtotal + taxAmt;
  const retainerAmt = retainerPct ? Math.round(total * parseFloat(retainerPct) / 100) : 0;
  const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);

  async function submit() {
    setLoading(true);
    try {
      const res = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientEmail, eventId, dueDate, retainerPercent: retainerPct ? parseInt(retainerPct) : null, retainerAmountCents: retainerAmt || null, taxRateBps, taxAmountCents: taxAmt, subtotalCents: subtotal, totalCents: total, balanceDueCents: total, notes, lineItems: items }) });
      const data = await res.json();
      if (res.ok) router.push('/invoices/' + data.id);
      else alert(data.error ?? 'Failed');
    } finally { setLoading(false); }
  }

  return (
    <>
      <TopBar title="New Invoice" />
      <div className="p-8 max-w-3xl space-y-6">
        {eventData && <div className="bg-brand-surface border border-brand/20 rounded-xl p-4 text-sm"><strong>Event:</strong> {eventData.title} on {new Date(eventData.eventDate).toLocaleDateString()} for {eventData.client?.firstName} {eventData.client?.lastName}</div>}
        <Card>
          <CardHeader><CardTitle>Client &amp; Terms</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Client Email *</label><Input value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@example.com"/></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}/></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Tax Rate (%)</label><Input type="number" step="0.1" value={taxRate} onChange={e => setTaxRate(e.target.value)} placeholder="0"/></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Retainer Required (%)</label><Input type="number" value={retainerPct} onChange={e => setRetainerPct(e.target.value)} placeholder="25"/></div>
            <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label><Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Payment instructions, terms..."/></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div className="flex items-center justify-between"><CardTitle>Line Items</CardTitle><Button variant="outline" size="sm" onClick={addItem}><Plus className="w-4 h-4 mr-1"/>Add Line</Button></div></CardHeader>
          <CardContent className="space-y-3">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5"><label className="block text-xs font-medium text-gray-600 mb-1">Description</label><Input value={it.description} onChange={e => updateItem(i,'description',e.target.value)} placeholder="Photo booth package"/></div>
                <div className="col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Qty</label><Input type="number" value={it.quantity} onChange={e => updateItem(i,'quantity',parseFloat(e.target.value)||0)} min="0"/></div>
                <div className="col-span-3"><label className="block text-xs font-medium text-gray-600 mb-1">Unit Price ($)</label><Input type="number" value={(it.unitCents/100).toFixed(2)} onChange={e => updateItem(i,'unitCents',Math.round(parseFloat(e.target.value||'0')*100))} min="0" step="0.01"/></div>
                <div className="col-span-1 text-sm font-medium text-right pt-6">{fmt(it.totalCents)}</div>
                <div className="col-span-1 pt-6"><Button variant="ghost" size="icon" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></Button></div>
              </div>
            ))}
            <div className="border-t pt-3 mt-4 space-y-1 text-sm text-right">
              <p className="text-gray-500">Subtotal: {fmt(subtotal)}</p>
              {taxRateBps > 0 && <p className="text-gray-500">Tax ({(taxRateBps/100).toFixed(1)}%): {fmt(taxAmt)}</p>}
              <p className="text-lg font-bold text-gray-900">Total: {fmt(total)}</p>
              {retainerAmt > 0 && <p className="text-brand font-semibold">Retainer due: {fmt(retainerAmt)} ({retainerPct}%)</p>}
            </div>
          </CardContent>
        </Card>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button onClick={submit} disabled={loading}>{loading ? 'Creating...' : 'Create Invoice'}</Button>
        </div>
      </div>
    </>
  );
}
