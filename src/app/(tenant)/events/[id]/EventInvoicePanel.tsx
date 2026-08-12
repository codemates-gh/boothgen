'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fmtCents } from '@/lib/utils';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, Undo2 } from 'lucide-react';

const IC: Record<string, any> = { DRAFT: 'default', SENT: 'info', PARTIALLY_PAID: 'warning', PAID: 'success', OVERDUE: 'danger', CANCELLED: 'danger' };
const MC: Record<string, any> = { PENDING: 'default', PAID: 'success', REFUNDED: 'default' };

const PAYMENT_METHODS = ['Credit Card', 'Bank Transfer', 'Check', 'Other'];

interface Milestone {
  id: string;
  label: string;
  amountCents: number;
  dueDate: string;
  status: string;
  paidAt: string | null;
  paymentMethod: string | null;
}

interface InvoiceData {
  id: string;
  invoiceNumber: string;
  totalCents: number;
  balanceDueCents: number;
  status: string;
  currency: string;
  milestones: Milestone[];
}

interface Props {
  invoices: InvoiceData[];
}

function MilestoneRow({ milestone, invoiceId, currency, onUpdate }: {
  milestone: Milestone;
  invoiceId: string;
  currency: string;
  onUpdate: (milestoneId: string, milestoneStatus: string, invoiceStatus: string) => void;
}) {
  const fmt = (c: number) => fmtCents(c, currency);
  const [expanded, setExpanded] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Credit Card');
  const [loading, setLoading] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState('');

  const isPaid = milestone.status === 'PAID';

  async function undoPayment() {
    setUndoing(true);
    setError('');
    const res = await fetch(`/api/invoices/${invoiceId}/milestones/${milestone.id}/unmark-paid`, { method: 'POST' });
    const d = await res.json();
    if (res.ok) onUpdate(milestone.id, 'PENDING', d.invoiceStatus);
    else setError(d.error || 'Failed to undo payment');
    setUndoing(false);
  }

  async function markPaid() {
    setLoading(true);
    setError('');
    const res = await fetch(`/api/invoices/${invoiceId}/milestones/${milestone.id}/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentMethod }),
    });
    const d = await res.json();
    if (res.ok) {
      onUpdate(milestone.id, 'PAID', d.invoiceStatus);
      setExpanded(false);
    } else {
      if (d.upgradeRequired) setError('PRO plan required to mark payments as paid.');
      else setError(d.error || 'Failed to mark as paid');
    }
    setLoading(false);
  }

  return (
    <div className="border-t border-gray-100">
      <div className="flex items-center gap-3 px-6 py-2.5 text-sm">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: isPaid ? '#16a34a' : '#d97706' }} />
        <span className="flex-1 text-gray-700">{milestone.label}</span>
        <span className="text-gray-500 tabular-nums">{fmt(milestone.amountCents)}</span>
        <span className="text-xs text-gray-400 w-24 text-right hidden sm:block">
          {isPaid && milestone.paidAt
            ? `Paid ${format(new Date(milestone.paidAt), 'MMM d')}`
            : `Due ${format(new Date(milestone.dueDate), 'MMM d, yyyy')}`}
        </span>
        {isPaid ? (
          <div className="flex items-center gap-1.5">
            <Badge variant="success" className="text-xs">{milestone.paymentMethod ?? 'Paid'}</Badge>
            <button
              onClick={undoPayment}
              disabled={undoing}
              title="Undo payment"
              className="text-gray-300 hover:text-orange-500 transition-colors disabled:opacity-40"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
          >
            Mark Paid {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>
      {expanded && !isPaid && (
        <div className="px-6 pb-3 flex items-center gap-2 flex-wrap">
          <select
            value={paymentMethod}
            onChange={e => setPaymentMethod(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white"
          >
            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <Button size="sm" onClick={markPaid} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white">
            {loading ? 'Saving…' : 'Confirm'}
          </Button>
          <button onClick={() => setExpanded(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
          {error && <p className="w-full text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

export default function EventInvoicePanel({ invoices }: Props) {
  const [invoiceData, setInvoiceData] = useState<InvoiceData[]>(invoices);

  function handleMilestoneUpdate(invoiceId: string, milestoneId: string, newMilestoneStatus: string, newInvoiceStatus: string) {
    setInvoiceData(prev => prev.map(inv => {
      if (inv.id !== invoiceId) return inv;
      const updatedMilestones = inv.milestones.map(m =>
        m.id === milestoneId
          ? { ...m, status: newMilestoneStatus, paidAt: newMilestoneStatus === 'PAID' ? new Date().toISOString() : null, paymentMethod: newMilestoneStatus === 'PAID' ? m.paymentMethod : null }
          : m
      );
      const newBalance = updatedMilestones
        .filter(m => m.status !== 'PAID')
        .reduce((sum, m) => sum + m.amountCents, 0);
      return { ...inv, milestones: updatedMilestones, status: newInvoiceStatus, balanceDueCents: newBalance };
    }));
  }

  return (
    <>
      {invoiceData.map(inv => {
        const fmt = (c: number) => fmtCents(c, inv.currency ?? 'usd');
        const hasMilestones = inv.milestones.length > 0;
        return (
          <div key={inv.id} className="border-b last:border-0">
            <div className="flex items-center gap-3 px-6 py-3 text-sm hover:bg-gray-50">
              <span className="font-medium w-24">{inv.invoiceNumber}</span>
              <span className="text-gray-600 hidden sm:block w-24">{fmt(inv.totalCents)}</span>
              <span className="text-gray-600 w-24">{fmt(inv.balanceDueCents)} due</span>
              <Badge variant={IC[inv.status]}>{inv.status}</Badge>
              <Link href={'/invoices/' + inv.id} className="ml-auto">
                <Button variant="ghost" size="sm">View</Button>
              </Link>
            </div>
            {hasMilestones && inv.milestones.map(m => (
              <MilestoneRow
                key={m.id}
                milestone={m}
                invoiceId={inv.id}
                currency={inv.currency ?? 'usd'}
                onUpdate={(milestoneId, milestoneStatus, invoiceStatus) => handleMilestoneUpdate(inv.id, milestoneId, milestoneStatus, invoiceStatus)}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}
