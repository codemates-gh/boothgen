'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import { Suspense } from 'react';

interface LineItem { description: string; quantity: number; unitPrice: string; }

function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function daysBetween(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function InvoiceNewForm() {
  const router = useRouter();
  const params = useSearchParams();
  const eventId = params.get('eventId');

  const [events, setEvents] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState(eventId || '');
  const [items, setItems] = useState<LineItem[]>([{ description: '', quantity: 1, unitPrice: '' }]);
  const [taxRate, setTaxRate] = useState('0');
  const [dueDate, setDueDate] = useState('');           // full payment due date
  const [depositDueDate, setDepositDueDate] = useState('');
  const [balanceDueDate, setBalanceDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentType, setPaymentType] = useState<'full'|'deposit'>('full');
  const [depositPercent, setDepositPercent] = useState('50');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Payment term defaults from settings
  const [defaultDepositPct, setDefaultDepositPct] = useState(50);
  const [balanceDueDays, setBalanceDueDays] = useState(30);
  const [fullPaymentDays, setFullPaymentDays] = useState(14);
  const [forceFullPayment, setForceFullPayment] = useState(false);

  // Load payment term defaults
  useEffect(() => {
    fetch('/api/settings/branding')
      .then(r => r.json())
      .then(d => {
        const dep = d.defaultDepositPercent ?? 50;
        const bal = d.balanceDueDaysBeforeEvent ?? 30;
        const full = d.fullPaymentIfWithinDays ?? 14;
        setDefaultDepositPct(dep);
        setBalanceDueDays(bal);
        setFullPaymentDays(full);
        setDepositPercent(String(dep));
      });
  }, []);

  useEffect(() => {
    fetch('/api/events').then(r=>r.json()).then(setEvents);
    fetch('/api/settings/packages').then(r=>r.json()).then(setPackages);
  }, []);

  // When event selection changes, auto-calculate dates and check full-payment window
  useEffect(() => {
    if (!selectedEventId) { setForceFullPayment(false); return; }
    const ev = events.find(e => e.id === selectedEventId);
    if (!ev?.date) { setForceFullPayment(false); return; }

    const eventDate = new Date(ev.date);
    const today = new Date();
    today.setHours(0,0,0,0);
    const daysUntilEvent = daysBetween(eventDate, today);

    if (daysUntilEvent <= fullPaymentDays) {
      // Event is too soon — require full payment
      setForceFullPayment(true);
      setPaymentType('full');
      setDueDate(eventDate.toISOString().split('T')[0]);
    } else {
      setForceFullPayment(false);
      // Auto-fill deposit due (today) and balance due (event - balanceDueDays)
      setDepositDueDate(today.toISOString().split('T')[0]);
      setBalanceDueDate(addDays(eventDate, -balanceDueDays));
    }
  }, [selectedEventId, events, fullPaymentDays, balanceDueDays]);

  function addFromPackage(pkg: any) {
    setItems(prev => [...prev.filter(i => i.description.trim() || i.unitPrice), {
      description: pkg.name + (pkg.description ? ' — ' + pkg.description : ''),
      quantity: 1,
      unitPrice: (pkg.priceCents / 100).toFixed(2),
    }]);
  }

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
    if (!selectedEventId) { setError('Please select an event'); return; }
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
      body: JSON.stringify({
        eventId: selectedEventId,
        lineItems,
        taxRatePercent: parseFloat(taxRate)||0,
        dueDate: paymentType === 'full' ? (dueDate||null) : null,
        depositDueDate: paymentType === 'deposit' ? (depositDueDate||null) : null,
        balanceDueDate: paymentType === 'deposit' ? (balanceDueDate||null) : null,
        notes: notes||null,
        paymentType,
        depositPercent: parseFloat(depositPercent)||100,
      }),
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
              <Select value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)}>
                <option value="">— Select Event —</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title} — {ev.client?.firstName} {ev.client?.lastName}</option>)}
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div className="flex items-center justify-between"><CardTitle>Line Items</CardTitle><Button type="button" size="sm" variant="outline" onClick={addItem}><Plus className="w-4 h-4 mr-1"/>Add Item</Button></div></CardHeader>
            <CardContent className="space-y-3">
              {packages.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-medium text-gray-500 uppercase">Add from Packages</p>
                  <div className="flex flex-wrap gap-2">
                    {packages.map((pkg: any) => (
                      <button key={pkg.id} type="button" onClick={() => addFromPackage(pkg)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm hover:border-brand hover:text-brand transition-colors text-left">
                        <Plus className="w-3 h-3 flex-shrink-0" />
                        <span className="font-medium">{pkg.name}</span>
                        <span className="text-gray-400">${(pkg.priceCents / 100).toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
              {forceFullPayment && (
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>This event is within {fullPaymentDays} days — full payment is required at booking.</span>
                </div>
              )}

              {!forceFullPayment && (
                <div className="flex gap-4">
                  {[['full','Full Payment'],['deposit','Deposit + Balance']].map(([v,l]) => (
                    <label key={v} className={'flex items-center gap-2 cursor-pointer px-4 py-3 rounded-xl border-2 transition-colors ' + (paymentType===v ? 'border-brand bg-brand-surface' : 'border-gray-200')}>
                      <input type="radio" value={v} checked={paymentType===v} onChange={() => setPaymentType(v as any)} className="sr-only"/>
                      <span className="text-sm font-medium">{l}</span>
                    </label>
                  ))}
                </div>
              )}

              {paymentType === 'deposit' && !forceFullPayment ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Deposit Percentage</label>
                      <div className="flex items-center gap-2">
                        <Input type="number" min="1" max="99" value={depositPercent} onChange={e => setDepositPercent(e.target.value)} className="w-24"/>
                        <span className="text-sm text-gray-500">% = {fmt(depositAmt)} due now</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1">Balance</p>
                      <p className="text-sm text-gray-600 mt-2">
                        {fmt(total - depositAmt)} due{' '}
                        {balanceDueDate
                          ? <strong>{new Date(balanceDueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>
                          : <span className="text-gray-400">— select event</span>
                        }
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Deposit Due Date</label>
                      <Input type="date" value={depositDueDate} onChange={e => setDepositDueDate(e.target.value)}/>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Balance Due Date</label>
                      <Input type="date" value={balanceDueDate} onChange={e => setBalanceDueDate(e.target.value)}/>
                      {balanceDueDate && <p className="text-xs text-gray-400 mt-1">Auto-set to {balanceDueDays} days before event</p>}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}/>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full border border-gray-300 rounded-xl p-3 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-brand" placeholder="Payment notes..."/>
              </div>
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
