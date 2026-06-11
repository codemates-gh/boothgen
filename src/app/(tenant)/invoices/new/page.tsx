'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { Suspense } from 'react';

interface LineItem { description: string; quantity: number; unitPrice: string; }

function InvoiceNewForm() {
  const router = useRouter();
  const params = useSearchParams();
  const eventId = params.get('eventId');
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState(eventId || '');
  const [items, setItems] = useState<LineItem[]>([{ description: '', quantity: 1, unitPrice: '' }]);
  const [taxRate, setTaxRate] = useState('0');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentType, setPaymentType] = useState<'full'|'deposit'>('full');
  const [depositPercent, setDepositPercent] = useState('50');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { fetch('/api/events').then(r=>r.json()).then(setEvents); }, []);

  function addItem() { setItems(i => [...i, { description:'', quantity:1, unitPrice:'' }]); }
  function removeItem(idx: number) { setItems(i => i.filter((_,j) => j !== idx)); }
  function updateItem(idx: number, field: keyof LineItem, val: string|number) {
    setItems(prev => prev.map((item, j) => j === idx ? { ...item, [field]: val } : item));
  }

  const subtotal = items.reduce((s, i) => s + (i.quantity * (parseFloat(i.unitPrice) || 0)), 0);
  const taxAmt = subtotal * (parseFloat(taxRate) / 100);
  const total = subtotal + taxAmt;
  const depositAmt = paymentType === 'deposit' ? total * (parseFloat(depositPercent) / 100) : total;

  const fmt = (n: number) => '$' + n.toFixed(2);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEvent) { setError('Please select an event'); return; }
    setLoading(true); setError('');
    const lineItems = items.filter(i => i.description.trim()).map(i => ({
      description: i.description,
      quantity: i.quantity,
      unitCents: Math.round((parseFloat(i.unitPrice)||0)*100),
      totalCents: Math.round(i.quantity * (parseFloat(i.unitPrice)||0) * 100),
    }));
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: selectedEvent, lineItems, taxRatePercent: parseFloat(taxRate)||0, dueDate: dueDate||null, notes: notes||null, paymentType, depositPercent: parseFloat(depositPercent)||100 }),
    });
    const data = await res.json();
    if (res.ok) router.push('/invoices/' + data.id);
    else { setError(data.error || 'Failed'); setLoading(false); }
  }

  return (
    <>
      <TopBar title="New Invoice" />
      <div className="p-8 max-w-3xl space-y-6">
        <form onSubmit={submit} className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Event</CardTitle></CardHeader>
            <CardContent>
              <Select value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}>
                <option value="">— Select Event —</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title} — {ev.client?.firstName} {ev.client?.lastName}</option>)}
              </Select>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><div className="flex items-center justify-between"><CardTitle>Line Items</CardTitle><Button type="button" size="sm" variant="outline" onClick={addItem}><Plus className="w-4 h-4 mr-1"/>Add Item</Button></div></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 uppercase px-1">
                <div className="col-span-6">Description</div><div className="col-span-2">Qty</div><div className="col-span-3">Unit Price</div><div className="col-span-1"></div>
              </div>
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-6"><Input value={item.description} onChange={e => updateItem(i,'description',e.target.value)} placeholder="Description"/></div>
                  <div className="col-span-2"><Input type="number" min="1" value={item.quantity} onChange={e => updateItem(i,'quantity',parseFloat(e.target.value)||1)}/></div>
                  <div className="col-span-3"><Input type="number" step="0.01" min="0" value={item.unitPrice} onChange={e => updateItem(i,'unitPrice',e.target.value)} placeholder="0.00"/></div>
                  <div className="col-span-1">{items.length > 1 && <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>}</div>
                </div>
              ))}
              <div className="border-t pt-4 space-y-1 text-right text-sm">
                <p className="text-gray-500">Subtotal: {fmt(subtotal)}</p>
                <div className="flex items-center justify-end gap-2"><span className="text-gray-500">Tax:</span><Input type="number" step="0.1" min="0" max="100" value={taxRate} onChange={e => setTaxRate(e.target.value)} className="w-20 h-7 text-right text-xs"/><span className="text-gray-400 text-xs">%</span><span className="text-gray-500 w-20 text-right">{fmt(taxAmt)}</span></div>
                <p className="text-xl font-bold">Total: {fmt(total)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Payment Schedule</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                {[['full','Full Payment'],['deposit','Deposit + Balance']].map(([v,l]) => (
                  <label key={v} className={'flex items-center gap-2 cursor-pointer px-4 py-3 rounded-xl border-2 transition-colors ' + (paymentType===v ? 'border-brand bg-brand-surface' : 'border-gray-200')}>
                    <input type="radio" value={v} checked={paymentType===v} onChange={() => setPaymentType(v as any)} className="sr-only"/>
                    <span className="text-sm font-medium">{l}</span>
                  </label>
                ))}
              </div>
              {paymentType === 'deposit' && (
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Deposit Percentage</label>
                    <div className="flex items-center gap-2"><Input type="number" min="1" max="99" value={depositPercent} onChange={e => setDepositPercent(e.target.value)} className="w-24"/><span className="text-sm text-gray-500">% = {fmt(depositAmt)} due now</span></div></div>
                  <div><p className="text-sm font-medium text-gray-700 mb-1">Balance Due</p><p className="text-sm text-gray-600 mt-2">{fmt(total - depositAmt)} — due before event</p></div>
                </div>
              )}
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}/></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full border border-gray-300 rounded-xl p-3 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-brand" placeholder="Payment notes..."/></div>
            </CardContent>
          </Card>
          {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-4 py-3">{error}</p>}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Invoice'}</Button>
          </div>
        </form>
      </div>
    </>
  );
}

export default function InvoiceNewPage() {
  return <Suspense><InvoiceNewForm/></Suspense>;
}
