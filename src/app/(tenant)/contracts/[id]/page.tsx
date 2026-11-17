
'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SignatureCanvas } from '@/components/contracts/SignatureCanvas';
import { ArrowLeft, Send, Lock, Download, PenLine, Pen, Type, CheckCircle2, Trash2, Pencil, Calendar, Ban } from 'lucide-react';
import Link from 'next/link';
import { stripMergeTagSpans } from '@/lib/contracts/merge-tags';
import { initialBoxesHtml, savedInitials } from '@/lib/contracts/initials';
import { useRef, useCallback } from 'react';
import EmailTemplateEditor from '@/components/email/EmailTemplateEditor';
import { clientDisplayName } from '@/lib/clientName';
import { MoreMenu } from '@/components/ui/MoreMenu';

const CC: Record<string, any> = { DRAFT:'default', SENT_TO_CLIENT:'info', CLIENT_SIGNED:'warning', HOST_SIGNED:'warning', FULLY_EXECUTED:'success', VOIDED:'danger' };

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  // Opened from an event: Back and Delete keep the operator on that event
  const fromEvent = useSearchParams().get('from') === 'event';
  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sigMode, setSigMode] = useState<'draw' | 'type'>('draw');
  const [sigData, setSigData] = useState('');
  const [typedName, setTypedName] = useState('');
  const [signing, setSigning] = useState(false);
  const [sending, setSending] = useState(false);
  const [markingExecuted, setMarkingExecuted] = useState(false);
  const [showExecuteForm, setShowExecuteForm] = useState(false);
  const [signingNote, setSigningNote] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [saving, setSaving] = useState(false);
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

  async function markExecuted() {
    setMarkingExecuted(true);
    const res = await fetch('/api/contracts/' + id + '/mark-executed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signingNote: signingNote.trim() || null }),
    });
    const d = await res.json();
    if (res.ok) {
      setContract((c: any) => ({ ...c, status: 'FULLY_EXECUTED', clientSignedAt: c.clientSignedAt ?? new Date().toISOString(), hostSignedAt: c.hostSignedAt ?? new Date().toISOString(), signingNote: signingNote.trim() || null }));
      setShowExecuteForm(false);
      if (d.invoiceCreated) alert('Contract executed. An invoice has been automatically created.');
    } else alert(d.error);
    setMarkingExecuted(false);
  }

  async function deleteContract() {
    setDeleting(true);
    const res = await fetch('/api/contracts/' + id, { method: 'DELETE' });
    const d = await res.json();
    if (res.ok) router.push(fromEvent && contract?.eventId ? `/events/${contract.eventId}` : '/contracts');
    else { alert(d.error); setDeleting(false); setShowDeleteConfirm(false); }
  }

  async function voidContract() {
    setVoiding(true);
    const res = await fetch('/api/contracts/' + id + '/void', { method: 'POST' });
    const d = await res.json();
    if (res.ok) setContract((c: any) => ({ ...c, status: 'VOIDED' }));
    else alert(d.error);
    setVoiding(false);
    setShowVoidConfirm(false);
  }

  function openEditor() {
    setEditTitle(contract.title);
    setEditBody(contract.renderedContent ?? '');
    setShowEditor(true);
  }

  async function saveEdit() {
    setSaving(true);
    const res = await fetch('/api/contracts/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editTitle.trim(), renderedContent: editBody }),
    });
    const d = await res.json();
    if (res.ok) {
      setContract((c: any) => ({ ...c, title: d.title, renderedContent: d.renderedContent }));
      setShowEditor(false);
    } else alert(d.error);
    setSaving(false);
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
        <Link href={fromEvent && contract.eventId ? `/events/${contract.eventId}` : '/contracts'} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>{fromEvent && contract.eventId ? 'Back to Event' : 'Back to Contracts'}</Link>
        {/* Header: title, status and client on the left; main actions and the ••• menu on the right (same as events) */}
        <div className="flex flex-col lg:flex-row gap-4 lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h2 className="text-xl sm:text-2xl font-bold">{contract.title}</h2>
              <Badge variant={CC[contract.status]}>{(contract.status ?? '').replace(/_/g,' ')}</Badge>
            </div>
            <p className="text-gray-500 text-sm">{[contract.client && clientDisplayName(contract.client), contract.event?.title].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:flex-shrink-0">
            {contract.status === 'DRAFT' && (
              <Button variant="outline" size="sm" onClick={openEditor}><Pencil className="w-3.5 h-3.5 mr-1.5"/>Edit</Button>
            )}
            {canSend && <Button size="sm" onClick={sendToClient} disabled={sending}><Send className="w-3.5 h-3.5 mr-1.5"/>{sending ? 'Sending...' : 'Send to Client'}</Button>}
            {contract.status !== 'FULLY_EXECUTED' && contract.status !== 'VOIDED' && (
              <Button variant="outline" size="sm" onClick={() => setShowExecuteForm(f => !f)} className="text-green-700 border-green-200 hover:bg-green-50">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5"/>Mark as Executed
              </Button>
            )}
            <MoreMenu items={[
              { label: 'Download PDF', icon: Download, href: contract.pdfUrl ?? `/api/contracts/${contract.id}/pdf`, external: true },
              contract.eventId && { label: 'View Event', icon: Calendar, href: `/events/${contract.eventId}` },
              contract.status !== 'VOIDED' && 'divider',
              ['DRAFT', 'SENT_TO_CLIENT'].includes(contract.status) && { label: 'Delete Contract', icon: Trash2, danger: true, onClick: () => { setShowVoidConfirm(false); setShowDeleteConfirm(true); } },
              !['DRAFT', 'SENT_TO_CLIENT', 'VOIDED'].includes(contract.status) && { label: 'Void Contract', icon: Ban, danger: true, onClick: () => { setShowDeleteConfirm(false); setShowVoidConfirm(true); } },
            ]} />
          </div>
        </div>
        {showExecuteForm && contract.status !== 'FULLY_EXECUTED' && contract.status !== 'VOIDED' && (
          <div className="border border-green-200 bg-green-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-green-800">Mark as Fully Executed</p>
            <p className="text-xs text-green-700">Use this when both parties signed outside the portal — in person, DocuSign, or another tool. An invoice will be created automatically if one doesn&apos;t exist.</p>
            <div>
              <label className="block text-xs font-medium text-green-800 mb-1">How was it signed? <span className="font-normal text-green-600">(optional)</span></label>
              <input
                type="text"
                value={signingNote}
                onChange={e => setSigningNote(e.target.value)}
                placeholder="e.g. Signed in person at venue, DocuSign sent via email…"
                className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400/40"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={markExecuted} disabled={markingExecuted} className="bg-green-600 hover:bg-green-700 text-white">
                <CheckCircle2 className="w-4 h-4 mr-1.5"/>{markingExecuted ? 'Processing…' : 'Confirm — Mark Executed'}
              </Button>
              <Button variant="outline" onClick={() => setShowExecuteForm(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {showDeleteConfirm && (
          <div className="border border-red-200 bg-red-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-red-800">Delete this contract?</p>
            <p className="text-xs text-red-700">This will permanently delete the contract. This cannot be undone.</p>
            <div className="flex gap-2">
              <Button onClick={deleteContract} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
                <Trash2 className="w-4 h-4 mr-1.5"/>{deleting ? 'Deleting…' : 'Yes, Delete'}
              </Button>
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            </div>
          </div>
        )}
        {showVoidConfirm && (
          <div className="border border-red-200 bg-red-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-red-800">Void this contract?</p>
            <p className="text-xs text-red-700">The contract will be marked Voided and kept on file. It can no longer be signed or edited. This cannot be undone.</p>
            <div className="flex gap-2">
              <Button onClick={voidContract} disabled={voiding} className="bg-red-600 hover:bg-red-700 text-white">
                <Trash2 className="w-4 h-4 mr-1.5"/>{voiding ? 'Voiding…' : 'Yes, Void'}
              </Button>
              <Button variant="outline" onClick={() => setShowVoidConfirm(false)}>Cancel</Button>
            </div>
          </div>
        )}

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
          <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-400 mb-1">Client</p><p className="font-medium">{clientDisplayName(contract.client)}</p></div>
          <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-400 mb-1">Client Signed</p><p className="font-medium">{contract.clientSignedAt ? new Date(contract.clientSignedAt).toLocaleDateString() : 'Pending'}</p></div>
          <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-400 mb-1">Operator Signed</p><p className="font-medium">{contract.hostSignedAt ? new Date(contract.hostSignedAt).toLocaleDateString() : 'Pending'}</p></div>
        </div>
        {contract.signingNote && (
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm">
            <p className="text-xs text-gray-400 mb-0.5">Signing Note</p>
            <p className="text-gray-700">{contract.signingNote}</p>
          </div>
        )}
        {showEditor && contract.status === 'DRAFT' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Pencil className="w-4 h-4"/>Edit Contract</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contract Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contract Body</label>
                <EmailTemplateEditor value={editBody} onChange={setEditBody} initialBoxes/>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveEdit} disabled={saving || !editTitle.trim()}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </Button>
                <Button variant="outline" onClick={() => setShowEditor(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>Contract Content</CardTitle></CardHeader>
          <CardContent>
            <div className="prose max-w-none text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: initialBoxesHtml(stripMergeTagSpans(contract.renderedContent ?? ''), savedInitials(contract.clientInitials).map(i => i.initials)) }} />
            {savedInitials(contract.clientInitials).length > 0 && (
              <div className="mt-6 border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Client initials</p>
                <ul className="space-y-1 text-sm">
                  {savedInitials(contract.clientInitials).map((i, n) => (
                    <li key={n} className="flex flex-wrap gap-x-3 text-gray-600">
                      <span className="font-mono font-semibold text-gray-900">{i.initials}</span>
                      <span>{i.label}</span>
                      <span className="text-gray-400">{new Date(i.initialedAt).toLocaleString()}{i.ipAddress ? ' · IP ' + i.ipAddress : ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
