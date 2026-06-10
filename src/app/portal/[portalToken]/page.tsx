
'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { SignatureCanvas } from '@/components/contracts/SignatureCanvas';
import { CheckCircle2, Calendar, MapPin, FileText, Receipt, Camera, Lock, AlertCircle } from 'lucide-react';

type PortalData = { booking: any; client: any; branding: any; invoice: any; contract: any; gallery: any; meta: any };

function Spinner() { return <div className="w-8 h-8 border-4 border-brand/20 border-t-brand rounded-full animate-spin mx-auto"/>; }

function NavTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={'px-5 py-3 text-sm font-semibold border-b-2 transition-colors ' + (active ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}>{children}</button>;
}

export default function PortalPage() {
  const { portalToken } = useParams<{ portalToken: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'booking'|'invoice'|'contract'|'gallery'>('booking');
  const [sigData, setSigData] = useState('');
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState('');
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    fetch('/api/portal/' + portalToken)
      .then(r => r.json())
      .then(d => { if (d.error) { setError(d.error); } else { setData(d); if (!d.meta.tabs.contract) setTab('booking'); } })
      .catch(() => setError('Failed to load.'))
      .finally(() => setLoading(false));
  }, [portalToken]);

  async function signContract() {
    if (!sigData) { setSignError('Please draw your signature first.'); return; }
    if (!data?.contract) return;
    setSigning(true); setSignError('');
    const res = await fetch('/api/contracts/' + data.contract.contractId + '/sign/client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientToken: data.contract.clientToken, signatureDataUrl: sigData, hasReadAndAgreed: true }) });
    const d = await res.json();
    if (res.ok) { setSigned(true); setData(prev => prev ? { ...prev, contract: { ...prev.contract, clientHasSigned: true, status: d.status, pdfUrl: d.pdfUrl } } : prev); }
    else { setSignError(d.error ?? 'Signing failed. Please try again.'); }
    setSigning(false);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Spinner/></div>;
  if (error) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-center"><AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3"/><p className="text-gray-600">{error}</p></div></div>;
  if (!data) return null;

  const { booking, client, branding, invoice, contract, meta } = data;
  const pc = branding.primaryColor || '#F97316';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          {branding.logoUrl && <img src={branding.logoUrl} alt={branding.companyName} className="h-8 object-contain"/>}
          <div>
            <p className="font-bold text-sm text-gray-900">{branding.companyName}</p>
            <p className="text-xs text-gray-500">Booking Portal</p>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 flex gap-1 border-t">
          <NavTab active={tab==='booking'} onClick={() => setTab('booking')}><Calendar className="inline w-3.5 h-3.5 mr-1.5"/>Booking</NavTab>
          {meta.tabs.invoice && <NavTab active={tab==='invoice'} onClick={() => setTab('invoice')}><Receipt className="inline w-3.5 h-3.5 mr-1.5"/>Invoice</NavTab>}
          {meta.tabs.contract && <NavTab active={tab==='contract'} onClick={() => setTab('contract')}><FileText className="inline w-3.5 h-3.5 mr-1.5"/>Contract</NavTab>}
          {meta.tabs.gallery && <NavTab active={tab==='gallery'} onClick={() => setTab('gallery')}><Camera className="inline w-3.5 h-3.5 mr-1.5"/>Gallery</NavTab>}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-white rounded-2xl shadow-sm p-6 border-l-4" style={{ borderLeftColor: pc }}>
          <p className="text-sm text-gray-500 mb-1">Hi {client.firstName} — welcome to your booking portal</p>
          <h1 className="text-2xl font-bold text-gray-900">{booking.title}</h1>
          <p className="text-brand font-semibold mt-1">{booking.status?.replace(/_/g,' ')}</p>
        </div>

        {tab === 'booking' && (
          <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-bold">Event Details</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-start gap-3"><Calendar className="w-4 h-4 mt-0.5 text-gray-400"/><div><p className="text-xs text-gray-400 uppercase font-medium">Date &amp; Time</p><p className="font-semibold">{booking.eventDate}</p>{booking.startTime && <p className="text-gray-600">{booking.startTime}{booking.endTime ? ' – ' + booking.endTime : ''}</p>}</div></div>
              {booking.venueName && <div className="flex items-start gap-3"><MapPin className="w-4 h-4 mt-0.5 text-gray-400"/><div><p className="text-xs text-gray-400 uppercase font-medium">Venue</p><p className="font-semibold">{booking.venueName}</p>{booking.venueAddress && <p className="text-gray-600">{booking.venueAddress}</p>}</div></div>}
              {booking.packageName && <div className="col-span-2"><p className="text-xs text-gray-400 uppercase font-medium mb-1">Package</p><p className="font-semibold">{booking.packageName}</p></div>}
            </div>
            {branding.contactEmail && <div className="pt-4 border-t text-sm text-gray-500">Questions? <a href={'mailto:' + branding.contactEmail} className="text-brand hover:underline">{branding.contactEmail}</a>{branding.contactPhone && <span className="ml-4">{branding.contactPhone}</span>}</div>}
          </div>
        )}

        {tab === 'invoice' && invoice && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 flex items-center justify-between border-b">
              <div><h2 className="text-lg font-bold">Invoice {invoice.invoiceNumber}</h2><p className="text-sm text-gray-500">{invoice.isPaid ? 'Paid in full' : 'Balance due: ' + invoice.balanceDueFormatted}</p></div>
              <span className={'px-3 py-1 rounded-full text-xs font-bold ' + (invoice.isPaid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700')}>{invoice.status}</span>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 font-medium text-gray-500">Description</th><th className="text-right px-6 py-3 font-medium text-gray-500">Qty</th><th className="text-right px-6 py-3 font-medium text-gray-500">Total</th></tr></thead>
              <tbody>{invoice.lineItems?.map((li: any) => (<tr key={li.id} className="border-b"><td className="px-6 py-3">{li.description}</td><td className="px-6 py-3 text-right">{li.quantity}</td><td className="px-6 py-3 text-right font-medium">{new Intl.NumberFormat('en-US',{style:'currency',currency:'usd'}).format(li.totalCents/100)}</td></tr>))}</tbody>
            </table>
            <div className="p-6 border-t text-right space-y-1 text-sm">
              <p className="text-gray-500">Total: {invoice.totalFormatted}</p>
              <p className="text-gray-500">Paid: {invoice.amountPaidFormatted}</p>
              <p className={'text-xl font-bold ' + (invoice.balanceDueCents === 0 ? 'text-green-600' : 'text-gray-900')}>Balance Due: {invoice.balanceDueFormatted}</p>
              {invoice.dueDate && <p className="text-gray-400 text-xs">Due {invoice.dueDate}</p>}
            </div>
            {invoice.canPay && invoice.balanceDueCents > 0 && (
              <div className="px-6 pb-6">
                <button className="w-full py-3 rounded-xl text-white font-bold text-base transition-opacity hover:opacity-90" style={{ backgroundColor: pc }}>Pay {invoice.balanceDueFormatted} Online</button>
                <p className="text-xs text-center text-gray-400 mt-2">Secure payment powered by Stripe</p>
              </div>
            )}
          </div>
        )}

        {tab === 'contract' && contract && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b flex items-center justify-between">
              <div><h2 className="text-lg font-bold">{contract.title}</h2><p className="text-sm text-gray-500">{contract.status?.replace(/_/g,' ')}</p></div>
              {contract.isFullyExecuted && <span className="flex items-center gap-1.5 text-green-700 bg-green-50 px-3 py-1 rounded-full text-xs font-bold"><Lock className="w-3 h-3"/>Fully Executed</span>}
            </div>
            {contract.renderedContent && <div className="p-6 prose max-w-none text-sm leading-relaxed border-b" dangerouslySetInnerHTML={{ __html: contract.renderedContent }}/>}
            {contract.canSign && !signed && (
              <div className="p-6 space-y-4 bg-gray-50">
                <h3 className="font-semibold text-gray-900">Your Signature</h3>
                <p className="text-sm text-gray-600">By signing, you agree to the terms in this contract.</p>
                <SignatureCanvas onCapture={setSigData}/>
                {signError && <p className="text-red-600 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4"/>{signError}</p>}
                <button disabled={signing || !sigData} onClick={signContract} className="w-full py-3 rounded-xl text-white font-bold text-base disabled:opacity-50 transition-opacity hover:opacity-90" style={{ backgroundColor: pc }}>{signing ? 'Signing...' : 'Sign Contract'}</button>
              </div>
            )}
            {(signed || contract.clientHasSigned) && !contract.isFullyExecuted && (
              <div className="p-6 bg-green-50 text-center">
                <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-2"/>
                <p className="font-semibold text-green-800">Signature Received</p>
                <p className="text-sm text-green-600">Awaiting countersignature from {branding.companyName}.</p>
              </div>
            )}
            {contract.isFullyExecuted && (
              <div className="p-6 bg-green-50 text-center space-y-3">
                <Lock className="w-10 h-10 text-green-600 mx-auto"/>
                <p className="font-semibold text-green-800">Contract Fully Executed</p>
                {contract.pdfUrl && <a href={contract.pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-block px-6 py-2.5 rounded-xl text-white font-semibold text-sm" style={{ backgroundColor: pc }}>Download Signed PDF</a>}
              </div>
            )}
          </div>
        )}

        {tab === 'gallery' && <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-gray-400"><Camera className="w-12 h-12 mx-auto mb-4 opacity-30"/><p className="font-medium">Gallery Coming Soon</p><p className="text-sm mt-1">Your photos will appear here once uploaded.</p></div>}
      </main>

      <footer className="text-center py-8 text-xs text-gray-400">Powered by {branding.companyName}</footer>
    </div>
  );
}
