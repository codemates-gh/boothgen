
'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SignatureCanvas } from '@/components/contracts/SignatureCanvas';
import { ArrowLeft, Send, Lock, Download, PenLine, Pen, Type } from 'lucide-react';
import Link from 'next/link';
import { stripMergeTagSpans } from '@/lib/contracts/merge-tags';
import { useRef, useCallback } from 'react';

const CC: Record<string, any> = { DRAFT:'default', SENT_TO_CLIENT:'info', CLIENT_SIGNED:'warning', HOST_SIGNED:'warning', FULLY_EXECUTED:'success', VOIDED:'danger' };

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sigMode, setSigMode] = useState<'draw' | 'type'>('draw');
  const [sigData, setSigData] = useState('');
  const [typedName, setTypedName] = useState('');
  const [signing, setSigning] = useState(false);
  const [sending, setSending] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const renderTypedSig = useCallback((name: string) => {
    setTypedName(name);
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
    canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
    if (!name.trim()) { setSigData(''); return; }
    ctx.font = 'italic 36px Georgia, "Times New Roman", serif';
    ctx.fillStyle = '#111827';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 24, canvas.offsetHeight / (window.devicePixelRatio || 1) / 2);
    setSigData(canvas.toDataURL('image/png'));
  }, []);

  useEffect(() => { fetch('/api/contracts/' + id).then(r => r.json()).then(d => { setContract(d); setLoading(false); }); }, [id]);

  async function hostSign() {
    if (!sigData) return alert('Please draw your signature first.');
    setSigning(true);
    const res = await fetch('/api/contracts/' + id + '/sign/host', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signatureDataUrl: sigData }) });
    const d = await res.json();
    if (res.ok) setContract((c: any) => ({ ...c, status: d.status, pdfUrl: d.pdfUrl, hostSignedAt: new Date().toISOString() }));
    else alert(d.error);
    setSigning(false);
  }

  async function sendToClient() {
    setSending(true);
    const res = await fetch('/api/contracts/' + id + '/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiryDays: 14 }) });
    const d = await res.json();
    if (res.ok) { setContract((c: any) => ({ ...c, status: 'SENT_TO_CLIENT' })); alert('Contract sent to client!'); }
    else alert(d.error);
    setSending(false);
  }

  if (loading) return <><TopBar title="Contract"/><div className="p-8 text-gray-400">Loading...</div></>;
  if (!contract) return <><TopBar title="Contract"/><div className="p-8 text-gray-400">Contract not found.</div></>;

  const canHostSign = contract.status !== 'FULLY_EXECUTED' && contract.status !== 'VOIDED' && !contract.hostSignedAt;
  const canSend = contract.status === 'DRAFT' || contract.status === 'HOST_SIGNED';

  return (
    <>
      <TopBar title={contract.title} />
      <div className="p-4 sm:p-8 max-w-4xl space-y-6">
        <Link href="/contracts" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>Contracts</Link>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3"><h2 className="text-xl sm:text-2xl font-bold">{contract.title}</h2><Badge variant={CC[contract.status]}>{(contract.status ?? '').replace(/_/g,' ')}</Badge></div>
          <div className="flex flex-wrap gap-2">
            {canSend && <Button variant="outline" onClick={sendToClient} disabled={sending}><Send className="w-4 h-4 mr-1"/>{sending ? 'Sending...' : 'Send to Client'}</Button>}
            <a href={contract.pdfUrl ?? `/api/contracts/${contract.id}/pdf`} target="_blank" rel="noopener noreferrer"><Button variant="outline"><Download className="w-4 h-4 mr-1"/>Download PDF</Button></a>
          </div>
        </div>
        {contract.status === 'CLIENT_SIGNED' && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl p-4">
            <PenLine className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800">Your countersignature is required</p>
              <p className="text-sm text-amber-700 mt-0.5">Your client has signed this contract. Scroll down to add your signature and fully execute the agreement.</p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-400 mb-1">Client</p><p className="font-medium">{contract.client?.firstName} {contract.client?.lastName}</p></div>
          <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-400 mb-1">Client Signed</p><p className="font-medium">{contract.clientSignedAt ? new Date(contract.clientSignedAt).toLocaleDateString() : 'Pending'}</p></div>
          <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-400 mb-1">Operator Signed</p><p className="font-medium">{contract.hostSignedAt ? new Date(contract.hostSignedAt).toLocaleDateString() : 'Pending'}</p></div>
        </div>
        <Card>
          <CardHeader><CardTitle>Contract Content</CardTitle></CardHeader>
          <CardContent>
            <div className="prose max-w-none text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: stripMergeTagSpans(contract.renderedContent ?? '') }} />
          </CardContent>
        </Card>
        {canHostSign && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Lock className="w-4 h-4 text-brand"/>Your Signature</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* Mode toggle */}
              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
                <button
                  onClick={() => { setSigMode('draw'); setSigData(''); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${sigMode === 'draw' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <Pen className="w-3.5 h-3.5" /> Draw
                </button>
                <button
                  onClick={() => { setSigMode('type'); setSigData(''); setTypedName(''); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${sigMode === 'type' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <Type className="w-3.5 h-3.5" /> Type Name
                </button>
              </div>

              {sigMode === 'draw' ? (
                <>
                  <p className="text-sm text-gray-600">Draw your signature below.</p>
                  <SignatureCanvas onCapture={setSigData} />
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-600">Type your full legal name — it will be rendered as your signature.</p>
                  <input
                    type="text"
                    value={typedName}
                    onChange={e => renderTypedSig(e.target.value)}
                    placeholder="Your full name"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                  />
                  {/* Signature preview */}
                  <div className="relative border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 h-20 overflow-hidden">
                    <canvas
                      ref={previewCanvasRef}
                      className="absolute inset-0 w-full h-full"
                    />
                    {!typedName && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <p className="text-gray-400 text-sm italic">Signature preview</p>
                      </div>
                    )}
                  </div>
                </>
              )}

              <Button onClick={hostSign} disabled={signing || !sigData}>
                {signing ? 'Signing...' : 'Sign Contract'}
              </Button>
            </CardContent>
          </Card>
        )}
        {contract.status === 'FULLY_EXECUTED' && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
            <Lock className="w-5 h-5 text-green-600"/>
            <div><p className="font-semibold text-green-800">Fully Executed</p><p className="text-sm text-green-700">Both parties have signed. The contract is locked and legally binding.</p></div>
          </div>
        )}
      </div>
    </>
  );
}
