'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Plus, Trash2, AlertCircle, Tag, X } from 'lucide-react';
import { Suspense } from 'react';

interface LineItem { description: string; quantity: number; unitPrice: string; }

type DiscountMode = 'none' | 'percentage' | 'fixed' | 'coupon';

function QuoteNewForm() {
  const router = useRouter();
  const params = useSearchParams();
  const eventId = params.get('eventId');
  const [events, setEvents] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState(eventId || '');
  const [contractTemplateId, setContractTemplateId] = useState('');
  const [paymentType, setPaymentType] = useState<'full' | 'deposit'>('deposit');
  const [depositPercent, setDepositPercent] = useState(50);
  const [fullPaymentDays, setFullPaymentDays] = useState(14);
  const [balanceDueDays, setBalanceDueDays] = useState(30);
  const [balanceDueDate, setBalanceDueDate] = useState<string | null>(null);
  const [forceFullPayment, setForceFullPayment] = useState(false);
  const [items, setItems] = useState<LineItem[]>([{ description: '', quantity: 1, unitPrice: '' }]);
  const [taxRate, setTaxRate] = useState('0');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');

  // Discount state
  const [discountMode, setDiscountMode] = useState<DiscountMode>('none');
  const [discountPct, setDiscountPct] = useState('');
  const [discountFixed, setDiscountFixed] = useState('');
  const [selectedCouponId, setSelectedCouponId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/events').then(r => r.json()).then(setEvents);
    fetch('/api/settings/packages').then(r => r.json()).then(setPackages);
    fetch('/api/contracts/templates').then(r => r.json()).then(d => setTemplates(Array.isArray(d) ? d : []));
    fetch('/api/settings/coupons').then(r => r.json()).then(d => setCoupons(Array.isArray(d) ? d.filter((c: any) => c.isActive) : []));
    fetch('/api/settings/branding').then(r => r.json()).then(d => {
      if (d.defaultDepositPercent != null) setDepositPercent(d.defaultDepositPercent);
      if (d.fullPaymentIfWithinDays != null) setFullPaymentDays(d.fullPaymentIfWithinDays);
      if (d.balanceDueDaysBeforeEvent != null) setBalanceDueDays(d.balanceDueDaysBeforeEvent);
    });
  }, []);

  useEffect(() => {
    if (!selectedEvent) { setForceFullPayment(false); return; }
    const ev = events.find(e => e.id === selectedEvent);
    if (!ev?.eventDate) { setForceFullPayment(false); return; }
    const daysUntil = Math.floor((new Date(ev.eventDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= fullPaymentDays) {
      setForceFullPayment(true); setPaymentType('full'); setBalanceDueDate(null);
    } else {
      setForceFullPayment(false);
      const bd = new Date(ev.eventDate);
      bd.setDate(bd.getDate() - balanceDueDays);
      setBalanceDueDate(bd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
    }
  }, [selectedEvent, events, fullPaymentDays, balanceDueDays]);

  function addFromPackage(pkg: any) {
    setItems(prev => [...prev.filter(i => i.description.trim() || i.unitPrice), {
      description: pkg.name + (pkg.description ? ' — ' + pkg.description : ''),
      quantity: 1, unitPrice: (pkg.priceCents / 100).toFixed(2),
    }]);
  }
  function addItem() { setItems(i => [...i, { description: '', quantity: 1, unitPrice: '' }]); }
  function removeItem(idx: number) { setItems(i => i.filter((_, j) => j !== idx)); }
  function updateItem(idx: number, field: keyof LineItem, val: string | number) {
    setItems(prev => prev.map((item, j) => j === idx ? { ...item, [field]: val } : item));
  }

  const subtotal = items.reduce((s, i) => s + (i.quantity * (parseFloat(i.unitPrice) || 0)), 0);
  const taxAmt = subtotal * (parseFloat(taxRate) / 100);

  // Discount calculation
  const activeCoupon = coupons.find(c => c.id === selectedCouponId);
  let discountAmt = 0;
  let discountLabel = '';
  if (discountMode === 'percentage' && discountPct) {
    discountAmt = subtotal * (parseFloat(discountPct) / 100);
    discountLabel = `${discountPct}% discount`;
  } else if (discountMode === 'fixed' && discountFixed) {
    discountAmt = parseFloat(discountFixed) || 0;
    discountLabel = `$${discountFixed} discount`;
  } else if (discountMode === 'coupon' && activeCoupon) {
    discountAmt = activeCoupon.type === 'PERCENTAGE'
      ? subtotal * (activeCoupon.value / 100)
      : activeCoupon.value;
    discountLabel = `${activeCoupon.code} (${activeCoupon.type === 'PERCENTAGE' ? `${activeCoupon.value}% off` : `$${activeCoupon.value} off`})`;
  }
  discountAmt = Math.min(discountAmt, subtotal);

  const total = subtotal + taxAmt - discountAmt;
  const fmt = (n: number) => '$' + n.toFixed(2);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEvent) { setError('Please select an event'); return; }
    setLoading(true); setError('');
    const lineItems = items.filter(i => i.description.trim()).map(i => ({
      description: i.description, quantity: i.quantity,
      unitCents: Math.round((parseFloat(i.unitPrice) || 0) * 100),
      totalCents: Math.round(i.quantity * (parseFloat(i.unitPrice) || 0) * 100),
    }));
    const res = await fetch('/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: selectedEvent, lineItems,
        taxRatePercent: parseFloat(taxRate) || 0,
        discountCents: Math.round(discountAmt * 100),
        discountLabel: discountLabel || null,
        couponId: discountMode === 'coupon' ? (selectedCouponId || null) : null,
        validUntil: validUntil || null, notes: notes || null, terms: terms || null,
        contractTemplateId: contractTemplateId || null, paymentType, depositPercent,
      }),
    });
    const data = await res.json();
    if (res.ok) router.push('/quotes/' + data.id);
    else { setError(data.error || 'Failed to create quote'); setLoading(false); }
  }

  return (
    <>
      <TopBar title="New Quote" />
      <div className="p-4 sm:p-8 max-w-3xl space-y-6">
        <form onSubmit={submit} className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Event</CardTitle></CardHeader>
            <CardContent>
              <Select value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}>
                <option value="">— Select Event —</option>
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.title} — {ev.client?.firstName} {ev.client?.lastName}</option>
                ))}
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Line Items</CardTitle>
                <Button type="button" size="sm" variant="outline" onClick={addItem}>
                  <Plus className="w-4 h-4 mr-1" />Add Item
                </Button>
              </div>
            </CardHeader>
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
                <div className="col-span-6">Description</div><div className="col-span-2">Qty</div>
                <div className="col-span-3">Unit Price</div><div className="col-span-1"></div>
              </div>
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-6"><Input value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} placeholder="Description" /></div>
                  <div className="col-span-2"><Input type="number" min="1" value={item.quantity} onChange={e => updateItem(i, 'quantity', parseFloat(e.target.value) || 1)} /></div>
                  <div className="col-span-3"><Input type="number" step="0.01" min="0" value={item.unitPrice} onChange={e => updateItem(i, 'unitPrice', e.target.value)} placeholder="0.00" /></div>
                  <div className="col-span-1">
                    {items.length > 1 && <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                </div>
              ))}

              {/* Discount Section */}
              <div className="border-t pt-4">
                {discountMode === 'none' ? (
                  <button type="button" onClick={() => setDiscountMode('percentage')}
                    className="flex items-center gap-2 text-sm text-brand hover:text-brand/80 font-medium transition-colors">
                    <Tag className="w-4 h-4" />Add discount or coupon
                  </button>
                ) : (
                  <div className="bg-green-50 border border-green-100 rounded-xl p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-green-800 flex items-center gap-2"><Tag className="w-4 h-4" />Discount</p>
                      <button type="button" onClick={() => { setDiscountMode('none'); setDiscountPct(''); setDiscountFixed(''); setSelectedCouponId(''); }} className="text-green-600 hover:text-green-800">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {(['percentage', 'fixed', ...(coupons.length > 0 ? ['coupon'] : [])] as DiscountMode[]).map(m => (
                        <button key={m} type="button" onClick={() => setDiscountMode(m)}
                          className={'px-3 py-1 rounded-lg text-xs font-medium border transition-colors ' + (discountMode === m ? 'bg-green-600 text-white border-green-600' : 'border-green-300 text-green-700 hover:bg-green-100')}>
                          {m === 'percentage' ? '% Percent' : m === 'fixed' ? '$ Fixed' : '🏷 Coupon Code'}
                        </button>
                      ))}
                    </div>
                    {discountMode === 'percentage' && (
                      <div className="flex items-center gap-2">
                        <Input type="number" min="1" max="100" step="1" value={discountPct} onChange={e => setDiscountPct(e.target.value)} placeholder="e.g. 10" className="w-24" />
                        <span className="text-sm text-green-700 font-medium">% off</span>
                        {discountPct && subtotal > 0 && <span className="text-sm text-green-600 ml-2">= -{fmt(subtotal * parseFloat(discountPct) / 100)}</span>}
                      </div>
                    )}
                    {discountMode === 'fixed' && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-green-700 font-medium">$</span>
                        <Input type="number" min="0.01" step="0.01" value={discountFixed} onChange={e => setDiscountFixed(e.target.value)} placeholder="e.g. 50.00" className="w-32" />
                        <span className="text-sm text-green-700 font-medium">off</span>
                      </div>
                    )}
                    {discountMode === 'coupon' && (
                      <div className="space-y-2">
                        <select value={selectedCouponId} onChange={e => setSelectedCouponId(e.target.value)}
                          className="w-full border border-green-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400/30 bg-white">
                          <option value="">— Select a coupon —</option>
                          {coupons.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.code} — {c.type === 'PERCENTAGE' ? `${c.value}% off` : `$${c.value} off`}{c.description ? ` (${c.description})` : ''}
                            </option>
                          ))}
                        </select>
                        {activeCoupon && subtotal > 0 && (
                          <p className="text-sm text-green-600 font-medium">Saves {fmt(discountAmt)}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Totals */}
              <div className="border-t pt-4 space-y-1 text-right text-sm">
                <p className="text-gray-500">Subtotal: {fmt(subtotal)}</p>
                <div className="flex items-center justify-end gap-2">
                  <span className="text-gray-500">Tax:</span>
                  <Input type="number" step="0.1" min="0" max="100" value={taxRate} onChange={e => setTaxRate(e.target.value)} className="w-20 h-7 text-right text-xs" />
                  <span className="text-gray-400 text-xs">%</span>
                  <span className="text-gray-500 w-20 text-right">{fmt(taxAmt)}</span>
                </div>
                {discountAmt > 0 && (
                  <p className="text-green-600 font-medium">
                    {discountLabel ? `Discount (${discountLabel})` : 'Discount'}: -{fmt(discountAmt)}
                  </p>
                )}
                <p className="text-xl font-bold">Total: {fmt(total)}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valid Until</label>
                <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="max-w-xs" />
              </div>
              {templates.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contract Template on Acceptance</label>
                  <select value={contractTemplateId} onChange={e => setContractTemplateId(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                    <option value="">— Use default template —</option>
                    {templates.map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (default)' : ''}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Schedule</label>
                {forceFullPayment && (
                  <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mb-3">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>This event is within {fullPaymentDays} days — full payment is required at booking.</span>
                  </div>
                )}
                {!forceFullPayment && (
                  <div className="flex gap-2 mb-3">
                    {(['full', 'deposit'] as const).map(t => (
                      <button key={t} type="button" onClick={() => setPaymentType(t)}
                        className={'px-4 py-2 rounded-xl border text-sm font-medium transition-colors ' + (paymentType === t ? 'bg-brand text-white border-brand' : 'border-gray-300 text-gray-600 hover:border-brand hover:text-brand')}>
                        {t === 'full' ? 'Full Payment' : 'Deposit + Balance'}
                      </button>
                    ))}
                  </div>
                )}
                {paymentType === 'deposit' && !forceFullPayment && (
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-gray-600 whitespace-nowrap">Deposit %</label>
                    <Input type="number" min="1" max="99" value={depositPercent} onChange={e => setDepositPercent(parseInt(e.target.value) || 50)} className="w-24" />
                    <span className="text-sm text-gray-500">
                      = {new Intl.NumberFormat('en-US',{style:'currency',currency:'usd'}).format(total * (depositPercent/100))} due now,{' '}
                      {new Intl.NumberFormat('en-US',{style:'currency',currency:'usd'}).format(total * (1 - depositPercent/100))} balance
                      {balanceDueDate && <> due <strong>{balanceDueDate}</strong></>}
                    </span>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes to Client</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full border border-gray-300 rounded-xl p-3 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-brand" placeholder="Any notes for the client..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Terms &amp; Conditions</label>
                <textarea value={terms} onChange={e => setTerms(e.target.value)} className="w-full border border-gray-300 rounded-xl p-3 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-brand" placeholder="Terms and conditions..." />
              </div>
            </CardContent>
          </Card>

          {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-4 py-3">{error}</p>}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Quote'}</Button>
          </div>
        </form>
      </div>
    </>
  );
}

export default function QuoteNewPage() {
  return <Suspense><QuoteNewForm /></Suspense>;
}
