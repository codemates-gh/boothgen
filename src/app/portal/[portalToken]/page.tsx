'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Camera, CheckCircle2, Lock, FileText, Receipt, Image, ChevronRight, Printer, Layers, AlertCircle } from 'lucide-react';
import { InvoicePaymentForm } from '@/components/stripe/PaymentForm';

type Tab = 'quote' | 'contract' | 'invoice' | 'design' | 'gallery';

interface PortalData {
  event: any; client: any; tenant: any;
  quote: any | null; contract: any | null;
  invoice: any | null; gallery: any | null;
  assets: any[];
  templateDesigns: any[];
}

const fmt = (c: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);

export default function ClientPortalPage() {
  const { portalToken } = useParams<{ portalToken: string }>();
  const searchParams    = useSearchParams();

  const [data,        setData]        = useState<PortalData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState<Tab>((searchParams.get('tab') as Tab) || 'quote');
  const [sigName,     setSigName]     = useState('');
  const [declining,   setDeclining]   = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [processing,  setProcessing]  = useState(false);
  const [message,     setMessage]     = useState('');
  // showPayment: null = hidden | 'full' = full balance | milestoneId = that milestone
  const [showPayment, setShowPayment] = useState<string | null>(null);
  const [revisionNote, setRevisionNote] = useState('');
  const [showRevisionForm, setShowRevisionForm] = useState(false);

  useEffect(() => { load(); }, [portalToken]);

  // Handle Stripe's redirect back after payment — poll until the webhook has updated the DB
  useEffect(() => {
    const rs = searchParams.get('redirect_status');
    if (rs === 'succeeded') {
      setMessage('Payment successful! Your invoice has been updated. 🎉');
      setTab('invoice');
      pollUntilPaid(0);
    } else if (rs === 'failed') {
      setMessage('Payment was not completed. Please try again.');
      setTab('invoice');
    }
  }, []);

  async function pollUntilPaid(attempt: number) {
    const r = await fetch('/api/portal/' + portalToken);
    if (!r.ok) return;
    const d = await r.json();
    setData(d);
    setLoading(false);
    // Keep polling while no payment recorded yet, up to 5 attempts (~10s total)
    if (attempt < 5 && d.invoice && d.invoice.amountPaidCents === 0) {
      setTimeout(() => pollUntilPaid(attempt + 1), 2000);
    }
  }

  async function load() {
    const r = await fetch('/api/portal/' + portalToken);
    if (r.ok) { setData(await r.json()); }
    setLoading(false);
  }

  const pc = data?.tenant?.branding?.primaryColor || '#F97316';

  const quoteAccepted  = data?.quote?.status === 'ACCEPTED';
  const contractSigned = data?.contract?.status === 'FULLY_EXECUTED' ||
                         data?.contract?.status === 'CLIENT_SIGNED';
  const invoicePaid    = data?.invoice?.status === 'PAID';
  const eventBooked    = data?.event?.status === 'BOOKED';
  const designUnlocked = invoicePaid || eventBooked;
  const latestDesign   = data?.templateDesigns?.[0] ?? null;
  const designDone     = latestDesign?.status === 'APPROVED';

  const tabs: { id: Tab; label: string; icon: any; locked: boolean; done: boolean }[] = [
    { id: 'quote',    label: 'Quote',    icon: FileText, locked: false,              done: quoteAccepted  },
    { id: 'contract', label: 'Contract', icon: FileText, locked: !quoteAccepted,    done: contractSigned },
    { id: 'invoice',  label: 'Invoice',  icon: Receipt,  locked: !contractSigned,   done: invoicePaid    },
    { id: 'design',   label: 'Design',   icon: Layers,   locked: !designUnlocked,   done: designDone     },
    { id: 'gallery',  label: 'Gallery',  icon: Image,    locked: !data?.gallery?.isPublished, done: false },
  ];

  async function acceptQuote() {
    if (!sigName.trim()) { setMessage('Please enter your name to sign'); return; }
    setProcessing(true);
    try {
      const r = await fetch('/api/quotes/' + data?.quote?.id + '/accept', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureData: sigName, clientName: sigName, portalToken }),
      });
      if (r.ok) { setMessage('Quote accepted! Your contract is now available.'); await load(); setTab('contract'); }
      else { const d = await r.json().catch(() => ({})); setMessage(d.error || 'Something went wrong. Please try again.'); }
    } catch { setMessage('Network error. Please try again.'); }
    setProcessing(false);
  }

  async function declineQuote() {
    setProcessing(true);
    try {
      await fetch('/api/quotes/' + data?.quote?.id + '/decline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: declineReason, portalToken }),
      });
      setMessage('Quote declined. The host will be notified.'); await load();
    } catch { setMessage('Network error. Please try again.'); }
    setProcessing(false);
  }

  async function signContract() {
    if (!sigName.trim()) { setMessage('Please enter your name to sign'); return; }
    setProcessing(true);
    try {
      const r = await fetch('/api/contracts/' + data?.contract?.id + '/sign/client', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientToken: data?.contract?.clientToken || '', signatureDataUrl: sigName, signerName: sigName }),
      });
      if (r.ok) { setMessage('Contract signed! Your invoice is now available.'); await load(); setTab('invoice'); }
      else { const d = await r.json().catch(() => ({})); setMessage(d.error || 'Something went wrong. Please try again.'); }
    } catch { setMessage('Network error. Please try again.'); }
    setProcessing(false);
  }

  async function approveDesign() {
    if (!latestDesign) return;
    setProcessing(true);
    try {
      const r = await fetch('/api/template-designs/' + latestDesign.id + '/approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portalToken }),
      });
      if (r.ok) { setMessage('Design approved! Thank you.'); await load(); }
      else { const d = await r.json().catch(() => ({})); setMessage(d.error || 'Something went wrong. Please try again.'); }
    } catch { setMessage('Network error. Please try again.'); }
    setProcessing(false);
  }

  async function requestDesignRevision() {
    if (!latestDesign) return;
    if (!revisionNote.trim()) { setMessage('Please enter your feedback before submitting.'); return; }
    setProcessing(true);
    try {
      const r = await fetch('/api/template-designs/' + latestDesign.id + '/request-revision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portalToken, revisionNote }),
      });
      if (r.ok) {
        setMessage('Revision requested. The host has been notified and will upload a new version.');
        setRevisionNote(''); setShowRevisionForm(false);
        await load();
      } else { const d = await r.json().catch(() => ({})); setMessage(d.error || 'Something went wrong. Please try again.'); }
    } catch { setMessage('Network error. Please try again.'); }
    setProcessing(false);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"/>
        <p className="text-gray-500">Loading your portal...</p>
      </div>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <p className="text-xl font-bold text-gray-700 mb-2">Portal not found</p>
        <p className="text-gray-500">This link may be invalid or expired.</p>
      </div>
    </div>
  );

  const brandColor  = pc;
  const companyName = data.tenant?.branding?.companyName || data.tenant?.name || 'Photo Booth Co.';

  // Payment return URL — Stripe redirects here after card entry
  const paymentReturnUrl =
    (process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin) +
    '/portal/' + portalToken + '?tab=invoice';

  // Helper: which milestone (if any) is currently being paid
  const activeMilestone = showPayment && showPayment !== 'full'
    ? data.invoice?.milestones?.find((m: any) => m.id === showPayment)
    : null;
  const payAmountCents = showPayment === 'full'
    ? (data.invoice?.balanceDueCents ?? 0)
    : (activeMilestone?.amountCents ?? 0);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {data.tenant?.branding?.logoUrl
              ? <img src={data.tenant.branding.logoUrl} alt={companyName} className="h-10 object-contain"/>
              : <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: brandColor }}>
                  <Camera className="w-5 h-5 text-white"/>
                </div>}
            <div>
              <p className="font-bold text-gray-900">{companyName}</p>
              <p className="text-xs text-gray-500">Client Portal</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold text-sm text-gray-800">{data.event?.title}</p>
            <p className="text-xs text-gray-500">
              {data.event?.eventDate
                ? new Date(data.event.eventDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                : ''}
            </p>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6">
          <div className="flex">
            {tabs.map((t, i) => {
              const Icon      = t.icon;
              const active    = tab === t.id;
              const clickable = !t.locked;
              return (
                <button
                  key={t.id}
                  onClick={() => { if (clickable) { setTab(t.id); setShowPayment(null); } }}
                  disabled={t.locked}
                  className={
                    'flex items-center gap-2 px-5 py-4 text-sm font-medium border-b-2 transition-colors ' +
                    (active   ? 'border-orange-500 text-orange-600'
                    : t.locked ? 'border-transparent text-gray-300 cursor-not-allowed'
                               : 'border-transparent text-gray-500 hover:text-gray-700 cursor-pointer')
                  }
                >
                  {t.done    ? <CheckCircle2 className="w-4 h-4 text-green-500"/>
                  : t.locked ? <Lock className="w-4 h-4"/>
                             : <Icon className="w-4 h-4"/>}
                  <span className="hidden sm:inline">{t.label}</span>
                  {i < tabs.length - 1 && !t.locked && (
                    <ChevronRight className="w-3 h-3 text-gray-300 hidden sm:inline"/>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        {message && (
          <div
            className="mb-6 p-4 rounded-xl border text-sm font-medium"
            style={{ backgroundColor: '#fff7ed', borderColor: '#fed7aa', color: '#c2410c' }}
          >
            {message}
          </div>
        )}

        {/* ── QUOTE TAB ────────────────────────────────────────────────────── */}
        {tab === 'quote' && (
          <div className="space-y-6">
            {!data.quote ? (
              <div className="text-center py-16 text-gray-400">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-30"/>
                <p>No quote has been sent yet. The host will send your quote shortly.</p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                  <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-medium">Quote</p>
                      <p className="text-xl font-bold text-gray-900 mt-0.5">{data.quote.quoteNumber}</p>
                    </div>
                    <span className={
                      'px-3 py-1 rounded-full text-xs font-bold ' +
                      (data.quote.status === 'ACCEPTED' ? 'bg-green-100 text-green-700'
                      : data.quote.status === 'DECLINED' ? 'bg-red-100 text-red-700'
                      : 'bg-orange-100 text-orange-700')
                    }>
                      {data.quote.status}
                    </span>
                  </div>
                  <div className="p-6">
                    <table className="w-full text-sm mb-6">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 text-gray-500 font-medium">Description</th>
                          <th className="text-right py-2 text-gray-500 font-medium">Qty</th>
                          <th className="text-right py-2 text-gray-500 font-medium">Price</th>
                          <th className="text-right py-2 text-gray-500 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.quote.lineItems?.map((li: any) => (
                          <tr key={li.id} className="border-b last:border-0">
                            <td className="py-3">{li.description}</td>
                            <td className="py-3 text-right">{li.quantity}</td>
                            <td className="py-3 text-right">{fmt(li.unitCents)}</td>
                            <td className="py-3 text-right font-medium">{fmt(li.totalCents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="text-right space-y-1 text-sm border-t pt-4">
                      <p className="text-gray-500">Subtotal: {fmt(data.quote.subtotalCents)}</p>
                      {data.quote.taxAmountCents > 0 && <p className="text-gray-500">Tax: {fmt(data.quote.taxAmountCents)}</p>}
                      {data.quote.discountCents  > 0 && <p className="text-green-600">Discount: -{fmt(data.quote.discountCents)}</p>}
                      <p className="text-2xl font-bold" style={{ color: brandColor }}>Total: {fmt(data.quote.totalCents)}</p>
                    </div>
                    {data.quote.notes && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-xl">
                        <p className="text-xs font-medium text-gray-500 uppercase mb-1">Notes</p>
                        <p className="text-sm text-gray-700">{data.quote.notes}</p>
                      </div>
                    )}
                    {data.quote.terms && (
                      <div className="mt-3 p-4 bg-gray-50 rounded-xl">
                        <p className="text-xs font-medium text-gray-500 uppercase mb-1">Terms</p>
                        <p className="text-sm text-gray-600">{data.quote.terms}</p>
                      </div>
                    )}
                  </div>
                </div>

                {(data.quote.status === 'SENT' || data.quote.status === 'VIEWED') && (
                  <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 shadow-sm">
                    <h3 className="font-bold text-gray-900">Accept This Quote</h3>
                    <p className="text-sm text-gray-600">By typing your name below, you agree to the terms and authorise this quote.</p>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Type your full name to sign *</label>
                      <input
                        type="text" value={sigName}
                        onChange={e => setSigName(e.target.value)}
                        placeholder="Jane Smith"
                        className="w-full border border-gray-300 rounded-xl px-4 py-3 text-lg font-medium focus:outline-none focus:ring-2"
                        style={{ fontFamily: 'cursive' }}
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={acceptQuote} disabled={processing || !sigName.trim()}
                        className="flex-1 py-3 rounded-xl text-white font-bold text-sm transition-all disabled:opacity-50"
                        style={{ backgroundColor: brandColor }}
                      >
                        {processing ? 'Processing...' : '✓ Accept Quote'}
                      </button>
                      <button onClick={() => setDeclining(!declining)} className="px-6 py-3 rounded-xl border border-gray-300 text-gray-600 font-medium text-sm hover:bg-gray-50">
                        Decline
                      </button>
                    </div>
                    {declining && (
                      <div className="space-y-3 pt-2 border-t">
                        <textarea
                          value={declineReason} onChange={e => setDeclineReason(e.target.value)}
                          placeholder="Reason for declining (optional)"
                          className="w-full border border-gray-300 rounded-xl p-3 text-sm resize-none h-20 focus:outline-none"
                        />
                        <button onClick={declineQuote} disabled={processing} className="w-full py-2.5 rounded-xl border border-red-300 text-red-600 font-medium text-sm hover:bg-red-50">
                          {processing ? '...' : 'Confirm Decline'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {data.quote.status === 'ACCEPTED' && (
                  <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-200">
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0"/>
                    <div>
                      <p className="font-semibold text-green-800">Quote Accepted</p>
                      <p className="text-sm text-green-600">
                        Signed by {data.quote.clientName} on{' '}
                        {data.quote.clientSignedAt ? new Date(data.quote.clientSignedAt).toLocaleDateString() : ''}
                      </p>
                    </div>
                    <button onClick={() => setTab('contract')} className="ml-auto text-sm font-semibold px-4 py-2 rounded-lg" style={{ backgroundColor: brandColor, color: 'white' }}>
                      View Contract →
                    </button>
                  </div>
                )}

                {data.quote.status === 'DECLINED' && (
                  <div className="flex items-center gap-3 p-4 bg-red-50 rounded-xl border border-red-200">
                    <p className="font-semibold text-red-800">Quote Declined</p>
                    {data.quote.declineReason && <p className="text-sm text-red-600">Reason: {data.quote.declineReason}</p>}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── CONTRACT TAB ─────────────────────────────────────────────────── */}
        {tab === 'contract' && (
          <div className="space-y-6">
            {!data.contract ? (
              <div className="text-center py-16 text-gray-400">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-30"/>
                <p>Your contract is being prepared. Check back shortly.</p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                  <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-medium">Contract</p>
                      <p className="text-xl font-bold text-gray-900 mt-0.5">{data.contract.title}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
                        <Printer className="w-4 h-4"/>Print
                      </button>
                      <span className={
                        'px-3 py-1 rounded-full text-xs font-bold self-center ' +
                        (contractSigned ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700')
                      }>
                        {data.contract.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                  <div className="p-6 prose max-w-none text-sm" dangerouslySetInnerHTML={{ __html: data.contract.renderedContent || data.contract.templateContent || '' }}/>
                </div>

                {!contractSigned && (
                  <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 shadow-sm">
                    <h3 className="font-bold text-gray-900">Sign This Contract</h3>
                    <p className="text-sm text-gray-600">By typing your name, you agree to all terms in this contract.</p>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Type your full name to sign *</label>
                      <input
                        type="text" value={sigName}
                        onChange={e => setSigName(e.target.value)}
                        placeholder="Jane Smith"
                        className="w-full border border-gray-300 rounded-xl px-4 py-3 text-lg font-medium focus:outline-none focus:ring-2"
                        style={{ fontFamily: 'cursive' }}
                      />
                    </div>
                    <button
                      onClick={signContract} disabled={processing || !sigName.trim()}
                      className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50"
                      style={{ backgroundColor: brandColor }}
                    >
                      {processing ? 'Signing...' : '✓ Sign Contract'}
                    </button>
                  </div>
                )}

                {contractSigned && (
                  <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-200">
                    <CheckCircle2 className="w-5 h-5 text-green-600"/>
                    <div>
                      <p className="font-semibold text-green-800">Contract Signed</p>
                      <p className="text-sm text-green-600">
                        Signed on {data.contract.clientSignedAt ? new Date(data.contract.clientSignedAt).toLocaleDateString() : ''}
                      </p>
                    </div>
                    <button onClick={() => setTab('invoice')} className="ml-auto text-sm font-semibold px-4 py-2 rounded-lg" style={{ backgroundColor: brandColor, color: 'white' }}>
                      View Invoice →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── INVOICE TAB ──────────────────────────────────────────────────── */}
        {tab === 'invoice' && (
          <div className="space-y-6">
            {!data.invoice ? (
              <div className="text-center py-16 text-gray-400">
                <Receipt className="w-12 h-12 mx-auto mb-4 opacity-30"/>
                <p>Your invoice is being prepared.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                {/* Invoice header */}
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-medium">Invoice</p>
                    <p className="text-xl font-bold text-gray-900 mt-0.5">{data.invoice.invoiceNumber}</p>
                  </div>
                  <span className={
                    'px-3 py-1 rounded-full text-xs font-bold ' +
                    (data.invoice.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700')
                  }>
                    {data.invoice.status}
                  </span>
                </div>

                <div className="p-6 space-y-4">
                  {/* Line items */}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 text-gray-500 font-medium">Description</th>
                        <th className="text-right py-2 text-gray-500 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.invoice.lineItems?.map((li: any) => (
                        <tr key={li.id} className="border-b last:border-0">
                          <td className="py-3">{li.description}</td>
                          <td className="py-3 text-right font-medium">{fmt(li.totalCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Totals */}
                  <div className="text-right space-y-1 text-sm border-t pt-4">
                    <p className="text-gray-500">Total: {fmt(data.invoice.totalCents)}</p>
                    <p className="text-gray-500">Paid: {fmt(data.invoice.amountPaidCents)}</p>
                    <p className="text-xl font-bold" style={{ color: data.invoice.balanceDueCents > 0 ? brandColor : '#16a34a' }}>
                      Balance Due: {fmt(data.invoice.balanceDueCents)}
                    </p>
                  </div>

                  {/* Payment schedule (milestones) */}
                  {data.invoice.milestones && data.invoice.milestones.length > 0 && (
                    <div className="border-t pt-4">
                      <p className="text-sm font-semibold text-gray-700 mb-3">Payment Schedule</p>
                      {data.invoice.milestones.map((m: any) => (
                        <div key={m.id} className="flex items-center justify-between py-3 border-b last:border-0">
                          <div>
                            <p className="font-medium text-sm">{m.label}</p>
                            <p className="text-xs text-gray-500">Due {new Date(m.dueDate).toLocaleDateString()}</p>
                          </div>
                          <div className="text-right flex flex-col items-end gap-1">
                            <p className="font-semibold text-sm">{fmt(m.amountCents)}</p>
                            {m.status === 'PAID' ? (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">PAID</span>
                            ) : (
                              <button
                                onClick={() => { setShowPayment(m.id); }}
                                className="text-xs px-3 py-1 rounded-lg text-white font-medium"
                                style={{ backgroundColor: brandColor }}
                              >
                                Pay
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Full balance Pay Now (shown when no milestones and balance > 0) */}
                  {data.invoice.balanceDueCents > 0 &&
                   (!data.invoice.milestones || data.invoice.milestones.length === 0) &&
                   !showPayment && (
                    <div className="pt-2">
                      <button
                        onClick={() => setShowPayment('full')}
                        className="w-full py-3 rounded-xl text-white font-bold"
                        style={{ backgroundColor: brandColor }}
                      >
                        Pay Now — {fmt(data.invoice.balanceDueCents)}
                      </button>
                      <p className="text-xs text-center text-gray-400 mt-2">Secure payment powered by Stripe</p>
                    </div>
                  )}

                  {/* Stripe payment form — appears when client clicks any Pay button */}
                  {showPayment && (
                    <div className="border-t pt-5 mt-2 space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-gray-800">
                          {showPayment === 'full'
                            ? 'Pay ' + fmt(data.invoice.balanceDueCents)
                            : 'Pay ' + fmt(activeMilestone?.amountCents ?? 0) + ' — ' + (activeMilestone?.label ?? '')}
                        </p>
                      </div>
                      <InvoicePaymentForm
                        invoiceId={data.invoice.id}
                        milestoneId={showPayment === 'full' ? undefined : showPayment}
                        amountCents={payAmountCents}
                        brandColor={brandColor}
                        returnUrl={paymentReturnUrl}
                      />
                      <button
                        onClick={() => setShowPayment(null)}
                        className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                </div>
              </div>
            )}
          </div>
        )}

        {/* What's next — shown below the paid invoice */}
        {tab === 'invoice' && invoicePaid && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-gray-100">
              <p className="font-bold text-gray-900 text-lg">What happens next</p>
              <p className="text-sm text-gray-500 mt-0.5">Your booking is confirmed — here's the road ahead.</p>
            </div>
            <div className="divide-y divide-gray-50">
              <div className="flex gap-4 px-6 py-5">
                <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0 text-lg">🎨</div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Template Design Review</p>
                  <p className="text-sm text-gray-500 mt-0.5">{data.tenant?.branding?.companyName || data.tenant?.name} will share your custom photo booth design for your approval. You'll receive an email when it's ready — you can also check the Design tab above.</p>
                  {!designUnlocked ? null : (
                    <button onClick={() => setTab('design')} className="mt-2 text-sm font-semibold" style={{ color: pc }}>
                      Go to Design tab →
                    </button>
                  )}
                </div>
              </div>
              <div className="flex gap-4 px-6 py-5">
                <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0 text-lg">📸</div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Your Event</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {data.event?.eventDate
                      ? 'Your event is scheduled for ' + new Date(data.event.eventDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + '. Your photo booth team will handle everything on the day.'
                      : 'Your photo booth team will handle everything on the day. Sit back and enjoy!'}
                  </p>
                </div>
              </div>
              <div className="flex gap-4 px-6 py-5">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0 text-lg">🖼️</div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Online Gallery</p>
                  <p className="text-sm text-gray-500 mt-0.5">Your event photos will be available to view and download here in your portal after the event.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── DESIGN TAB ───────────────────────────────────────────────────── */}
        {tab === 'design' && (
          <div className="space-y-6">
            {!latestDesign ? (
              <div className="text-center py-16 text-gray-400">
                <Layers className="w-12 h-12 mx-auto mb-4 opacity-30"/>
                <p>Your template design will appear here once it's ready for review.</p>
              </div>
            ) : latestDesign.status === 'PENDING_APPROVAL' ? (
              <>
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                  <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-medium">Template Design</p>
                      <p className="text-xl font-bold text-gray-900 mt-0.5">Version {latestDesign.version}</p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">Awaiting Your Review</span>
                  </div>
                  <div className="p-6 space-y-4">
                    <p className="text-sm text-gray-600">Please review the template design file below, then approve it or request changes.</p>
                    <a
                      href={latestDesign.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      <Layers className="w-8 h-8 text-gray-400 flex-shrink-0"/>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{latestDesign.filename}</p>
                        <p className="text-xs text-blue-600">Click to view file ↗</p>
                      </div>
                    </a>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 shadow-sm">
                  <h3 className="font-bold text-gray-900">Your Decision</h3>
                  <div className="flex gap-3">
                    <button
                      onClick={approveDesign} disabled={processing}
                      className="flex-1 py-3 rounded-xl text-white font-bold text-sm transition-all disabled:opacity-50"
                      style={{ backgroundColor: pc }}
                    >
                      {processing && !showRevisionForm ? 'Processing…' : '✓ Approve Design'}
                    </button>
                    <button
                      onClick={() => { setShowRevisionForm(!showRevisionForm); setMessage(''); }}
                      className="px-5 py-3 rounded-xl border border-gray-300 text-gray-600 font-medium text-sm hover:bg-gray-50"
                    >
                      Request Changes
                    </button>
                  </div>
                  {showRevisionForm && (
                    <div className="space-y-3 pt-2 border-t">
                      <label className="block text-sm font-medium text-gray-700">
                        Describe what you'd like changed <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={revisionNote} onChange={e => setRevisionNote(e.target.value)}
                        placeholder="e.g. Please change the font to something more elegant, and move the logo to the top right corner."
                        className="w-full border border-gray-300 rounded-xl p-3 text-sm resize-none h-28 focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': pc } as React.CSSProperties}
                      />
                      <button
                        onClick={requestDesignRevision} disabled={processing || !revisionNote.trim()}
                        className="w-full py-2.5 rounded-xl border border-amber-400 text-amber-700 font-medium text-sm hover:bg-amber-50 disabled:opacity-50"
                      >
                        {processing ? '…' : 'Submit Revision Request'}
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : latestDesign.status === 'APPROVED' ? (
              <div className="flex items-center gap-3 p-5 bg-green-50 rounded-2xl border border-green-200">
                <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0"/>
                <div>
                  <p className="font-semibold text-green-800">Design Approved</p>
                  <p className="text-sm text-green-600">
                    You approved version {latestDesign.version} on{' '}
                    {latestDesign.approvedAt ? new Date(latestDesign.approvedAt).toLocaleDateString() : ''}. Your photo booth is all set!
                  </p>
                </div>
              </div>
            ) : latestDesign.status === 'REVISION_REQUESTED' ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-5 bg-amber-50 rounded-2xl border border-amber-200">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5"/>
                  <div>
                    <p className="font-semibold text-amber-800">Revision in Progress</p>
                    <p className="text-sm text-amber-700 mt-1">
                      Your feedback has been sent. The host is working on a new version and will notify you when it's ready.
                    </p>
                    {latestDesign.revisionNote && (
                      <div className="mt-3 p-3 bg-white border border-amber-200 rounded-lg">
                        <p className="text-xs font-semibold text-amber-800 mb-1">Your feedback (version {latestDesign.version})</p>
                        <p className="text-sm text-amber-700">{latestDesign.revisionNote}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-gray-400">
                <Layers className="w-12 h-12 mx-auto mb-4 opacity-30"/>
                <p>Your design is being prepared. Check back shortly.</p>
              </div>
            )}
          </div>
        )}

        {/* ── GALLERY TAB ──────────────────────────────────────────────────── */}
        {tab === 'gallery' && (
          <div className="space-y-6">
            {data.gallery?.isExpired ? (
              <div className="text-center py-16">
                <Image className="w-12 h-12 mx-auto mb-4 opacity-20 text-gray-400"/>
                <p className="text-lg font-semibold text-gray-700 mb-2">Gallery Expired</p>
                <p className="text-sm text-gray-400 max-w-xs mx-auto">The access period for this gallery has ended. Please contact your host if you need assistance.</p>
              </div>
            ) : !data.gallery?.isPublished ? (
              <div className="text-center py-16 text-gray-400">
                <Image className="w-12 h-12 mx-auto mb-4 opacity-30"/>
                <p>Your gallery will appear here after your event.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-900 text-lg">{data.gallery.title}</h3>
                  <p className="text-sm text-gray-500">{data.assets.length} photos</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {data.assets.map((a: any) => (
                    <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer"
                      className="aspect-square rounded-xl overflow-hidden block hover:opacity-90 transition-opacity">
                      <img src={a.url} alt="" className="w-full h-full object-cover"/>
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

      </div>

      <style>{`@media print { header, nav { display: none; } }`}</style>
    </div>
  );
}
