'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Send, Trash2, ArrowLeft, ExternalLink, Edit2, RotateCcw, FilePlus, Eye, X, Download, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';

const QC: Record<string, any> = { DRAFT: 'default', SENT: 'info', VIEWED: 'warning', ACCEPTED: 'success', DECLINED: 'danger', EXPIRED: 'default' };
const fmt = (c: number) => fmtCents(c, quote.currency ?? 'usd');
const EDITABLE = ['DRAFT', 'SENT', 'VIEWED', 'DECLINED', 'EXPIRED'];

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [quote, setQuote] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [templateId, setTemplateId] = useState<string>('');
  const [hasContract, setHasContract] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/quotes/${id}`).then(r => r.json()),
      fetch('/api/contracts/templates').then(r => r.json()),
      fetch('/api/contracts').then(r => r.json()),
    ]).then(([q, tmpl, contracts]) => {
      setQuote(q);
      setTemplates(Array.isArray(tmpl) ? tmpl : []);
      setTemplateId(q.contractTemplateId || '');
      // Check if a contract already exists for this event
      const eventContracts = Array.isArray(contracts) ? contracts.filter((c: any) => c.eventId === q.eventId) : [];
      setHasContract(eventContracts.length > 0);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  async function sendQuote() {
    setSending(true);
    setSendError('');
    const res = await fetch(`/api/quotes/${id}/send`, { method: 'POST' });
    if (res.ok) {
      const updated = await res.json();
      setQuote((q: any) => ({ ...q, status: updated.status, sentAt: updated.sentAt }));
    } else {
      const d = await res.json().catch(() => ({}));
      setSendError(d.error || 'Failed to send quote');
    }
    setSending(false);
  }

  async function reviseQuote() {
    if (!confirm('This will reset the quote to Draft so you can edit and re-send it. The client\'s copy of the original will be superseded. Continue?')) return;
    setSaving(true);
    // PATCH with no body changes — just triggers reset to DRAFT via existing logic
    const res = await fetch(`/api/quotes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lineItems: quote.lineItems?.map((li: any) => ({ description: li.description, quantity: li.quantity, unitCents: li.unitCents, totalCents: li.totalCents })),
        notes: quote.notes, terms: quote.terms, taxRatePercent: quote.taxRatePercent,
        validUntil: quote.validUntil, discountCents: quote.discountCents,
        contractTemplateId: templateId || null,
      }),
    });
    if (res.ok) router.push(`/quotes/${id}/edit`);
    setSaving(false);
  }

  async function saveTemplate() {
    setSaving(true);
    const res = await fetch(`/api/quotes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lineItems: quote.lineItems?.map((li: any) => ({ description: li.description, quantity: li.quantity, unitCents: li.unitCents, totalCents: li.totalCents })),
        notes: quote.notes, terms: quote.terms, taxRatePercent: quote.taxRatePercent,
        validUntil: quote.validUntil, discountCents: quote.discountCents,
        contractTemplateId: templateId || null,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setQuote((q: any) => ({ ...q, contractTemplateId: updated.contractTemplateId, contractTemplate: updated.contractTemplate, status: updated.status }));
    }
    setSaving(false);
  }

  async function previewContract() {
    setPreviewing(true);
    // Save current templateId first if it changed
    const res = await fetch(`/api/quotes/${id}/preview-contract`);
    if (res.ok) {
      const { html, templateName } = await res.json();
      setPreviewHtml(html);
      setPreviewName(templateName);
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.error || 'Could not load preview');
    }
    setPreviewing(false);
  }

  async function generateContract() {
    setGenerating(true);
    const res = await fetch(`/api/quotes/${id}/generate-contract`, { method: 'POST' });
    if (res.ok) { setHasContract(true); alert('Contract created. Find it in the Contracts section or the client portal.'); }
    else { const d = await res.json(); alert(d.error || 'Failed to generate contract'); }
    setGenerating(false);
  }

  async function deleteQuote() {
    if (!confirm('Delete this quote? This cannot be undone.')) return;
    setDeleting(true);
    await fetch(`/api/quotes/${id}`, { method: 'DELETE' });
    router.push('/quotes');
  }

  if (loading) return (
    <>
      <TopBar title="Quote" />
      <div className="p-8 text-center text-gray-400 pt-20">Loading...</div>
    </>
  );

  if (!quote || quote.error) return (
    <>
      <TopBar title="Quote" />
      <div className="p-8 text-center text-gray-400 pt-20">Quote not found.</div>
    </>
  );

  const portalUrl = `/portal/${quote.event?.portalToken}?tab=quote`;
  const canEdit = EDITABLE.includes(quote.status);
  const isDraft = quote.status === 'DRAFT';

  return (
    <>
      <TopBar title={`Quote ${quote.quoteNumber}`} />
      <div className="p-4 sm:p-8 max-w-3xl space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Link href="/quotes" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-4 h-4" /> Back to Quotes
          </Link>
          <div className="flex gap-2 flex-wrap">
            {isDraft && (
              <Link href={`/quotes/${id}/edit`}>
                <Button variant="outline">
                  <Edit2 className="w-4 h-4 mr-1.5" /> Edit
                </Button>
              </Link>
            )}
            {isDraft && (
              <Button onClick={sendQuote} disabled={sending}>
                <Send className="w-4 h-4 mr-1.5" />
                {sending ? 'Sending...' : 'Send to Client'}
              </Button>
            )}
            {!isDraft && canEdit && (
              <Button variant="outline" onClick={reviseQuote} disabled={saving}>
                <RotateCcw className="w-4 h-4 mr-1.5" />
                {saving ? 'Resetting...' : 'Revise Quote'}
              </Button>
            )}
            {quote.status === 'ACCEPTED' && !hasContract && (
              <Button variant="outline" onClick={generateContract} disabled={generating} className="text-blue-600 border-blue-200 hover:bg-blue-50">
                <FilePlus className="w-4 h-4 mr-1.5" />
                {generating ? 'Generating...' : 'Generate Contract'}
              </Button>
            )}
            <a href={`/api/quotes/${id}/pdf`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline"><Download className="w-4 h-4 mr-1.5"/>Download PDF</Button>
            </a>
            {quote.event?.portalToken && (
              <a href={portalUrl} target="_blank" rel="noreferrer">
                <Button variant="outline">
                  <ExternalLink className="w-4 h-4 mr-1.5" /> View Portal
                </Button>
              </a>
            )}
            {canEdit && (
              <Button variant="outline" onClick={deleteQuote} disabled={deleting} className="text-red-600 border-red-200 hover:bg-red-50">
                <Trash2 className="w-4 h-4 mr-1.5" /> Delete
              </Button>
            )}
          </div>
        </div>

        {sendError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {sendError}
            {sendError.includes('Stripe') && (
              <a href="/settings/billing" className="ml-2 underline font-medium">Go to Settings → Billing</a>
            )}
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{quote.quoteNumber}</CardTitle>
                {quote.event && <p className="text-sm text-gray-500 mt-1">{quote.event.title}</p>}
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {quote.isCorporate && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                    <Building2 className="w-3 h-3" />Corporate
                  </span>
                )}
                <Badge variant={QC[quote.status]}>{quote.status}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 uppercase font-medium mb-1">Client</p>
              <p>{quote.client?.firstName} {quote.client?.lastName}</p>
              <p className="text-gray-500">{quote.client?.email}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase font-medium mb-1">Created</p>
              <p>{format(new Date(quote.createdAt), 'MMM d, yyyy')}</p>
            </div>
            {quote.validUntil && (
              <div>
                <p className="text-xs text-gray-400 uppercase font-medium mb-1">Valid Until</p>
                <p>{format(new Date(quote.validUntil), 'MMM d, yyyy')}</p>
              </div>
            )}
            {quote.sentAt && (
              <div>
                <p className="text-xs text-gray-400 uppercase font-medium mb-1">Sent</p>
                <p>{format(new Date(quote.sentAt), 'MMM d, yyyy')}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Schedule */}
        <Card>
          <CardHeader><CardTitle>Payment Schedule</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {quote.paymentType === 'deposit' ? (
              <div className="space-y-2">
                <p className="text-gray-600">Deposit + Balance — client pays a deposit upfront, balance before the event.</p>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400 uppercase font-medium mb-1">Deposit ({quote.depositPercent}%)</p>
                    <p className="font-bold text-lg">{fmt(Math.round(quote.totalCents * (quote.depositPercent / 100)))}</p>
                    <p className="text-xs text-gray-400">due on signing</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400 uppercase font-medium mb-1">Balance</p>
                    <p className="font-bold text-lg">{fmt(quote.totalCents - Math.round(quote.totalCents * (quote.depositPercent / 100)))}</p>
                    <p className="text-xs text-gray-400">due before event</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-gray-600">Full payment — invoice for the full amount ({fmt(quote.totalCents)}) is created when the contract is signed.</p>
            )}
          </CardContent>
        </Card>

        {/* Contract Template */}
        <Card>
          <CardHeader>
            <CardTitle>Contract on Acceptance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-500">
              When the client accepts this quote, a contract will be auto-generated from the selected template.
            </p>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <select
                  value={templateId}
                  onChange={e => setTemplateId(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  disabled={quote.status === 'ACCEPTED'}
                >
                  <option value="">— Use default template —</option>
                  {templates.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.isDefault ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              {templateId !== (quote.contractTemplateId || '') && quote.status !== 'ACCEPTED' && (
                <Button size="sm" onClick={saveTemplate} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              )}
              {(templateId || quote.contractTemplateId || templates.length > 0) && (
                <Button size="sm" variant="outline" onClick={previewContract} disabled={previewing}>
                  <Eye className="w-4 h-4 mr-1" />
                  {previewing ? 'Loading...' : 'Preview'}
                </Button>
              )}
            </div>
            {quote.contractTemplate && (
              <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
                Using: <strong>{quote.contractTemplate.name}</strong>
              </p>
            )}
            {!quote.contractTemplateId && (
              <p className="text-xs text-gray-400">No template selected — will use the default template when accepted.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Line Items</CardTitle></CardHeader>
          <CardContent className="p-0">
            {/* Mobile: stacked card per line item */}
            <div className="sm:hidden divide-y">
              {quote.lineItems?.map((li: any) => (
                <div key={li.id} className="px-5 py-4">
                  <p className="text-sm text-gray-800 mb-2">{li.description}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>Qty: <strong className="text-gray-700">{li.quantity}</strong></span>
                    <span>Unit: <strong className="text-gray-700">{fmt(li.unitCents)}</strong></span>
                    <span className="ml-auto font-semibold text-sm text-gray-900">{fmt(li.totalCents)}</span>
                  </div>
                </div>
              ))}
              <div className="px-5 py-3 bg-gray-50 border-t space-y-1.5">
                <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>{fmt(quote.subtotalCents)}</span></div>
                {quote.taxAmountCents > 0 && <div className="flex justify-between text-sm text-gray-500"><span>Tax ({quote.taxRatePercent}%)</span><span>{fmt(quote.taxAmountCents)}</span></div>}
                <div className="flex justify-between font-bold text-base pt-1 border-t"><span>Total</span><span>{fmt(quote.totalCents)}</span></div>
              </div>
            </div>
            {/* Desktop: table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full min-w-[400px]">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs font-medium text-gray-500 uppercase">
                    <th className="text-left px-6 py-3">Description</th>
                    <th className="text-right px-6 py-3">Qty</th>
                    <th className="text-right px-6 py-3">Unit</th>
                    <th className="text-right px-6 py-3">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.lineItems?.map((li: any) => (
                    <tr key={li.id} className="border-b last:border-0">
                      <td className="px-6 py-3 text-sm">{li.description}</td>
                      <td className="px-6 py-3 text-sm text-right">{li.quantity}</td>
                      <td className="px-6 py-3 text-sm text-right">{fmt(li.unitCents)}</td>
                      <td className="px-6 py-3 text-sm text-right font-medium">{fmt(li.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-gray-50">
                  <tr>
                    <td colSpan={3} className="px-6 py-2 text-sm text-right text-gray-500">Subtotal</td>
                    <td className="px-6 py-2 text-sm text-right">{fmt(quote.subtotalCents)}</td>
                  </tr>
                  {quote.taxAmountCents > 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-2 text-sm text-right text-gray-500">Tax ({quote.taxRatePercent}%)</td>
                      <td className="px-6 py-2 text-sm text-right">{fmt(quote.taxAmountCents)}</td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan={3} className="px-6 py-3 text-right font-bold">Total</td>
                    <td className="px-6 py-3 text-right font-bold text-lg">{fmt(quote.totalCents)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>

        {(quote.notes || quote.terms) && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              {quote.notes && (
                <div>
                  <p className="text-xs text-gray-400 uppercase font-medium mb-1">Notes</p>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{quote.notes}</p>
                </div>
              )}
              {quote.terms && (
                <div>
                  <p className="text-xs text-gray-400 uppercase font-medium mb-1">Terms &amp; Conditions</p>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{quote.terms}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Contract Preview Modal */}
      {previewHtml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setPreviewHtml(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium">Contract Preview</p>
                <p className="font-bold text-gray-900">{previewName}</p>
              </div>
              <button onClick={() => setPreviewHtml(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 prose max-w-none text-sm" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            <div className="px-6 py-4 border-t text-xs text-gray-400 bg-gray-50 rounded-b-2xl">
              Preview uses current event data. Unresolved tags indicate missing event fields (e.g. start time, venue city).
            </div>
          </div>
        </div>
      )}
    </>
  );
}
